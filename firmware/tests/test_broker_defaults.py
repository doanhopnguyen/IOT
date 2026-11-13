"""Bản firmware Funnel có sẵn broker mặc định; bản thường không có. Biên dịch logic trên máy, không cần ESP32."""
from pathlib import Path
import shutil, subprocess, tempfile, unittest

root = Path(__file__).resolve().parents[1]
source = r'''
#include <assert.h>
#include <string.h>
#include "broker_defaults.h"
int main(){
#ifdef SMARTDOOR_FUNNEL_DEFAULTS
  assert(!strcmp(BrokerDefaults::HOST,"desktop-s2r046u.tailad91e1.ts.net"));
  assert(BrokerDefaults::TLS_PORT==8443);
  assert(!strncmp(BrokerDefaults::CA,"-----BEGIN CERTIFICATE-----",27));
  assert(strstr(BrokerDefaults::CA,"-----END CERTIFICATE-----"));
#else
  assert(!strcmp(BrokerDefaults::HOST,""));
  assert(BrokerDefaults::TLS_PORT==8883);
  assert(!strcmp(BrokerDefaults::CA,""));
#endif
  return 0;
}
'''


class BrokerDefaultsTests(unittest.TestCase):
    def run_case(self, *flags):
        compiler = shutil.which('g++') or shutil.which('c++')
        if not compiler:
            self.skipTest('No C++ compiler')
        with tempfile.TemporaryDirectory() as folder:
            src = Path(folder) / 'case.cpp'; src.write_text(source)
            exe = Path(folder) / 'case.exe'
            subprocess.run([compiler, '-std=c++17', *flags, '-I', str(root / 'include'), str(src), '-o', str(exe)], check=True)
            subprocess.run([str(exe)], check=True)

    def test_funnel_build_has_host_port_and_ca(self):
        self.run_case('-DSMARTDOOR_FUNNEL_DEFAULTS=1')

    def test_regular_build_has_no_broker_default(self):
        self.run_case()

    def test_funnel_env_exists_and_firmware_uses_defaults(self):
        ini = (root / 'platformio.connected.ini').read_text(encoding='utf-8')
        self.assertIn('[env:esp32-s3-funnel]', ini)
        self.assertIn('-D SMARTDOOR_FUNNEL_DEFAULTS=1', ini)
        network = (root / 'connected_door/network.h').read_text(encoding='utf-8')
        self.assertIn('doc["mqttHost"]|BrokerDefaults::HOST', network)
        self.assertIn('doc["mqttCa"]|BrokerDefaults::CA', network)


if __name__ == '__main__':
    unittest.main()
