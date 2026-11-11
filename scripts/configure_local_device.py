"""Retired: MQTT device accounts are now created by the backend (Mosquitto dynamic security).

Use the admin web "Nạp code" flow, or scripts/register_local_device.py which writes the
connection file returned by the backend. Existing devices were imported into
dynamic-security.json by scripts/dynsec_config.py / bootstrap_local.py broker.
"""
import sys

if __name__ == '__main__':
    print('Đã thay bằng tạo tài khoản MQTT tự động trong backend (dynamic security). '
          'Dùng web admin "Nạp code" hoặc scripts/register_local_device.py.', file=sys.stderr)
    sys.exit(2)
