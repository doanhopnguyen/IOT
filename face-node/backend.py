"""API thiết bị; thông tin xác thực không xuất hiện trong URL hoặc log."""
from urllib.parse import urlsplit
import requests


class Backend:
    def __init__(self, config):
        self.base = config.base_url
        self.transport = config.event_transport
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.headers.update({"X-Device-Uid": config.device_uid,
                                     "X-Device-Secret": config.device_secret})

    def call(self, method, path, **kwargs):
        # Không gửi bí mật thiết bị qua chuyển hướng hoặc sang máy chủ API khác.
        if not path.startswith("/api/face-node/") or urlsplit(path).netloc:
            raise ValueError("Đường dẫn API nằm ngoài phạm vi cho phép.")
        response = self.session.request(method, self.base + path, timeout=(3, 15),
                                        allow_redirects=False, **kwargs)
        if response.is_redirect:
            raise RuntimeError("API thiết bị không được phép chuyển hướng.")
        response.raise_for_status()
        return response

    def sync(self, cache, health=None):
        try:
            self.call("POST", "/api/face-node/heartbeat", **({"json": health} if health is not None else {}))
            if self.transport == "http":
                connection = self.call("GET", "/api/face-node/connection").json()
                if not all(connection.get(key, False) for key in ("ready", "doorOnline", "faceEnabled")) or not connection.get("enabled", True):
                    cache.clear()
                    return
            cache.replace(self.call("GET", "/api/face-node/templates").json())
        except Exception:
            cache.clear()
            raise
