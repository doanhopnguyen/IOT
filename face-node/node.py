"""Nhận diện tại camera cửa; đăng ký khuôn mặt được xử lý trong ứng dụng người dùng."""
import argparse
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import threading
import time
import uuid

from backend import Backend
from config import Config, MODEL
from matching import RecognitionGate, TemplateCache

LOG = logging.getLogger("face-node")


class Publisher:
    def __init__(self, config):
        import paho.mqtt.client as mqtt
        self.config = config
        self.connected = threading.Event()
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id="face-" + config.device_uid, clean_session=True)
        if config.mqtt_username:
            self.client.username_pw_set(config.mqtt_username, config.mqtt_password)
        self.client.max_inflight_messages_set(1)
        self.client.max_queued_messages_set(1)
        self.client.on_connect = self._connected
        self.client.on_disconnect = lambda *_: self.connected.clear()
        self.client.reconnect_delay_set(1, 10)
        self.client.connect_async(config.mqtt_host, config.mqtt_port, 30)
        self.client.loop_start()

    def _connected(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self.connected.set()

    def publish(self, kind, payload):
        if not self.connected.is_set():
            raise RuntimeError("MQTT đã ngắt kết nối; sự kiện đã bị hủy.")
        body = dict(payload, deviceSecret=self.config.device_secret)
        result = self.client.publish(f"{self.config.mqtt_prefix}/{self.config.device_uid}/{kind}",
                                     json.dumps(body, allow_nan=False), qos=1, retain=False)
        result.wait_for_publish(timeout=3)
        if not result.is_published():
            raise RuntimeError("MQTT chưa xác nhận gửi sự kiện.")

    def face(self, match, live):
        self.publish("face", {
            "schemaVersion": 1, "eventUuid": str(uuid.uuid4()),
            "occurredAt": datetime.now(timezone.utc).isoformat(),
            "credentialId": match.credential_id if match else None,
            "score": match.score if match else 0.0,
            "model": MODEL, "liveness": live,
        })

    def close(self):
        self.client.disconnect()
        self.client.loop_stop()


class LatestCamera:
    """Đọc liên tục camera/RTSP để xử lý khung hình mới nhất, không dồn hàng đợi."""
    def __init__(self, source):
        self.source = source
        self.capture = self._open()
        if not self.capture.isOpened():
            raise RuntimeError("Không mở được camera hoặc luồng hình ảnh.")
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.frame, self.received_at, self.serial = None, 0.0, 0
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()

    def _open(self):
        import cv2
        if "://" in self.source:
            capture = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG,
                                      [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000,
                                       cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000])
        else:
            capture = cv2.VideoCapture(int(self.source) if self.source.isdecimal() else self.source)
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return capture

    def _read(self):
        retry = 1
        try:
            while not self.stopped.is_set():
                ok, frame = self.capture.read()
                if not ok:
                    with self.lock:
                        self.frame, self.received_at = None, 0.0
                    self.capture.release()
                    if self.stopped.wait(retry):
                        break
                    self.capture = self._open()
                    retry = min(10, retry * 2)
                    continue
                retry = 1
                with self.lock:
                    self.frame, self.received_at = frame, time.monotonic()
                    self.serial += 1
        finally:
            self.capture.release()

    def read(self):
        with self.lock:
            return self.serial, self.received_at, None if self.frame is None else self.frame.copy()

    def close(self):
        self.stopped.set()
        # Luồng đọc tự giải phóng camera; không giải phóng khi đang đọc khung hình.
        self.thread.join(timeout=8)


def run(config, engine, camera=False, video=None, show=True):
    import cv2
    config.require_device()
    api, cache = Backend(config), TemplateCache()
    gate = RecognitionGate(config.stable_frames, config.cooldown)
    publisher = Publisher(config)
    capture = LatestCamera(config.camera_source) if camera else None
    recording = cv2.VideoCapture(video) if video else None
    if recording is not None and not recording.isOpened():
        publisher.close()
        raise RuntimeError("Không mở được video đã ghi.")
    next_sync, last_frame, last_unknown = 0.0, -1, -1e10
    if config.allow_unverified_liveness:
        LOG.warning("CHẾ ĐỘ PHÁT TRIỂN: cho phép bỏ qua xác minh người thật; không chống giả mạo.")
    try:
        while True:
            now = time.monotonic()
            if now >= next_sync:
                try:
                    api.sync(cache)
                    if publisher.connected.is_set():
                        publisher.publish("status", {"schemaVersion": 1, "model": MODEL})
                except Exception as exc:
                    cache.clear()
                    gate.reset()
                    # Không ghi header, nội dung phản hồi, URL chứa thông tin đăng nhập hoặc ảnh.
                    LOG.warning("Không đồng bộ được máy chủ (%s); đã tắt nhận diện.", type(exc).__name__)
                next_sync = time.monotonic() + config.sync_seconds
            if not camera and not video:
                time.sleep(0.1)
                continue
            if recording is not None:
                ok, frame = recording.read()
                if not ok:
                    break
                captured_at = time.monotonic()
            else:
                serial, captured_at, frame = capture.read()
                if serial == last_frame or frame is None:
                    if time.monotonic() - captured_at > config.max_frame_age:
                        gate.reset()
                    time.sleep(0.02)
                    continue
                last_frame = serial
            if time.monotonic() - captured_at > config.max_frame_age:
                gate.reset()
                continue
            if not cache.valid or time.monotonic() - cache.refreshed_at > config.sync_seconds * 3:
                gate.reset()
                label = "Máy chủ không khả dụng - không mở cửa"
            elif not publisher.connected.is_set():
                gate.reset()
                label = "MQTT không khả dụng - không mở cửa"
            else:
                try:
                    embedding, live, error = engine.analyze(frame)
                    # Bỏ khung hình nếu quá trình nhận diện mất quá nhiều thời gian.
                    if time.monotonic() - captured_at > config.max_frame_age:
                        gate.reset()
                        continue
                    match = cache.match(embedding, config.threshold, config.margin) if embedding is not None else None
                    live_label = {"LIVE": "NGƯỜI THẬT", "SPOOF": "ẢNH GIẢ", "NOT_CHECKED": "CHƯA XÁC MINH"}.get(live, live)
                    label = error or (f"Tài khoản dự kiến {match.account_id} ({match.score:.3f}) - {live_label}"
                                      if match else f"KHÔNG NHẬN DIỆN - {live_label}")
                    if gate.observe(match, live, config.allow_unverified_liveness):
                        publisher.face(match, live)
                        LOG.info("Đã gửi sự kiện nhận diện; máy chủ sẽ quyết định quyền và trạng thái cửa.")
                    elif (match is None and (embedding is not None or live == "SPOOF")
                          and now - last_unknown >= config.cooldown):
                        publisher.face(None, live)
                        last_unknown = now
                except Exception as exc:
                    gate.reset()
                    label = "Nhận diện thất bại - không mở cửa"
                    LOG.warning("Đã bỏ qua khung hình (%s).", type(exc).__name__)
            if show:
                cv2.putText(frame, label[:100], (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 2)
                cv2.imshow("Camera cửa Smart Door - nhấn Q để dừng", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
        return True
    finally:
        publisher.close()
        if capture:
            capture.close()
        if recording is not None:
            recording.release()
        if show:
            cv2.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--camera", action="store_true", help="Mở webcam hoặc RTSP đã cấu hình để nhận diện")
    modes.add_argument("--video", help="Dùng video đã ghi để tích hợp; không xác minh người thật")
    modes.add_argument("--image", type=Path, help="Trích xuất đặc trưng cục bộ; chỉ in số chiều và độ dài vector")
    modes.add_argument("--download-models", action="store_true", help="Tải model nhận diện đã chọn")
    parser.add_argument("--accept-model-license", action="store_true", help="Xác nhận đã đọc điều khoản model")
    parser.add_argument("--no-preview", action="store_true", help="Không mở cửa sổ hình ảnh camera")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    config = Config.from_env()
    from engine import Engine, download_models
    if args.download_models:
        if not args.accept_model_license:
            parser.error("Trọng số dựng sẵn chỉ dùng cho nghiên cứu phi thương mại; hãy thêm --accept-model-license.")
        print(json.dumps(download_models(config), indent=2))
        return 0
    engine = Engine(config)
    if args.image:
        vector = engine.embed_image(args.image.read_bytes())
        print(json.dumps({"model": MODEL, "dimensions": int(vector.size), "norm": float((vector @ vector) ** 0.5)}))
        return 0
    return 0 if run(config, engine, camera=args.camera, video=args.video,
                    show=not args.no_preview) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
