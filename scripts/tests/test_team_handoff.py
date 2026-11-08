"""Exercise matching factory credentials and real HTTP cookie/binary forwarding."""
import contextlib
import http.client
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
import bcrypt
import requests

SCRIPTS=Path(__file__).resolve().parents[1]


def load(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


handoff=load('team_handoff')
web=load('team_web')


class FactoryTests(unittest.TestCase):
    def test_factory_sql_and_broker_share_one_identity_and_no_buyer_config(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            destination=Path(folder)/'bundle'
            handoff.create(destination,'192.168.1.50')
            c=json.loads((destination/'cuong/server.json').read_text(encoding='utf-8'))
            f=json.loads((destination/'hop/FACTORY_ESP32-80B54EC8149C.json').read_text())
            connection=json.loads((destination/'hop/ESP32-80B54EC8149C-connection.json').read_text())
            import hashlib
            self.assertTrue(bcrypt.checkpw(f['deviceSecret'].encode(),c['device_hash'].encode()))
            self.assertTrue(bcrypt.checkpw(c['admin_password'].encode(),c['admin_hash'].encode()))
            self.assertEqual(hashlib.sha256(f['activationCode'].encode()).hexdigest(),c['claim_hash'])
            self.assertEqual(connection['mqttPassword'],c['device_mqtt_password'])
            self.assertEqual(connection['mqttUser'],f['deviceUid'])
            self.assertFalse({'wifiSsid','wifiPassword','pin','adminPin'} & f.keys())
            seed=(destination/'cuong/01-seed-admin-device.sql').read_text()
            self.assertIn(c['claim_hash'],seed);self.assertIn(c['device_hash'],seed)
            self.assertNotIn(f['deviceSecret'],seed);self.assertNotIn(c['admin_password'],seed)
            self.assertEqual(list((destination/'thuy').glob('*.json')),[destination/'thuy/role.json'])
            original=(destination/'cuong/server.json').read_bytes()
            with self.assertRaises(ValueError):handoff.create(destination,'192.168.1.50')
            self.assertEqual((destination/'cuong/server.json').read_bytes(),original)

    def test_cannot_provision_chip_with_tailnet_or_public_gateway(self):
        with tempfile.TemporaryDirectory() as folder:
            for address in ('100.111.90.116','8.8.8.8','127.0.0.1','0.0.0.0'):
                with self.assertRaises(ValueError):handoff.create(Path(folder)/'new',address)


class WebTests(unittest.TestCase):
    def setUp(self):
        class Upstream(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):
                self.send_response(200)
                self.send_header('Set-Cookie','JSESSIONID=team-session; Path=/; HttpOnly; SameSite=Lax')
                self.send_header('Set-Cookie','other=value; Path=/')
                self.end_headers();self.wfile.write(bytes(range(256))*100)
            def do_POST(self):
                data=self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(200);self.end_headers()
                self.wfile.write(json.dumps(dict(cookie=self.headers.get('Cookie'),csrf=self.headers.get('X-CSRF-TOKEN'),body=data.hex())).encode())
        self.folder=tempfile.TemporaryDirectory();self.addCleanup(self.folder.cleanup)
        self.admin=Path(self.folder.name)/'admin';self.admin.mkdir();(self.admin/'index.html').write_text('LOCAL ADMIN')
        self.upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream)
        upstream=f'http://127.0.0.1:{self.upstream.server_port}'
        self.proxy=ThreadingHTTPServer(('127.0.0.1',0),web.handler(upstream,self.admin))
        for server in (self.upstream,self.proxy):
            threading.Thread(target=server.serve_forever,daemon=True).start()
            self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        self.base=f'http://127.0.0.1:{self.proxy.server_port}'

    def test_local_admin_and_binary_api_cookie_roundtrip(self):
        self.assertEqual(requests.get(self.base+'/admin/index.html',timeout=3).text,'LOCAL ADMIN')
        with requests.Session() as session:
            result=session.get(self.base+'/api/auth/csrf',timeout=3)
            self.assertEqual(result.content,bytes(range(256))*100)
            self.assertEqual(session.cookies.get('JSESSIONID'),'team-session')
            data=b'\x00\xffJPEG'+bytes(range(256))
            result=session.post(self.base+'/api/media',data=data,headers={'X-CSRF-TOKEN':'csrf-test'},timeout=3).json()
            self.assertIn('JSESSIONID=team-session',result['cookie'])
            self.assertEqual(result['csrf'],'csrf-test');self.assertEqual(bytes.fromhex(result['body']),data)

    def test_admin_cannot_read_parent_files(self):
        (self.admin.parent/'secret.txt').write_text('DO NOT SERVE')
        connection=http.client.HTTPConnection('127.0.0.1',self.proxy.server_port,timeout=3)
        connection.request('GET','/admin/%2e%2e/secret.txt')
        result=connection.getresponse();self.assertEqual(result.status,404);result.read();connection.close()

    def test_unavailable_backend_returns_502(self):
        self.upstream.shutdown();self.upstream.server_close()
        result=requests.get(self.base+'/api/health',timeout=3)
        self.assertEqual(result.status_code,502)


if __name__=='__main__':unittest.main()
