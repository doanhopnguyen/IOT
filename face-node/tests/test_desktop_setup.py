import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock

import requests
from desktop_setup import ApiFailure, DesktopController, OwnerClient, handler_for, server_origin
from config import Config
from node import HttpPublisher


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
        self.controller.connect('SD-000007')
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

    def test_foreign_code_cannot_provision_or_start_a_camera(self):
        with self.assertRaises(ApiFailure): self.controller.connect('SD-000008')
        self.assertEqual([], self.controller.owner.calls)
        self.start.assert_not_called()

    def test_switching_owner_accounts_stops_the_previous_door_camera(self):
        self.controller.connect('SD-000007'); self.state['ready'] = True; self.controller.tick()
        other = Owner(Owner.server); other.login = Mock(return_value={'accountId': 2, 'fullName': 'Other'})
        self.controller.owner_factory = lambda _: other
        self.controller.login(Owner.server, 'other@test', 'other-password')
        self.process.terminate.assert_called_once(); self.assertFalse(self.controller.snapshot()['armed'])

    def test_existing_camera_requires_explicit_replacement(self):
        self.controller.owner.nodes = [{'deviceCode': 'FACE-other-laptop'}]
        with self.assertRaises(ApiFailure): self.controller.connect('SD-000007')
        self.assertFalse(any(call[0] == 'DELETE' for call in self.controller.owner.calls))
        self.controller.connect('SD-000007', replace=True)
        self.assertTrue(any(call[0] == 'DELETE' for call in self.controller.owner.calls))

    def test_reconnect_reuses_local_node_without_duplicate_provisioning(self):
        self.controller.connect('SD-000007'); self.controller.connect('SD-000007')
        creates = [call for call in self.controller.owner.calls if call[0] == 'POST']
        self.assertEqual(1, len(creates))

    def test_lost_connection_pauses_and_recovers_but_stop_does_not_restart(self):
        self.controller.connect('SD-000007'); self.state['ready'] = True; self.controller.tick()
        self.state['doorOnline'] = False; self.controller.tick()
        self.process.terminate.assert_called_once()
        self.state['doorOnline'] = True; self.controller.tick(); self.assertEqual(2, self.start.call_count)
        self.controller.stop(); self.controller.tick(); self.assertEqual(2, self.start.call_count)
        self.assertFalse(json.loads(self.path.read_text())['armed'])

    def test_credential_revocation_disarms_instead_of_retrying_or_replaying(self):
        self.controller.connect('SD-000007')
        response = requests.Response(); response.status_code = 401
        self.controller.connection_reader = Mock(side_effect=requests.HTTPError(response=response))
        self.controller.tick(); self.assertFalse(self.controller.snapshot()['armed'])
        self.assertEqual('ERROR', self.controller.snapshot()['phase'])

    def test_camera_switched_to_another_door_is_not_used(self):
        self.controller.connect('SD-000007'); self.state['doorCode'] = 'SD-000008'
        self.state['ready'] = True; self.controller.tick()
        self.start.assert_not_called(); self.assertFalse(self.controller.snapshot()['armed'])

    def test_auto_restart_uses_saved_device_identity_without_saving_owner_password(self):
        self.controller.connect('SD-000007', auto=True)
        resumed = DesktopController(self.path, Owner, lambda _: dict(self.state), self.start)
        self.assertFalse(resumed.snapshot()['authenticated']); self.assertTrue(resumed.snapshot()['armed'])
        self.state['ready'] = True; resumed.tick(); self.start.assert_called_once(); resumed.close()
        self.controller.connect('SD-000007', auto=False)
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
            self.assertEqual(403, session.get(base + '/api/state', headers={'Host': 'attacker.invalid'}).status_code)
            self.assertEqual(403, session.post(base + '/api/stop', json={}, headers={'X-Local-Token': 'private-local-token', 'Origin': 'https://attacker.invalid'}).status_code)
            page = session.get(base).text
            self.assertIn('private-local-token', page); self.assertNotIn('account-password', page)
            state = session.get(base + '/api/state', headers={'X-Local-Token': 'private-local-token'})
            self.assertEqual(200, state.status_code); self.assertNotIn('private-camera-key', state.text)
        finally:
            server.shutdown(); server.server_close(); worker.join(timeout=3)

    def test_backend_origin_does_not_accept_credentials_paths_or_redirect_targets(self):
        for value in ['file:///etc/passwd', 'http://user:pass@server', 'https://server/path', 'https://server?key=secret']:
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
