"""Create an isolated local installation. Secrets stay in ignored files, never stdout."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import shutil
import pymysql
import bcrypt
from local_runtime import mosquitto_tool

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
STATE = LOCAL / 'runtime.json'


def save(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')


def prepare():
    if STATE.exists():
        raise SystemExit('Local configuration already exists; preserve it instead of replacing secrets.')
    admin = pymysql.connect(host='127.0.0.1', user=os.getenv('MYSQL_ADMIN_USER', 'root'),
                            password=os.environ['MYSQL_ADMIN_PASSWORD'], autocommit=True)
    suffix = secrets.token_hex(3)
    cfg = dict(lan_ip=os.environ['LOCAL_LAN_IP'], db_name='smart_access_dev_' + suffix,
               db_user='iot_dev_' + suffix, db_password=secrets.token_urlsafe(24),
               broker_port=1884, broker_user='backend', broker_password=secrets.token_urlsafe(24),
               device_uid='door-80b54ec8149c', device_secret=secrets.token_urlsafe(32),
               device_mqtt_password=secrets.token_urlsafe(24),
               face_uid='face-laptop-' + suffix, face_secret=secrets.token_urlsafe(32),
               face_mqtt_password=secrets.token_urlsafe(24),
               app_email='admin@smartdoor.local', app_password='Door!' + secrets.token_urlsafe(12))
    with admin.cursor() as cur:
        cur.execute(f"CREATE DATABASE `{cfg['db_name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        cur.execute('CREATE USER %s@\'localhost\' IDENTIFIED BY %s', (cfg['db_user'], cfg['db_password']))
        cur.execute(f"GRANT ALL PRIVILEGES ON `{cfg['db_name']}`.* TO %s@'localhost'", (cfg['db_user'],))
    admin.close()
    save(STATE, json.dumps(cfg, indent=2) + '\n')
    db = pymysql.connect(host='127.0.0.1', user=cfg['db_user'], password=cfg['db_password'], database=cfg['db_name'])
    db.close()
    env = dict(DB_URL=f"jdbc:mysql://127.0.0.1:3306/{cfg['db_name']}?serverTimezone=Asia/Ho_Chi_Minh",
               DB_USERNAME=cfg['db_user'], DB_PASSWORD=cfg['db_password'],
               MQTT_BROKER_URL='tcp://127.0.0.1:1884', MQTT_USERNAME=cfg['broker_user'],
               MQTT_PASSWORD=cfg['broker_password'], MQTT_TOPIC_PREFIX='smartdoor-iot',
               CORS_ALLOWED_ORIGINS=f"http://localhost:8081,http://127.0.0.1:8081,http://{cfg['lan_ip']}:8081",
               SESSION_COOKIE_SECURE='false', SPRING_JPA_SHOW_SQL='false', LOGGING_LEVEL_ROOT='INFO')
    save(ROOT / 'smart-access-control-backend/.env', ''.join(f'{k}={v}\n' for k, v in env.items()))
    save(ROOT / 'IOT_mobile/.env', f"EXPO_PUBLIC_API_BASE_URL=http://{cfg['lan_ip']}:8080\n")
    template = (ROOT / 'firmware/include/config.example.h').read_text(encoding='utf-8')
    overrides = dict(DEVICE_UID=cfg['device_uid'], DEVICE_SECRET=cfg['device_secret'], MQTT_HOST=cfg['lan_ip'],
                     MQTT_USER=cfg['device_uid'], MQTT_PASSWORD=cfg['device_mqtt_password'])
    for key, value in overrides.items():
        import re
        template = re.sub(r'^#define ' + key + r' .*$', '#define ' + key + ' ' + json.dumps(value), template, flags=re.M)
    template = template.replace('#define MQTT_PORT 1883', '#define MQTT_PORT 1884')
    path = ROOT / 'firmware/include/smartdoor_config.h'
    if path.exists():
        raise SystemExit('Firmware config exists; new runtime state saved, inspect before replacing it.')
    save(path, template)
    save(ROOT / 'face-node/.env', '\n'.join([
        'FACE_API_URL=http://127.0.0.1:8080', f"FACE_DEVICE_UID={cfg['face_uid']}",
        f"FACE_DEVICE_SECRET={cfg['face_secret']}", 'MQTT_HOST=127.0.0.1', 'MQTT_PORT=1884',
        f"MQTT_USERNAME={cfg['face_uid']}", f"MQTT_PASSWORD={cfg['face_mqtt_password']}",
        'MQTT_TOPIC_PREFIX=smartdoor-iot', 'FACE_LIVENESS_ENABLED=true', 'FACE_ALLOW_UNVERIFIED_LIVENESS=false',
    ]) + '\n')
    print(f"Created isolated DB {cfg['db_name']} and account {cfg['db_user']} (database-only grants).")
    print('Local secrets and component configurations saved; no root password stored.')


def broker():
    cfg = json.loads(STATE.read_text())
    destination = LOCAL / 'mosquitto'
    destination.mkdir(exist_ok=True)
    (destination / 'data').mkdir(exist_ok=True)
    # Broker dùng plugin dynamic-security: backend tự tạo tài khoản thiết bị khi nạp code.
    # File chỉ sinh lần đầu (kèm thiết bị cấp phát trước đây); sau đó broker tự quản lý.
    from dynsec_config import write_config, plugin_path, broker_conf
    registry = LOCAL / 'broker-devices.json'
    entries = json.loads(registry.read_text()) if registry.exists() else {}
    dynsec_file = destination / 'data' / 'dynamic-security.json'
    write_config(dynsec_file, cfg['broker_password'], entries)
    save(destination / 'mosquitto.conf', broker_conf(1884, dynsec_file, plugin_path(mosquitto_tool('mosquitto')), destination / 'data'))
    print('Private broker configuration prepared on port 1884; existing broker on 1883 is unchanged.')


def seed():
    cfg = json.loads(STATE.read_text())
    db = pymysql.connect(host='127.0.0.1', user=cfg['db_user'], password=cfg['db_password'], database=cfg['db_name'])
    def hashed(value): return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()
    with db.cursor() as cur:
        cur.execute('SELECT account_id FROM accounts WHERE email=%s', (cfg['app_email'],))
        if cur.fetchone():
            print('Application seed already exists; leaving it unchanged.'); return
        cur.execute("INSERT INTO accounts(full_name,email,password_hash,is_admin,status,created_at,updated_at) "
                    "VALUES (%s,%s,%s,true,'ACTIVE',NOW(3),NOW(3))", ('Smart Door Admin', cfg['app_email'], hashed(cfg['app_password'])))
        cfg['account_id'] = cur.lastrowid
    db.commit(); db.close(); save(STATE, json.dumps(cfg, indent=2) + '\n')
    print('Created only the application administrator. Register physical chips through admin inventory.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'broker', 'seed'])
    globals()[parser.parse_args().phase]()
