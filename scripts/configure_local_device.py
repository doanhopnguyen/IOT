"""Add a door/camera MQTT identity to this project's private demo broker."""
import argparse,json,secrets,subprocess,ipaddress
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];LOCAL=ROOT/'.local'
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--uid',required=True);p.add_argument('--host',required=True);p.add_argument('--wifi-ssid');a=p.parse_args()
 if not a.uid or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in a.uid):raise SystemExit('Invalid device UID')
 ip=ipaddress.ip_address(a.host)
 if not ip.is_private or ip.is_loopback:raise SystemExit('Use the PC LAN IPv4 address reachable from ESP32')
 cfg=json.loads((LOCAL/'runtime.json').read_text());path=LOCAL/'broker-devices.json'
 entries=json.loads(path.read_text()) if path.exists() else {}
 entries.setdefault(a.uid,secrets.token_urlsafe(24));path.write_text(json.dumps(entries,indent=2))
 passwordFile=LOCAL/'mosquitto/passwords';passwordFile.write_text(f"backend:{cfg['broker_password']}\n"+''.join(f'{uid}:{password}\n' for uid,password in entries.items()))
 subprocess.run([r'D:\ACER\Mosquitto\mosquitto_passwd.exe','-U',str(passwordFile)],check=True,stdout=subprocess.DEVNULL)
 connection=dict(mqttHost=a.host,mqttPort=1884,mqttUser=a.uid,mqttPassword=entries[a.uid],mqttTls=False,allowLocalPlaintext=True)
 if a.wifi_ssid is not None:connection.update(wifiSsid=a.wifi_ssid,wifiPassword='')
 output=LOCAL/(a.uid+'-connection.json');output.write_text(json.dumps(connection,indent=2))
 print('Private connection file:',output)
 print('Restart ONLY this project broker to reload credentials; provision with scripts/device_tool.py.')
 print('For a face node, copy mqttHost/mqttPort/mqttUser/mqttPassword into MQTT_HOST/PORT/USERNAME/PASSWORD in its private .env.')
if __name__=='__main__':main()
