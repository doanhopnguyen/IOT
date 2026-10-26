"""Cấu hình không chứa mật khẩu tài khoản hoặc thông tin đăng nhập đặc quyền."""
from dataclasses import dataclass
import os
from pathlib import Path

MODEL = "buffalo_l/w600k_r50:v1"


def load_env(path: Path = Path(".env")) -> None:
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def boolean(name: str, default: bool = False) -> bool:
    value = os.getenv(name, str(default)).lower()
    if value not in {"true", "false", "1", "0"}:
        raise ValueError(f"{name} chỉ nhận giá trị true hoặc false.")
    return value in {"true", "1"}


@dataclass(frozen=True)
class Config:
    base_url: str = "http://localhost:8080"
    device_uid: str = ""
    device_secret: str = ""
    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_prefix: str = "smartdoor-iot"
    model_root: Path = Path("models")
    threshold: float = 0.50
    margin: float = 0.08
    stable_frames: int = 3
    cooldown: float = 10.0
    sync_seconds: float = 5.0
    max_frame_age: float = 2.0
    allow_unverified_liveness: bool = False
    liveness_enabled: bool = True
    liveness_threshold: float = 0.8
    min_face_size: int = 80
    min_blur: float = 40.0
    camera_source: str = "0"
    ort_threads: int = 2

    @classmethod
    def from_env(cls):
        load_env()
        cfg = cls(
            base_url=os.getenv("FACE_API_URL", cls.base_url).rstrip("/"),
            device_uid=os.getenv("FACE_DEVICE_UID", ""),
            device_secret=os.getenv("FACE_DEVICE_SECRET", ""),
            mqtt_host=os.getenv("MQTT_HOST", cls.mqtt_host),
            mqtt_port=int(os.getenv("MQTT_PORT", "1883")),
            mqtt_username=os.getenv("MQTT_USERNAME", ""),
            mqtt_password=os.getenv("MQTT_PASSWORD", ""),
            mqtt_prefix=os.getenv("MQTT_TOPIC_PREFIX", cls.mqtt_prefix).strip("/"),
            model_root=Path(os.getenv("FACE_MODEL_ROOT", "models")),
            threshold=float(os.getenv("FACE_THRESHOLD", "0.50")),
            margin=float(os.getenv("FACE_MARGIN", "0.08")),
            stable_frames=int(os.getenv("FACE_STABLE_FRAMES", "3")),
            cooldown=float(os.getenv("FACE_COOLDOWN_SECONDS", "10")),
            sync_seconds=float(os.getenv("FACE_SYNC_SECONDS", "5")),
            max_frame_age=float(os.getenv("FACE_MAX_FRAME_AGE_SECONDS", "2")),
            allow_unverified_liveness=boolean("FACE_ALLOW_UNVERIFIED_LIVENESS"),
            liveness_enabled=boolean("FACE_LIVENESS_ENABLED", True),
            liveness_threshold=float(os.getenv("FACE_LIVENESS_THRESHOLD", "0.8")),
            min_face_size=int(os.getenv("FACE_MIN_FACE_SIZE", "80")),
            min_blur=float(os.getenv("FACE_MIN_BLUR", "40")),
            camera_source=os.getenv("FACE_CAMERA_SOURCE", "0"),
            ort_threads=int(os.getenv("FACE_ORT_THREADS", "2")),
        )
        if not 0 < cfg.threshold <= 1 or not 0 <= cfg.margin <= 1:
            raise ValueError("Ngưỡng nhận diện không hợp lệ.")
        if not 0 < cfg.liveness_threshold <= 1:
            raise ValueError("Ngưỡng xác minh người thật không hợp lệ.")
        if (cfg.stable_frames < 1 or cfg.sync_seconds <= 0 or cfg.cooldown <= 0
                or cfg.max_frame_age <= 0 or cfg.min_face_size < 1 or cfg.min_blur < 0 or cfg.ort_threads < 1):
            raise ValueError("Khoảng thời gian, số khung hình và ngưỡng chất lượng phải hợp lệ.")
        if not cfg.liveness_enabled and not cfg.allow_unverified_liveness:
            raise ValueError("Tắt xác minh người thật cần đặt FACE_ALLOW_UNVERIFIED_LIVENESS=true.")
        return cfg

    def require_device(self):
        if not self.device_uid or not self.device_secret:
            raise ValueError("Hãy cấu hình FACE_DEVICE_UID và FACE_DEVICE_SECRET.")
