"""Nhận diện InsightFace tại cửa và kiểm tra model cục bộ."""
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
import onnxruntime as ort
from insightface.app import FaceAnalysis
from insightface.app.common import Face
from matching import normalized


def model_files(root):
    directory = Path(root) / "models" / "buffalo_l"
    required = [directory / "det_10g.onnx", directory / "w600k_r50.onnx"]
    return required


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_models(root, require_liveness=False):
    root = Path(root)
    manifest_path = Path(__file__).with_name("model-checksums.json")
    manifest = json.loads(manifest_path.read_text())
    for path in model_files(root):
        name = path.relative_to(root).as_posix()
        if not path.is_file() or manifest.get(name) != digest(path):
            raise RuntimeError(f"Thiếu model hoặc model đã thay đổi: {name}")
    addon = root / "addons" / "liveness.onnx"
    if require_liveness and not addon.is_file():
        raise RuntimeError("Thiếu model xác minh người thật; chạy --download-models để cài đặt.")
    if addon.is_file() and manifest.get("addons/liveness.onnx") != digest(addon):
        raise RuntimeError("Mã kiểm tra model xác minh người thật không khớp.")


def download_models(config):
    # InsightFace tự chọn nguồn HTTPS chính thức; chỉ tải model khi người dùng yêu cầu.
    FaceAnalysis(name="buffalo_l", root=str(config.model_root),
                 allowed_modules=["detection", "recognition"],
                 addons=["liveness"] if config.liveness_enabled else [],
                 providers=["CPUExecutionProvider"])
    paths = model_files(config.model_root)
    addon = config.model_root / "addons" / "liveness.onnx"
    if config.liveness_enabled:
        paths.append(addon)
    manifest = {p.relative_to(config.model_root).as_posix(): digest(p) for p in paths}
    verify_models(config.model_root, require_liveness=config.liveness_enabled)
    config.model_root.mkdir(parents=True, exist_ok=True)
    (config.model_root / "checksums.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


class Engine:
    def __init__(self, config):
        verify_models(config.model_root, require_liveness=config.liveness_enabled)
        self.config = config
        options = ort.SessionOptions()
        options.intra_op_num_threads = config.ort_threads
        self.app = FaceAnalysis(name="buffalo_l", root=str(config.model_root),
                                allowed_modules=["detection", "recognition"],
                                addons=["liveness"] if config.liveness_enabled else [],
                                liveness_threshold=config.liveness_threshold,
                                sess_options=options,
                                providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=-1, det_size=(640, 640), det_thresh=0.7)

    def _quality(self, frame, face):
        x1, y1, x2, y2 = [int(x) for x in face.bbox]
        height, width = frame.shape[:2]
        if x1 < 0 or y1 < 0 or x2 > width or y2 > height:
            raise ValueError("Đưa toàn bộ khuôn mặt vào khung hình.")
        if min(x2 - x1, y2 - y1) < self.config.min_face_size:
            raise ValueError("Khuôn mặt quá nhỏ; hãy đưa lại gần camera.")
        crop = frame[y1:y2, x1:x2]
        blur = float(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        if blur < self.config.min_blur:
            raise ValueError("Ảnh khuôn mặt bị mờ; hãy giữ yên và tăng ánh sáng.")

    def embed_image(self, image_bytes):
        frame = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.shape[0] * frame.shape[1] > 20_000_000:
            raise ValueError("Ảnh không hợp lệ hoặc vượt quá kích thước cho phép.")
        bboxes, landmarks = self.app.det_model.detect(frame, max_num=0)
        if len(bboxes) != 1:
            raise ValueError("Đăng ký cần đúng một khuôn mặt trong ảnh.")
        face = Face(bbox=bboxes[0, :4], kps=landmarks[0], det_score=bboxes[0, 4])
        self._quality(frame, face)
        self.app.models["recognition"].get(frame, face)
        return normalized(face.embedding)

    def analyze(self, frame):
        faces = self.app.get(frame)
        if len(faces) != 1:
            return None, "NOT_CHECKED", "Cần có đúng một khuôn mặt trong khung hình."
        face = faces[0]
        try:
            self._quality(frame, face)
        except ValueError as exc:
            return None, "NOT_CHECKED", str(exc)
        live = face.liveness
        if live is None:
            state = "NOT_CHECKED"
        elif live.is_live is True:
            state = "LIVE"
        elif live.is_live is False:
            state = "SPOOF"
        else:
            return None, "NOT_CHECKED", "Không xác minh được người thật từ khung hình."
        if face.embedding is None:
            return None, state, "Xác minh người thật không đạt; đã chặn nhận diện."
        return normalized(face.embedding), state, ""
