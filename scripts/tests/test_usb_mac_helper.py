import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[2]/'smart-access-control-backend/src/main/resources/usb/read_device_mac.py'
spec=importlib.util.spec_from_file_location('usb_helper',path);helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)

class MacParsingTests(unittest.TestCase):
    def test_verified_mac_and_duplicate_esptool_lines(self):
        self.assertEqual(helper.parse_mac('MAC: 80:b5:4e:c8:14:9c\nMAC: 80:b5:4e:c8:14:9c\n'),'80:B5:4E:C8:14:9C')
    def test_reject_unverified_or_conflicting_device_identity(self):
        for output in ['MAC: 00:00:00:00:00:00','MAC: FF:FF:FF:FF:FF:FF','error: 80:b5:4e:c8:14:9c','MAC: 80:b5:4e:c8:14:9c\nMAC: 80:b5:4e:c8:14:9d']:
            with self.subTest(output=output),self.assertRaises(ValueError):helper.parse_mac(output)

if __name__=='__main__':unittest.main()
