import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / 'smart-access-control-backend/src/main/resources/usb/provision_device.py'
spec = importlib.util.spec_from_file_location('usb_provision', path)
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)


class ProvisionHelperTests(unittest.TestCase):
    def test_chunks_split_at_64_bytes(self):
        self.assertEqual([len(c) for c in helper.chunks(b'x' * 130)], [64, 64, 2])

    def test_ack_requires_matching_mac(self):
        self.assertEqual(helper.parse_ack('FACTORY_PROVISIONED 80B54EC8149C', '80B54EC8149C'), 'OK')
        self.assertIsNone(helper.parse_ack('FACTORY_PROVISIONED 80B54EC8149D', '80B54EC8149C'))
        self.assertEqual(helper.parse_ack('FACTORY_REJECTED', '80B54EC8149C'), 'REJECTED')
        self.assertEqual(helper.parse_ack('FACTORY_STORAGE_FAILED', '80B54EC8149C'), 'STORAGE_FAILED')
        self.assertIsNone(helper.parse_ack('CONNECTED_READY factoryMac=80B54EC8149C', '80B54EC8149C'))

    def test_parse_info_fields(self):
        info = helper.parse_info('FACTORY_INFO mac=80B54EC8149C uid=ESP32-80B54EC8149C firmware=2.0.7 gen=1')
        self.assertEqual(info['uid'], 'ESP32-80B54EC8149C')
        self.assertEqual(info['firmware'], '2.0.7')
        self.assertEqual(helper.parse_info('garbage'), {})

    def test_bundle_must_name_the_chip(self):
        with self.assertRaises(ValueError):
            helper.bundle_mac('{"deviceUid":"ESP32-80B54EC8149C"}')
        self.assertEqual(helper.bundle_mac('{"factoryMac":"80b54ec8149c"}'), '80B54EC8149C')


if __name__ == '__main__':
    unittest.main()
