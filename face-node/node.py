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
        if config.mqtt_tls:
            self.client.tls_set(ca_certs=config.mqtt_ca or None)
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


def draw_preview(frame, boxes, message, detail, color):
    import cv2
    width = frame.shape[1]
    for index, box in enumerate(boxes):
        x1, y1, x2, y2 = box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
        name = "FACE" if len(boxes) == 1 else f"FACE {index + 1}"
        cv2.putText(frame, name, (x1, max(24, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
    cv2.rectangle(frame, (0, 0), (width, 110), (20, 27, 37), -1)
    cv2.rectangle(frame, (0, 106), (width, 112), color, -1)
    cv2.putText(frame, "SMART DOOR  |  FACE CHECK", (22, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (235, 242, 250), 2)
    cv2.putText(frame, message[:54], (22, 73), cv2.FONT_HERSHEY_SIMPLEX,
                0.9, color, 2)
    cv2.putText(frame, detail[:72], (22, 96), cv2.FONT_HERSHEY_SIMPLEX,
                0.48, (205, 215, 225), 1)
    return frame


def run(config, engine, camera=False, video=None, show=True):
    import cv2
    config.require_device()
    api, cache = Backend(config), TemplateCache()
    gate = RecognitionGate(config.stable_frames, config.cooldown)
    publisher = Publisher(config)
    capture, recording = None, None
    window = "Smart Door - Face Check"
    try:
        capture = LatestCamera(config.camera_source) if camera else None
        recording = cv2.VideoCapture(video) if video else None
        if recording is not None and not recording.isOpened():
            raise RuntimeError("Khong mo duoc video da ghi.")
        if show:
            cv2.namedWindow(window, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(window, 960, 600)
        next_sync, last_frame, last_unknown = 0.0, -1, -1e10
        if config.allow_unverified_liveness:
            LOG.warning("DEVELOPMENT MODE: liveness can be bypassed; do not use for production.")
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
                    # Never log headers, response bodies, credential URLs, or images.
                    LOG.warning("Backend sync failed; recognition disabled (%s).", type(exc).__name__)
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
                        if show:
                            if frame is None:
                                import numpy as np
                                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                            draw_preview(frame, [], "CAMERA SIGNAL LOST", "CHECK CAMERA CONNECTION", (45, 65, 235))
                            cv2.imshow(window, frame)
                    if show and cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                    time.sleep(0.02)
                    continue
                last_frame = serial
            if time.monotonic() - captured_at > config.max_frame_age:
                gate.reset()
                continue

            boxes, match = [], None
            message, detail, color = "CHO KHUON MAT", "GIU MAT TRONG KHUNG HINH", (0, 190, 255)
            if not cache.valid or time.monotonic() - cache.refreshed_at > config.sync_seconds * 3:
                gate.reset()
                message, detail, color = "TU CHOI - MAY CHU KHONG SAN SANG", "KHONG THE KIEM TRA QUYEN KHUON MAT", (45, 65, 235)
            elif not publisher.connected.is_set():
                gate.reset()
                message, detail, color = "TU CHOI - MAT KET NOI", "KIEM TRA KET NOI MQTT", (45, 65, 235)
            else:
                try:
                    embedding, live, error = engine.analyze(frame)
                    boxes = getattr(engine, "last_boxes", [])
                    if time.monotonic() - captured_at > config.max_frame_age:
                        gate.reset()
                        continue
                    match = cache.match(embedding, config.threshold, config.margin) if embedding is not None else None
                    if not boxes:
                        gate.reset()
                        message, detail, color = "CHO KHUON MAT", "GIU MAT TRONG KHUNG HINH", (0, 190, 255)
                    elif len(boxes) != 1:
                        gate.reset()
                        message, detail, color = "TU CHOI - CHI MOT KHUON MAT", "CHI MOT NGUOI DUOC DUNG CAMERA", (45, 65, 235)
                    elif error:
                        gate.reset()
                        message, detail, color = "TU CHOI - HINH ANH CHUA DAT", "NHIN RO CAMERA VA GIU MAT ON DINH", (45, 65, 235)
                    elif live != "LIVE" and not (live == "NOT_CHECKED" and config.allow_unverified_liveness):
                        gate.reset()
                        message, detail, color = "TU CHOI - KHONG XAC MINH DUOC NGUOI THAT", "THU LAI VOI KHUON MAT THAT", (45, 65, 235)
                        if (embedding is not None or live == "SPOOF") and now - last_unknown >= config.cooldown:
                            publisher.face(None, live)
                            last_unknown = now
                    elif match is None:
                        gate.reset()
                        message, detail, color = "TU CHOI - KHUON MAT KHONG KHOP", "KHONG CO MAU KHUON MAT DUOC CHAP NHAN", (45, 65, 235)
                        if (embedding is not None or live == "SPOOF") and now - last_unknown >= config.cooldown:
                            publisher.face(None, live)
                            last_unknown = now
                    elif gate.observe(match, live, config.allow_unverified_liveness):
                        publisher.face(match, live)
                        message, detail, color = "THANH CONG - NHAN DIEN KHUON MAT", "DA GUI MAY CHU; MAY CHU/CUA XAC NHAN QUYEN MO", (55, 210, 125)
                        LOG.info("Recognition sent; backend and door decide access.")
                    elif now - gate.last_sent.get(match.credential_id, -1e10) < config.cooldown:
                        message, detail, color = "THANH CONG - NHAN DIEN KHUON MAT", "QUYEN MO CUA DO MAY CHU/CUA XAC NHAN", (55, 210, 125)
                    else:
                        message, detail, color = "DANG XAC MINH KHUON MAT", "GIU MAT ON DINH TRONG VAI GIAY", (0, 190, 255)
                except Exception as exc:
                    gate.reset()
                    if match is not None:
                        gate.last_sent.pop(match.credential_id, None)
                    message, detail, color = "TU CHOI - LOI NHAN DIEN", "KIEM TRA CAMERA VA MODEL AI", (45, 65, 235)
                    LOG.warning("Frame skipped (%s).", type(exc).__name__)
            if show:
                draw_preview(frame, boxes, message, detail, color)
                cv2.imshow(window, frame)
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
