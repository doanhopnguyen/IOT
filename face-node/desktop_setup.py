"""Local laptop setup: owner login, choose a door, arm recognition after readiness.

No account password or camera secret is returned to the browser. The camera
keeps the same recognition/liveness/authorization pipeline as node.py.
"""
import argparse
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
from urllib.parse import urlsplit
import webbrowser

import requests
from backend import Backend
from config import Config, load_env

ROOT = Path(__file__).resolve().parent


class ApiFailure(RuntimeError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def server_origin(value):
    value = value.strip().rstrip('/')
    url = urlsplit(value)
    if url.scheme not in {'http', 'https'} or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
        raise ValueError('Nhập địa chỉ máy chủ Smart Door, ví dụ http://100.x.x.x:8080.')
    return value


def door_code(unit_id):
    return f'SD-{int(unit_id):06d}'


class OwnerClient:
    def __init__(self, server):
        self.server = server_origin(server)
        self.session = requests.Session()
        self.session.trust_env = False
        self.csrf = None

    def call(self, method, path, body=None):
        if not path.startswith('/api/') or urlsplit(path).netloc:
            raise ValueError('Invalid service path')
        headers = {}
        if method != 'GET':
            if not self.csrf:
                self.csrf = self.call('GET', '/api/auth/csrf')
            headers[self.csrf['headerName']] = self.csrf['token']
        response = self.session.request(method, self.server + path, json=body, headers=headers,
                                        timeout=(3, 10), allow_redirects=False)
        if response.is_redirect:
            raise ApiFailure(400, 'Máy chủ chuyển hướng. Kiểm tra lại địa chỉ Smart Door.')
        if not response.ok:
            messages = {401: 'Đăng nhập lại tài khoản chủ cửa.', 403: 'Tài khoản không có quyền hoặc cần xác thực lại.',
                        409: 'Cửa đang có camera khác. Chọn thay camera nếu muốn dùng laptop này.'}
            raise ApiFailure(response.status_code, messages.get(response.status_code, 'Chưa thực hiện được. Kiểm tra cửa và thử lại.'))
        return response.json() if response.status_code != 204 and response.content else None

    def login(self, identifier, password):
        profile = self.call('POST', '/api/auth/login', {'identifier': identifier, 'password': password})
        self.csrf = None
        return profile

    def doors(self):
        names = {d['unitId']: d['unitName'] for d in self.call('GET', '/api/units') if d.get('role') == 'OWNER'}
        return [dict(unitId=d['unitId'], name=names.get(d['unitId'], d['name']), code=door_code(d['unitId']), ready=bool(d['setupReady']))
                for d in self.call('GET', '/api/activation/mine')
                if d.get('unitId') and d.get('state') in {'CLAIMED', 'ACTIVE'}]

    def close(self):
        try: self.call('POST', '/api/auth/logout', {})
        except Exception: pass
        finally: self.session.cookies.clear(); self.session.close()


class DesktopController:
    def __init__(self, state_file=None, owner_factory=OwnerClient, connection_reader=None, process_factory=None):
        self.path = Path(state_file or ROOT.parent / '.local' / 'edge-ai' / 'connections.json')
        self.owner_factory = owner_factory
        self.connection_reader = connection_reader or self._connection
        self.process_factory = process_factory or self._start_process
        self.lock = threading.RLock()
        self.operation = threading.Lock()
        self.owner = None
        self.password = None
        self.profile = None
        self.process = None
        self.log_stream = None
        self.revision = 0
        self.phase, self.message = 'IDLE', 'Đăng nhập cùng tài khoản chủ cửa để kết nối laptop.'
        self.store = {'connections': {}, 'selected': None, 'armed': False}
        if self.path.is_file():
            loaded = json.loads(self.path.read_text(encoding='utf-8'))
            if isinstance(loaded.get('connections'), dict):
                self.store = loaded
                if not loaded.get('autoRestart', True):
                    self.store['armed'] = False

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.path.with_suffix('.tmp')
        with temporary.open('w', encoding='utf-8') as stream:
            os.chmod(temporary, 0o600)
            json.dump(self.store, stream, ensure_ascii=False)
        temporary.replace(self.path)

    def snapshot(self):
        with self.lock:
            selected = self.store['connections'].get(str(self.store.get('selected')), {})
            return {'application': 'smartdoor-edge-ai', 'authenticated': self.owner is not None,
                    'ownerName': (self.profile or {}).get('fullName', ''), 'doorName': selected.get('doorName', ''),
                    'doorCode': selected.get('doorCode', ''), 'armed': bool(self.store.get('armed')),
                    'phase': self.phase, 'message': self.message}

    def login(self, server, identifier, password):
        with self.operation:
            client = self.owner_factory(server)
            profile = client.login(identifier, password)
            with self.lock:
                if self.owner: self.owner.close()
                selected = self.store['connections'].get(str(self.store.get('selected')), {})
                if selected.get('ownerId') is not None and selected['ownerId'] != profile.get('accountId'):
                    self.store['armed'] = False; self._save(); self.revision += 1; self._stop_process()
                    self.phase, self.message = 'STOPPED', 'Đã đổi tài khoản. Chọn cửa thuộc tài khoản này để bật AI.'
                self.owner, self.password, self.profile = client, password, profile
        return self.snapshot()

    def doors(self):
        with self.operation:
            if not self.owner:
                raise ApiFailure(401, 'Đăng nhập tài khoản chủ cửa trước.')
            return self.owner.doors()

    def connect(self, code, camera=0, replace=False, auto=True):
        if not isinstance(camera, int) or isinstance(camera, bool) or not 0 <= camera <= 10:
            raise ValueError('Chọn camera từ 0 đến 10.')
        with self.operation:
            if not self.owner:
                raise ApiFailure(401, 'Đăng nhập tài khoản chủ cửa trước.')
            door = next((d for d in self.owner.doors() if d['code'] == code.strip().upper()), None)
            if door is None:
                raise ApiFailure(403, 'Mã cửa không thuộc tài khoản này. Dùng đúng tài khoản quản lý cửa trên mobile.')
            path = f"/api/manager/units/{door['unitId']}/camera-node"
            nodes = self.owner.call('GET', path)
            cached = self.store['connections'].get(str(door['unitId']))
            reuse = cached and cached.get('server') == self.owner.server and any(n['deviceCode'] == cached.get('deviceUid') for n in nodes)
            if not reuse:
                if nodes and not replace:
                    raise ApiFailure(409, 'Cửa đã có camera khác. Bật “Thay camera cũ” nếu muốn chuyển sang laptop này.')
                if not self.password:
                    raise ApiFailure(401, 'Đăng nhập lại để xác thực cấp camera mới.')
                for node in nodes:
                    self.owner.call('DELETE', path + '/' + node['deviceCode'], {'password': self.password})
                issued = self.owner.call('POST', path, {'password': self.password})
                cached = {'deviceUid': issued['deviceUid'], 'deviceSecret': issued['deviceSecret'], 'server': self.owner.server}
            self.password = None
            selected = dict(cached, unitId=door['unitId'], doorName=door['name'], doorCode=door['code'], camera=camera,
                            ownerId=self.profile.get('accountId'))
            with self.lock:
                self._stop_process()
                self.store['connections'][str(door['unitId'])] = selected
                self.store['selected'] = str(door['unitId'])
                self.store['armed'] = True
                self.store['autoRestart'] = bool(auto)
                self._save()
                self.revision += 1
                self.phase, self.message = 'WAITING', 'Đã ghép laptop. Chờ cửa hoàn tất PIN và hiệu chỉnh…'
        return self.snapshot()

    @staticmethod
    def _connection(selected):
        config = Config(base_url=selected['server'], device_uid=selected['deviceUid'], device_secret=selected['deviceSecret'])
        api = Backend(config)
        try:
            return api.call('GET', '/api/face-node/connection').json()
        finally:
            api.session.close()

    def _start_process(self, selected):
        env = os.environ.copy()
        env.update(FACE_API_URL=selected['server'], FACE_DEVICE_UID=selected['deviceUid'],
                   FACE_DEVICE_SECRET=selected['deviceSecret'], FACE_EVENT_TRANSPORT='http',
                   FACE_CAMERA_SOURCE=str(selected['camera']), PYTHONUTF8='1')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.log_stream = (self.path.parent / 'worker.log').open('w', encoding='utf-8')
        return subprocess.Popen([sys.executable, '-u', str(ROOT / 'node.py'), '--camera'], cwd=ROOT, env=env,
                                stdout=self.log_stream, stderr=subprocess.STDOUT,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

    def _stop_process(self):
        process, self.process = self.process, None
        if process is not None and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)
        if self.log_stream:
            self.log_stream.close(); self.log_stream = None

    def tick(self):
        with self.lock:
            selected = self.store['connections'].get(str(self.store.get('selected')))
            if not self.store.get('armed') or not selected:
                return
            selected, revision = dict(selected), self.revision
        try:
            connection = self.connection_reader(selected)
            with self.lock:
                if revision != self.revision:
                    return
                if connection['doorCode'] != selected['doorCode']:
                    raise ValueError('Camera không còn thuộc cửa đã chọn. Hãy ghép lại.')
                if not connection['ready'] or not connection['doorOnline'] or not connection['faceEnabled']:
                    self._stop_process()
                    self.phase = 'WAITING'
                    self.message = 'Chờ cửa hoàn tất thiết lập và online.' if not connection['ready'] or not connection['doorOnline'] else 'Nhận diện đang tắt tại cửa. Bật quyền khuôn mặt trên mobile.'
                elif self.process is None:
                    self.process = self.process_factory(selected)
                    self.phase, self.message = 'STARTING', 'Đang tải AI và mở camera trên laptop…'
                elif self.process.poll() is not None:
                    result = self.process.poll(); self._stop_process()
                    self.store['armed'] = False; self._save()
                    self.phase = 'STOPPED' if result == 0 else 'ERROR'
                    self.message = 'Camera đã dừng. Kết nối lại để tiếp tục.' if result == 0 else 'Chưa mở được AI. Kiểm tra camera, quyền camera và model trên laptop; xem hướng dẫn demo.'
                else:
                    log = self.path.parent / 'worker.log'
                    if log.is_file():
                        with log.open('rb') as stream:
                            stream.seek(max(0, log.stat().st_size - 8192))
                            if b'AI_CAMERA_READY' in stream.read():
                                self.phase, self.message = 'RUNNING', 'AI đang nhận diện. Giữ khuôn mặt trong khung camera.'
        except Exception as error:
            with self.lock:
                if revision != self.revision:
                    return
                self._stop_process()
                response = getattr(error, 'response', None)
                if response is not None and response.status_code in {401, 403, 404}:
                    self.store['armed'] = False; self._save()
                    self.phase, self.message = 'ERROR', 'Camera đã bị gỡ hoặc mã kết nối hết hiệu lực. Đăng nhập chủ cửa để ghép lại.'
                elif isinstance(error, ValueError):
                    self.store['armed'] = False; self._save()
                    self.phase, self.message = 'ERROR', str(error)
                else:
                    self.phase, self.message = 'WAITING', 'Chưa kết nối được cửa. Kiểm tra Internet/Tailscale; AI sẽ tự tiếp tục khi có mạng.'

    def stop(self, logout=False):
        with self.operation, self.lock:
            self.store['armed'] = False; self._save(); self.revision += 1
            self._stop_process(); self.phase, self.message = 'STOPPED', 'Đã dừng nhận diện trên laptop.'
            self.password = None
            if logout:
                if self.owner: self.owner.close()
                self.owner, self.profile = None, None
        return self.snapshot()

    def close(self):
        with self.lock:
            self.revision += 1; self._stop_process(); self.password = None
            if not self.store.get('autoRestart', True):
                self.store['armed'] = False; self._save()


def handler_for(controller, token, port, default_server):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def allowed(self, authenticate=True):
            if self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
                return False
            origin = self.headers.get('Origin')
            if origin and origin not in {f'http://127.0.0.1:{port}', f'http://localhost:{port}'}:
                return False
            return not authenticate or hmac.compare_digest(self.headers.get('X-Local-Token', ''), token)

        def reply(self, code, body, kind='application/json'):
            if kind == 'application/json': body = json.dumps(body, ensure_ascii=False)
            raw = body.encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', kind + '; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'")
            self.send_header('Content-Length', str(len(raw))); self.end_headers(); self.wfile.write(raw)

        def do_GET(self):
            if not self.allowed(self.path not in {'/', '/health'}):
                return self.reply(403, {'message': 'Phiên laptop không hợp lệ. Mở lại Smart Door AI.'})
            try:
                if self.path == '/':
                    html = (ROOT / 'desktop_setup.html').read_text(encoding='utf-8')
                    settings = json.dumps({'token': token, 'server': default_server}, ensure_ascii=False).replace('<', '\\u003c')
                    return self.reply(200, html.replace('__BOOTSTRAP__', settings), 'text/html')
                if self.path == '/health': return self.reply(200, {'application': 'smartdoor-edge-ai'})
                if self.path == '/api/state': return self.reply(200, controller.snapshot())
                if self.path == '/api/doors': return self.reply(200, controller.doors())
                self.reply(404, {'message': 'Không tìm thấy trang.'})
            except ApiFailure as error: self.reply(error.status, {'message': str(error)})
            except Exception: self.reply(503, {'message': 'Chưa kết nối được dịch vụ. Kiểm tra Internet/Tailscale.'})

        def do_POST(self):
            if not self.allowed() or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.reply(403, {'message': 'Phiên laptop không hợp lệ. Mở lại Smart Door AI.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096: raise ValueError('Yêu cầu không hợp lệ.')
                body = json.loads(self.rfile.read(length))
                if self.path == '/api/login': result = controller.login(body['server'], body['identifier'], body['password'])
                elif self.path == '/api/connect': result = controller.connect(body['doorCode'], body.get('camera', 0), body.get('replace') is True, body.get('auto') is True)
                elif self.path == '/api/stop': result = controller.stop()
                elif self.path == '/api/logout': result = controller.stop(logout=True)
                else: return self.reply(404, {'message': 'Không tìm thấy thao tác.'})
                self.reply(200, result)
            except ApiFailure as error: self.reply(error.status, {'message': str(error)})
            except (ValueError, KeyError, TypeError) as error: self.reply(400, {'message': str(error) if isinstance(error, ValueError) else 'Nhập đủ thông tin.'})
            except Exception: self.reply(503, {'message': 'Chưa kết nối được dịch vụ. Kiểm tra cửa và thử lại.'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8092)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    load_env(ROOT / '.env')
    controller = DesktopController()
    token = secrets.token_urlsafe(32)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(controller, token, args.port, os.getenv('FACE_API_URL', 'http://127.0.0.1:8080')))
    stopped = threading.Event()
    def monitor():
        while not stopped.is_set():
            controller.tick(); stopped.wait(2)
    monitor_thread = threading.Thread(target=monitor, daemon=True); monitor_thread.start()
    if not args.no_browser: webbrowser.open(f'http://127.0.0.1:{args.port}')
    try: server.serve_forever(poll_interval=.5)
    except KeyboardInterrupt: pass
    finally:
        stopped.set(); monitor_thread.join(timeout=8); controller.close(); server.server_close()


if __name__ == '__main__': main()
