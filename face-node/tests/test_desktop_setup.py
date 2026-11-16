import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock

import requests
from desktop_setup import ApiFailure, DesktopController, OwnerClient, handler_for, server_origin, parse_device_config
from config import Config
from node import HttpPublisher

CODE = 'AI-0A1B2C-3D4E5F-60718A-9BACBD'
DEVICE_CONFIG = 'FACE_API_URL=http://127.0.0.1:8080\nFACE_DEVICE_UID=FACE-existing\nFACE_DEVICE_SECRET=imported-private-key'


class Owner:
    server = 'http://127.0.0.1:8080'
    def __init__(self, server):
        self.server = server; self.calls = []; self.nodes = []; self.session = Mock()
    def login(self, identifier, password): return {'accountId': 1, 'fullName': 'Owner'}
    def close(self): pass
    def doors(self): return [{'unitId': 7, 'name': 'Door', 'code': 'SD-000007', 'ready': False}]
    def call(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == 'GET': return self.nodes
        if method == 'DELETE': self.nodes = []; return None
        self.nodes = [{'deviceCode': 'FACE-laptop'}]
        return {'deviceUid': 'FACE-laptop', 'deviceSecret': 'private-camera-key'}


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'connections.json'
        self.state = {'doorCode': 'SD-000007', 'ready': False, 'doorOnline': True, 'faceEnabled': True}
        self.process = Mock(); self.process.poll.return_value = None
        self.start = Mock(return_value=self.process)
        self.controller = DesktopController(self.path, Owner, lambda _: dict(self.state), self.start)
        self.controller.login('http://127.0.0.1:8080', 'owner@test', 'account-password')
    def tearDown(self): self.controller.close(); self.folder.cleanup()

    def test_same_owner_code_arms_without_opening_camera_until_door_is_ready(self):
        self.controller.connect('SD-000007', pairing_code=CODE)
        self.controller.tick(); self.start.assert_not_called()
        self.assertEqual('WAITING', self.controller.snapshot()['phase'])
        self.state['ready'] = True
        self.controller.tick(); self.controller.tick()
        self.start.assert_called_once()
        selected = self.start.call_args.args[0]
        self.assertEqual(7, selected['unitId'])
        self.assertNotIn('account-password', self.path.read_text())
        self.assertNotIn('private-camera-key', json.dumps(self.controller.snapshot()))
        self.assertIsNone(self.controller.password)

    def test_import_device_without_owner_waits_for_readiness_and_resumes(self):
        self.controller.stop(logout=True)
        self.state['doorName'] = 'Imported door'
        result = self.controller.connect_device(DEVICE_CONFIG, camera=1)
        self.assertFalse(result['authenticated'])
        self.assertEqual('Imported door', result['doorName'])
        self.assertNotIn('imported-private-key', json.dumps(result))
        self.controller.tick(); self.start.assert_not_called()
        self.state['ready'] = True
        self.controller.tick()
        self.assertEqual('FACE-existing', self.start.call_args.args[0]['deviceUid'])
        self.assertEqual(1, self.start.call_args.args[0]['camera'])
        self.controller.stop()
        resumed = DesktopController(self.path, Owner, lambda _: dict(self.state), self.start)
        self.assertFalse(resumed.snapshot()['armed'])
        resumed.close()

    def test_invalid_import_does_not_replace_working_connection(self):
        self.controller.connect('SD-000007', pairing_code=CODE)
        previous = self.path.read_text()
        response = requests.Response(); response.status_code = 401
        self.controller.connection_reader = Mock(side_effect=requests.HTTPError(response=response))
        with self.assertRaises(ApiFailure): self.controller.connect_device(DEVICE_CONFIG)
        self.assertEqual(previous, self.path.read_text())
        self.assertTrue(self.controller.snapshot()['armed'])

    def test_pasted_config_accepts_escaped_url_quotes_and_trailing_slashes(self):
        config = parse_device_config('FACE_API_URL=http\\://127.0.0.1:8080\\\nFACE_DEVICE_UID="FACE-existing"\\\nFACE_DEVICE_SECRET=private-key')
        self.assertEqual('http://127.0.0.1:8080', config['server'])
        self.assertEqual('FACE-existing', config['deviceUid'])
        for text in [DEVICE_CONFIG + '\nFACE_DEVICE_SECRET=duplicate',
                     DEVICE_CONFIG + '\nUNSUPPORTED=value',
                     DEVICE_CONFIG.replace('imported-private-key', ''),
                     DEVICE_CONFIG.replace('http://127.0.0.1:8080', 'http://server/api')]:
            with self.assertRaises(ValueError): parse_device_config(text)

    def test_foreign_code_cannot_provision_or_start_a_camera(self):
        with self.assertRaises(ApiFailure): self.controller.connect('SD-000008')
        self.assertEqual([], self.controller.owner.calls)
        self.start.assert_not_called()

    def test_switching_owner_accounts_stops_the_previous_door_camera(self):
        self.controller.connect('SD-000007', pairing_code=CODE); self.state['ready'] = True; self.controller.tick()
        other = Owner(Owner.server); other.login = Mock(return_value={'accountId': 2, 'fullName': 'Other'})
        self.controller.owner_factory = lambda _: other
        self.controller.login(Owner.server, 'other@test', 'other-password')
        self.process.terminate.assert_called_once(); self.assertFalse(self.controller.snapshot()['armed'])

    def test_existing_camera_requires_explicit_replacement(self):
        self.controller.owner.nodes = [{'deviceCode': 'FACE-other-laptop'}]
        with self.assertRaises(ApiFailure): self.controller.connect('SD-000007', pairing_code=CODE)
        self.assertFalse(any(call[0] == 'DELETE' for call in self.controller.owner.calls))
        self.controller.connect('SD-000007', pairing_code=CODE, replace=True)
        self.assertTrue(any(call[0] == 'DELETE' for call in self.controller.owner.calls))

    def test_new_camera_requires_admin_pairing_code_and_sends_it(self):
        with self.assertRaises(ApiFailure) as raised: self.controller.connect('SD-000007')
        self.assertEqual(400, raised.exception.status)
        self.assertFalse(any(call[0] in ('POST', 'DELETE') for call in self.controller.owner.calls))
        self.controller.connect('SD-000007', pairing_code='  ' + CODE + ' ')
        posts = [call for call in self.controller.owner.calls if call[0] == 'POST']
        self.assertEqual([{'password': 'account-password', 'pairingCode': CODE}], [call[2] for call in posts])
        self.assertEqual(['/api/manager/units/7/camera-node/pair'], [call[1] for call in posts])
        self.assertNotIn(CODE, self.path.read_text())

    def test_reconnect_reuses_local_node_without_duplicate_provisioning(self):
        self.controller.connect('SD-000007', pairing_code=CODE); self.controller.connect('SD-000007', pairing_code=CODE)
        creates = [call for call in self.controller.owner.calls if call[0] == 'POST']
        self.assertEqual(1, len(creates))

    def test_lost_connection_pauses_and_recovers_but_stop_does_not_restart(self):
        self.controller.connect('SD-000007', pairing_code=CODE); self.state['ready'] = True; self.controller.tick()
        self.state['doorOnline'] = False; self.controller.tick()
        self.process.terminate.assert_not_called()
        self.state['doorOnline'] = True; self.controller.tick(); self.assertEqual(1, self.start.call_count)
        self.controller.stop(); self.controller.tick(); self.assertEqual(1, self.start.call_count)
        self.assertFalse(json.loads(self.path.read_text())['armed'])

    def test_network_timeout_keeps_the_same_camera_worker_and_recovers(self):
        self.controller.connect('SD-000007', pairing_code=CODE); self.state['ready'] = True; self.controller.tick()
        self.controller.connection_reader = Mock(side_effect=requests.ConnectionError('offline'))
        for _ in range(3): self.controller.tick()
        self.process.terminate.assert_not_called()
        self.assertTrue(self.controller.snapshot()['armed'])
        self.assertEqual('WAITING', self.controller.snapshot()['phase'])
        self.controller.connection_reader = lambda _: dict(self.state)
        self.controller.tick()
        self.start.assert_called_once()

    def test_suspension_keeps_preview_armed_and_resume_does_not_restart_worker(self):
        self.controller.connect('SD-000007', pairing_code=CODE); self.state['ready'] = True; self.controller.tick()
        self.state['enabled'] = False; self.controller.tick()
        self.process.terminate.assert_not_called()
        self.assertTrue(self.controller.snapshot()['armed'])
        self.assertEqual('WAITING', self.controller.snapshot()['phase'])
        self.state['enabled'] = True; self.controller.tick()
        self.start.assert_called_once()

    def test_credential_revocation_disarms_instead_of_retrying_or_replaying(self):
        self.controller.connect('SD-000007', pairing_code=CODE)
        response = requests.Response(); response.status_code = 401
        self.controller.connection_reader = Mock(side_effect=requests.HTTPError(response=response))
        self.controller.tick(); self.assertFalse(self.controller.snapshot()['armed'])
        self.assertEqual('ERROR', self.controller.snapshot()['phase'])

    def test_camera_switched_to_another_door_is_not_used(self):
        self.controller.connect('SD-000007', pairing_code=CODE); self.state['doorCode'] = 'SD-000008'
        self.state['ready'] = True; self.controller.tick()
        self.start.assert_not_called(); self.assertFalse(self.controller.snapshot()['armed'])

    def test_auto_restart_uses_saved_device_identity_without_saving_owner_password(self):
        self.controller.connect('SD-000007', pairing_code=CODE, auto=True)
        resumed = DesktopController(self.path, Owner, lambda _: dict(self.state), self.start)
        self.assertFalse(resumed.snapshot()['authenticated']); self.assertTrue(resumed.snapshot()['armed'])
        self.state['ready'] = True; resumed.tick(); self.start.assert_called_once(); resumed.close()
        self.controller.connect('SD-000007', pairing_code=CODE, auto=False)
        resumed = DesktopController(self.path, Owner, lambda _: dict(self.state), self.start)
        self.assertFalse(resumed.snapshot()['armed']); resumed.close()

    def test_local_portal_rejects_cross_site_requests_and_hides_credentials(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), lambda *args: None)
        port = server.server_port
        server.RequestHandlerClass = handler_for(self.controller, 'private-local-token', port, Owner.server)
        worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
        base = f'http://127.0.0.1:{port}'
        try:
            session = requests.Session(); session.trust_env = False
            self.assertEqual(403, session.post(base + '/api/connect', json={'doorCode': 'SD-000007'}).status_code)
            self.assertEqual(403, session.post(base + '/api/connect-device', json={'configuration': DEVICE_CONFIG}).status_code)
            self.assertEqual(403, session.get(base + '/api/state', headers={'Host': 'attacker.invalid'}).status_code)
            self.assertEqual(403, session.post(base + '/api/stop', json={}, headers={'X-Local-Token': 'private-local-token', 'Origin': 'https://attacker.invalid'}).status_code)
            page = session.get(base).text
            self.assertIn('private-local-token', page); self.assertNotIn('account-password', page)
            state = session.get(base + '/api/state', headers={'X-Local-Token': 'private-local-token'})
            self.assertEqual(200, state.status_code); self.assertNotIn('private-camera-key', state.text)
            imported = session.post(base + '/api/connect-device', json={'configuration': DEVICE_CONFIG, 'auto': True}, headers={'X-Local-Token': 'private-local-token'})
            self.assertEqual(200, imported.status_code)
            self.assertNotIn('imported-private-key', imported.text)
        finally:
            server.shutdown(); server.server_close(); worker.join(timeout=3)

    def test_backend_origin_does_not_accept_credentials_paths_or_redirect_targets(self):
        for value in ['file:///etc/passwd', 'http://user:pass@server', 'https://server/path', 'https://server?key=secret']:
            with self.assertRaises(ValueError): server_origin(value)

    def test_server_accepts_bare_ip_with_default_or_explicit_port(self):
        self.assertEqual('http://100.95.248.100:8080', server_origin(' 100.95.248.100 '))
        self.assertEqual('http://192.168.1.10:9000', server_origin('192.168.1.10:9000'))
        self.assertEqual('https://server.ts.net', server_origin('https://server.ts.net/'))
        config = parse_device_config(DEVICE_CONFIG.replace('http://127.0.0.1:8080', '100.95.248.100'))
        self.assertEqual('http://100.95.248.100:8080', config['server'])
        for value in ['999.95.248.100', '100.95.248.100:0', '100.95.248.100:65536', 'http://server:invalid']:
            with self.assertRaises(ValueError): server_origin(value)

    def test_picker_uses_the_owner_chosen_door_name_instead_of_the_factory_device_label(self):
        client = OwnerClient(Owner.server)
        client.call = Mock(side_effect=[
            [{'unitId': 7, 'unitName': 'Front door', 'role': 'OWNER'}],
            [{'unitId': 7, 'name': 'ESP32-80B54EC8149C', 'state': 'ACTIVE', 'setupReady': True}],
        ])
        self.assertEqual('Front door', client.doors()[0]['name'])

    def test_http_recognition_uses_scoped_device_auth_without_broker_configuration(self):
        publisher = HttpPublisher(Config(device_uid='FACE-laptop', device_secret='private-key', event_transport='http'))
        publisher.api.call = Mock()
        publisher.publish('face', {'eventUuid': 'event', 'liveness': 'LIVE'})
        publisher.api.call.assert_called_once_with('POST', '/api/face-node/events', json={'eventUuid': 'event', 'liveness': 'LIVE'})
        self.assertEqual('private-key', publisher.api.session.headers['X-Device-Secret'])
        publisher.close()


if __name__ == '__main__': unittest.main()
