import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dynsec_config', SCRIPTS / 'dynsec_config.py')
dynsec = importlib.util.module_from_spec(spec); spec.loader.exec_module(dynsec)
UID = 'ESP32-80B54EC8149C'


def by_name(items, key, value):
    return next(item for item in items if item[key] == value)


def acl_set(role):
    return {(a['acltype'], a['topic']) for a in role['acls'] if a['allow']}


class DynsecConfigTests(unittest.TestCase):
    def test_backend_client_has_admin_and_data_roles(self):
        config = dynsec.build_config('backend-pw', {})
        backend = by_name(config['clients'], 'username', 'backend')
        self.assertEqual({r['rolename'] for r in backend['roles']}, {'admin', 'backend-data'})
        admin = acl_set(by_name(config['roles'], 'rolename', 'admin'))
        self.assertIn(('publishClientSend', '$CONTROL/dynamic-security/#'), admin)
        self.assertIn(('subscribePattern', '$CONTROL/dynamic-security/#'), admin)
        data = acl_set(by_name(config['roles'], 'rolename', 'backend-data'))
        self.assertEqual(data, {('subscribePattern', f'smartdoor-iot/+/{s}') for s in ('status', 'ack', 'access', 'face')}
                         | {('publishClientSend', f'smartdoor-iot/+/{s}') for s in ('cmd', 'config', 'access-ack', 'ack-confirm')})

    def test_password_hash_matches_pbkdf2_sha512(self):
        client = by_name(dynsec.build_config('backend-pw', {})['clients'], 'username', 'backend')
        self.assertEqual(client['iterations'], 101)
        expected = hashlib.pbkdf2_hmac('sha512', b'backend-pw', base64.b64decode(client['salt']), 101)
        self.assertEqual(base64.b64decode(client['password']), expected)
        self.assertNotIn('backend-pw', json.dumps(client))

    def test_existing_devices_get_uid_scoped_role(self):
        config = dynsec.build_config('backend-pw', {UID: 'device-pw'})
        client = by_name(config['clients'], 'username', UID)
        self.assertEqual(client['roles'], [{'rolename': 'device-' + UID}])
        role = acl_set(by_name(config['roles'], 'rolename', 'device-' + UID))
        base = f'smartdoor-iot/{UID}/'
        self.assertEqual(role, {('publishClientSend', base + s) for s in ('status', 'ack', 'access', 'face')}
                         | {('subscribeLiteral', base + s) for s in ('cmd', 'config', 'access-ack', 'ack-confirm')})

    def test_default_acl_denies_publish_and_subscribe(self):
        self.assertEqual(dynsec.build_config('pw', {})['defaultACLAccess'],
                         {'publishClientSend': False, 'publishClientReceive': True, 'subscribe': False, 'unsubscribe': True})

    def test_write_never_overwrites_broker_managed_file(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'dynamic-security.json'
            self.assertTrue(dynsec.write_config(target, 'pw', {}))
            target.write_text('{"clients":["added-by-backend"]}')
            self.assertFalse(dynsec.write_config(target, 'pw', {}))
            self.assertIn('added-by-backend', target.read_text())


if __name__ == '__main__':
    unittest.main()
