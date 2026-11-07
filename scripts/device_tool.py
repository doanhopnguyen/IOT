"""USB provisioning; factory credentials stay in local JSON, never in command arguments."""
import argparse
import json
import re
from pathlib import Path
import time
import serial

def transact(port, command, timeout=15):
    with serial.Serial(port,115200,timeout=.3) as link:
        link.dtr=True;link.rts=False
        time.sleep(2)
        link.reset_input_buffer()
        wire=(command+'\n').encode()
        for offset in range(0,len(wire),64):
            link.write(wire[offset:offset+64]);link.flush();time.sleep(.02)
        lines=[];deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            line=link.readline().decode(errors='replace').strip()
            if line:
                # Never echo input or secrets emitted by an unexpected firmware.
                if line.startswith(('FACTORY_INFO ','FACTORY_PROVISIONED ')) or line in ('FACTORY_REJECTED','FACTORY_STORAGE_FAILED','WIFI_RESET_COMPLETE','WIFI_RESET_REJECTED','WIFI_RESET_FAILED'):
                    print(line);lines.append(line)
                if line.startswith('FACTORY_PROVISIONED '):return
                if command == 'INFO' and line.startswith('FACTORY_INFO '):return
                if command.startswith('FORGET_WIFI '):
                    if line=='WIFI_RESET_COMPLETE':return
                    if line in ('WIFI_RESET_REJECTED','WIFI_RESET_FAILED'):
                        raise SystemExit('Wi-Fi cleanup not verified. The chip must be unclaimed and contain no user configuration.')
        if command.startswith('FACTORY ') and not any(x.startswith('FACTORY_PROVISIONED ') for x in lines):
            raise SystemExit('No provisioning acknowledgement; check firmware, MAC and USB port.')
        if command == 'INFO':
            raise SystemExit('No device information received; check firmware and USB port.')
        if command.startswith('FORGET_WIFI '):
            raise SystemExit('No Wi-Fi cleanup acknowledgement; do not assume the network was erased.')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--port',default='COM5')
    sub=p.add_subparsers(dest='action',required=True)
    sub.add_parser('info')
    forget=sub.add_parser('forget-wifi',help='Clear saved Wi-Fi on an unclaimed, unconfigured chip; preserve product QR and identity')
    forget.add_argument('--confirm-uid',required=True)
    provision=sub.add_parser('provision');provision.add_argument('--device',required=True,type=Path);provision.add_argument('--connection',required=True,type=Path)
    a=p.parse_args()
    if a.action=='info':transact(a.port,'INFO');return
    if a.action=='forget-wifi':
        if not re.fullmatch(r'ESP32-[0-9A-F]{12}',a.confirm_uid):p.error('Use the exact ESP32 device UID to confirm Wi-Fi cleanup.')
        transact(a.port,'FORGET_WIFI '+a.confirm_uid);return
    device=json.loads(a.device.read_text(encoding='utf-8-sig'));connection=json.loads(a.connection.read_text(encoding='utf-8-sig'))
    if not device.get('deviceSecret') or not device.get('factoryMac'):raise SystemExit('Missing factory credentials.')
    if not device.get('activationCode') or not device.get('setupPassword'):
        raise SystemExit('Use the new factory file containing activationCode and setupPassword; buyer setup must be prepared before shipping.')
    if set(device)&set(connection):raise SystemExit('Connection file must not override device identity.')
    data={**device,**connection}
    if data.get('mqttTls',True) and not data.get('mqttCa'):raise SystemExit('TLS requires a trusted CA certificate in mqttCa.')
    transact(a.port,'FACTORY '+json.dumps(data,separators=(',',':')),30)

if __name__=='__main__':main()
