"""Private backend helper: enumerate Windows USB serial ports or read ESP32-S3 MAC.
Only JSON is written to stdout; esptool output is never forwarded to the API.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from serial.tools import list_ports


def ports():
    return [dict(device=p.device.upper(), description=p.description or 'USB serial')
            for p in list_ports.comports()
            if re.fullmatch(r'COM[1-9][0-9]{0,3}', p.device, re.I) and p.vid is not None]


def parse_mac(output):
    matches = re.findall(r'^MAC:\s*([0-9a-f]{2}(?::[0-9a-f]{2}){5})\s*$', output, re.I | re.M)
    unique = {value.upper() for value in matches}
    if len(unique) != 1 or next(iter(unique)) in ('00:00:00:00:00:00', 'FF:FF:FF:FF:FF:FF'):
        raise ValueError('MAC_NOT_VERIFIED')
    return unique.pop()


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--list', action='store_true')
    mode.add_argument('--port')
    parser.add_argument('--esptool')
    args = parser.parse_args()
    if args.list:
        return {'ports': ports()}
    port = (args.port or '').upper()
    if not re.fullmatch(r'COM[1-9][0-9]{0,3}', port):
        raise ValueError('INVALID_PORT')
    if port not in {p['device'] for p in ports()}:
        raise ValueError('PORT_NOT_FOUND')
    if not args.esptool or not Path(args.esptool).is_file():
        raise ValueError('TOOL_UNAVAILABLE')
    result = subprocess.run([sys.executable, args.esptool, '--chip', 'esp32s3', '--port', port,
                             '--before', 'default_reset', '--after', 'hard_reset', 'read_mac'],
                            capture_output=True, encoding='utf-8', errors='replace', timeout=12)
    if result.returncode:
        raise ValueError('READ_FAILED')
    return {'port': port, 'factoryMac': parse_mac(result.stdout), 'chip': 'ESP32-S3'}


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=True))
    except subprocess.TimeoutExpired:
        print(json.dumps({'error': 'TIMEOUT'}));sys.exit(2)
    except (ValueError, OSError) as error:
        code = str(error) if isinstance(error, ValueError) else 'TOOL_UNAVAILABLE'
        print(json.dumps({'error': code}));sys.exit(2)
