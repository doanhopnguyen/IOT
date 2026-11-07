"""Private server-side photo/video enrollment. Raw media is never retained.

This registers a template, not a liveness proof or authorization to open a door.
The existing camera recognition path keeps its liveness checks.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
import hmac
import json
import os
import threading
from media_validation import MediaValidationError

MAX_BYTES = 20 * 1024 * 1024
TYPES = {'image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'video/webm'}


def extract_media(engine, data, media_type):
    import cv2
    import numpy as np
    from matching import normalized
    if media_type.startswith('image/'):
        if len(data) > 5 * 1024 * 1024:
            raise MediaValidationError('IMAGE_TOO_LARGE')
        # Inspect dimensions before OpenCV allocates the decoded frame.
        from PIL import Image
        from io import BytesIO
        with Image.open(BytesIO(data)) as image:
            if image.format not in ('JPEG', 'PNG'):
                raise MediaValidationError('IMAGE_FORMAT')
            if image.width * image.height > 20_000_000:
                raise MediaValidationError('IMAGE_DIMENSIONS')
        return engine.embed_image(data)

    suffix = {'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm'}[media_type]
    temporary = None
    capture = None
    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        capture = cv2.VideoCapture(str(temporary))
        fps = capture.get(cv2.CAP_PROP_FPS)
        count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        width = capture.get(cv2.CAP_PROP_FRAME_WIDTH)
        height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if (not capture.isOpened() or not np.isfinite([fps, count, width, height]).all()
                or fps <= 0 or count < 3 or count / fps > 10 or width * height > 8_300_000):
            raise MediaValidationError('VIDEO_INVALID')
        vectors = []
        for position in np.linspace(0, count - 1, min(12, int(count))).astype(int):
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(position))
            ok, frame = capture.read()
            if not ok:
                raise MediaValidationError('VIDEO_READ_FAILED')
            ok, encoded = cv2.imencode('.jpg', frame)
            if not ok:
                raise MediaValidationError('VIDEO_READ_FAILED')
            vector = engine.embed_image(encoded.tobytes())
            if vectors and float(np.dot(vectors[0], vector)) < .5:
                raise MediaValidationError('VIDEO_DIFFERENT_PEOPLE')
            vectors.append(vector)
        return normalized(np.mean(vectors, axis=0))
    finally:
        if capture is not None:
            capture.release()
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def handler_for(engine, token):
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # No request bodies, biometric data, credentials or filenames in access logs.

        def reply(self, code, result):
            body = json.dumps(result, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != '/extract':
                return self.reply(404, {'message': 'Not found'})
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                return self.reply(403, {'message': 'Forbidden'})
            if self.headers.get('Transfer-Encoding'):
                return self.reply(400, {'message': 'Content-Length required'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self.reply(400, {'message': 'Invalid length'})
            media_type = self.headers.get('Content-Type', '').split(';')[0]
            if not 0 < length <= MAX_BYTES:
                return self.reply(413, {'message': 'Tệp tối đa 20 MiB.'})
            if media_type not in TYPES:
                return self.reply(415, {'message': 'Chỉ nhận JPEG/PNG hoặc MP4/MOV/WebM.'})
            if not lock.acquire(blocking=False):
                return self.reply(429, {'message': 'Máy chủ đang xử lý một hồ sơ khác. Thử lại sau.'})
            try:
                self.connection.settimeout(20)
                data = self.rfile.read(length)
                if len(data) != length:
                    return self.reply(400, {'message': 'Tệp chưa tải lên đầy đủ.'})
                vector = extract_media(engine, data, media_type)
                self.reply(200, {'model': 'buffalo_l/w600k_r50:v1', 'embedding': vector.tolist()})
            except MediaValidationError as error:
                print(f'FACE_MEDIA_REJECTED code={error.code} type={media_type} bytes={length}', flush=True)
                self.reply(422, {'code': error.code, 'message': str(error)})
            except (ValueError, OSError):
                error = MediaValidationError('MEDIA_INVALID')
                print(f'FACE_MEDIA_REJECTED code={error.code} type={media_type} bytes={length}', flush=True)
                self.reply(422, {'code': error.code, 'message': str(error)})
            except Exception:
                self.reply(503, {'message': 'Dịch vụ xử lý khuôn mặt tạm thời chưa sẵn sàng.'})
            finally:
                lock.release()

    return Handler


def main():
    from config import Config, load_env
    from engine import Engine
    load_env(Path('.env.enrollment'))
    token = os.environ.get('FACE_PROCESSOR_TOKEN', '')
    if len(token) < 32:
        raise SystemExit('Set FACE_PROCESSOR_TOKEN (at least 32 characters) in .env.enrollment.')
    # Enrollment from uploaded media does not assert liveness. No recognition bypass is enabled.
    engine = Engine(Config(model_root=Path(os.getenv('FACE_MODEL_ROOT', 'models')), liveness_enabled=False))
    port = int(os.environ.get('FACE_PROCESSOR_PORT', '8091'))
    server = ThreadingHTTPServer(('127.0.0.1', port), handler_for(engine, token))
    server.daemon_threads = True
    print(f'Face enrollment processor ready on 127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
