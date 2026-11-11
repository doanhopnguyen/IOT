"""Private backend helper: write the factory image, then the FACTORY bundle, to an ESP32-S3 on USB.

--flash      esptool write_flash --erase-all 0x0 <image>
--provision  bundle JSON is read from stdin (never argv), sent as `FACTORY <json>`, verified with INFO.
Only JSON is written to stdout; serial lines and the bundle are never echoed.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

PORT = re.compile(r'COM[1-9][0-9]{0,3}', re.I)


def chunks(data, size=64):
    return [data[i:i + size] for i in range(0, len(data), size)]


def parse_ack(line, mac):
    if line == 'FACTORY_REJECTED':
        return 'REJECTED'
    if line == 'FACTORY_STORAGE_FAILED':
        return 'STORAGE_FAILED'
    if line.startswith('FACTORY_PROVISIONED ') and line.split(' ', 1)[1].strip().upper() == mac:
        return 'OK'
    return None


def parse_info(line):
    if not line.startswith('FACTORY_INFO '):
        return {}
    return dict(part.split('=', 1) for part in line[len('FACTORY_INFO '):].split() if '=' in part)


def bundle_mac(text):
    mac = str(json.loads(text).get('factoryMac', '')).replace(':', '').upper()
    if not re.fullmatch(r'[0-9A-F]{12}', mac):
        raise ValueError('INVALID_BUNDLE')
    return mac


def ports():
    from serial.tools import list_ports
    return {p.device.upper() for p in list_ports.comports() if PORT.fullmatch(p.device) and p.vid is not None}


def flash(port, image, esptool):
    if not esptool or not Path(esptool).is_file():
        raise ValueError('TOOL_UNAVAILABLE')
    if not Path(image).is_file():
        raise ValueError('FLASH_FAILED')
    result = subprocess.run([sys.executable, esptool, '--chip', 'esp32s3', '--port', port, '--baud', '460800',
                             '--before', 'default_reset', '--after', 'hard_reset',
                             'write_flash', '--erase-all', '0x0', str(image)],
                            capture_output=True, encoding='utf-8', errors='replace', timeout=230)
    if result.returncode:
        raise ValueError('FLASH_FAILED')
    return {'port': port, 'written': True}


def open_link(port, deadline):
    """USB CDC disappears while the chip reboots; retry until it is back."""
    import serial
    while time.monotonic() < deadline:
        try:
            link = serial.Serial(port, 115200, timeout=.3)
            link.dtr = True; link.rts = False
            time.sleep(2)
            link.reset_input_buffer()
            return link
        except (serial.SerialException, OSError):
            time.sleep(1)
    raise ValueError('TIMEOUT')


def send(link, text):
    for part in chunks((text + '\n').encode()):
        link.write(part); link.flush(); time.sleep(.02)


def lines(link, until):
    while time.monotonic() < until:
        try:
            raw = link.readline()
        except OSError:
            return
        line = raw.decode(errors='replace').strip()
        if line:
            yield line


def info(port, mac, deadline):
    """Ask INFO until the running firmware answers for this chip."""
    while time.monotonic() < deadline:
        link = open_link(port, deadline)
        try:
            send(link, 'INFO')
            for line in lines(link, min(deadline, time.monotonic() + 12)):
                fields = parse_info(line)
                if fields.get('mac', '').upper() == mac:
                    return fields
        finally:
            link.close()
    raise ValueError('TIMEOUT')


def provision(port, bundle):
    mac = bundle_mac(bundle)
    uid = json.loads(bundle).get('deviceUid')
    deadline = time.monotonic() + 80
    try:
        info(port, mac, min(deadline, time.monotonic() + 45))  # firmware is up and listening on serial
    except ValueError as error:
        raise ValueError('NO_BOOT') if str(error) == 'TIMEOUT' else error
    link = open_link(port, deadline)
    try:
        send(link, 'FACTORY ' + bundle)
        result = None
        for line in lines(link, min(deadline, time.monotonic() + 20)):
            result = parse_ack(line, mac)
            if result:
                break
    finally:
        link.close()
    if result != 'OK':
        raise ValueError(result or 'NO_ACK')
    time.sleep(3)  # chip restarts after storing the bundle
    fields = info(port, mac, deadline)
    if fields.get('uid') != uid:
        raise ValueError('INFO_MISMATCH')
    return {'factoryMac': mac, 'uid': fields.get('uid'), 'firmware': fields.get('firmware', '')}


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--flash', action='store_true')
    mode.add_argument('--provision', action='store_true')
    parser.add_argument('--port', required=True)
    parser.add_argument('--image')
    parser.add_argument('--esptool')
    args = parser.parse_args()
    port = args.port.upper()
    if not PORT.fullmatch(port):
        raise ValueError('INVALID_PORT')
    if port not in ports():
        raise ValueError('PORT_NOT_FOUND')
    if args.flash:
        return flash(port, args.image, args.esptool)
    return provision(port, sys.stdin.readline().strip())


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=True))
    except subprocess.TimeoutExpired:
        print(json.dumps({'error': 'TIMEOUT'})); sys.exit(2)
    except (ValueError, OSError) as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z_]+', str(error)) else 'TOOL_UNAVAILABLE'
        print(json.dumps({'error': code})); sys.exit(2)
    except Exception:
        print(json.dumps({'error': 'TOOL_UNAVAILABLE'})); sys.exit(2)
