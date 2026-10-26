"""Logic so khớp độc lập với camera, máy chủ và việc tải model."""
from dataclasses import dataclass
import math
import time
import numpy as np
from config import MODEL


def normalized(values):
    vector = np.asarray(values, dtype=np.float32)
    if vector.shape != (512,) or not np.isfinite(vector).all():
        raise ValueError("Vector đặc trưng phải có 512 giá trị hữu hạn.")
    length = float(np.linalg.norm(vector))
    if not math.isfinite(length) or length < 1e-6:
        raise ValueError("Vector đặc trưng không được bằng 0.")
    return vector / length


@dataclass(frozen=True)
class Match:
    credential_id: int
    account_id: int
    score: float


class TemplateCache:
    def __init__(self):
        self.clear()

    def clear(self):
        self.templates = []
        self.vectors = np.empty((0, 512), dtype=np.float32)
        self.valid = False
        self.refreshed_at = 0.0

    def replace(self, snapshot, now=None):
        # Kiểm tra toàn bộ trước rồi mới thay thế; bên gọi xóa cache nếu có lỗi.
        if snapshot.get("model") != MODEL:
            raise ValueError("Model đặc trưng của máy chủ và node không khớp.")
        rows, vectors, ids = [], [], set()
        for item in snapshot["templates"]:
            credential = int(item["credentialId"])
            account = int(item["accountId"])
            if credential <= 0 or account <= 0 or credential in ids:
                raise ValueError("Mã mẫu không hợp lệ hoặc bị trùng.")
            ids.add(credential)
            rows.append((credential, account))
            vectors.append(normalized(item["embedding"]))
        self.templates = rows
        self.vectors = np.stack(vectors) if vectors else np.empty((0, 512), dtype=np.float32)
        self.refreshed_at = time.monotonic() if now is None else now
        self.valid = True

    def match(self, embedding, threshold, margin):
        if not self.valid or not self.templates:
            return None
        scores = self.vectors @ normalized(embedding)
        best_per_account = {}
        for index, (_, account) in enumerate(self.templates):
            if account not in best_per_account or scores[index] > scores[best_per_account[account]]:
                best_per_account[account] = index
        order = sorted(best_per_account.values(), key=lambda i: float(scores[i]), reverse=True)
        first = order[0]
        score = float(scores[first])
        second = float(scores[order[1]]) if len(order) > 1 else -1.0
        if score < threshold or score - second < margin:
            return None
        credential, account = self.templates[first]
        return Match(credential, account, max(0.0, min(1.0, score)))


class RecognitionGate:
    def __init__(self, frames, cooldown):
        self.frames, self.cooldown = frames, cooldown
        self.reset()
        self.last_sent = {}

    def reset(self):
        self.candidate, self.count = None, 0

    def observe(self, match, liveness, allow_unverified=False, now=None):
        now = time.monotonic() if now is None else now
        if liveness != "LIVE" and not (liveness == "NOT_CHECKED" and allow_unverified):
            self.reset()
            return False
        if match is None:
            self.reset()
            return False
        key = match.credential_id
        self.count = self.count + 1 if self.candidate == key else 1
        self.candidate = key
        if self.count < self.frames or now - self.last_sent.get(key, -math.inf) < self.cooldown:
            return False
        self.last_sent[key] = now
        self.reset()
        return True
