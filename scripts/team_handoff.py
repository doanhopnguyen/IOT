"""Prepare matching factory/SQL credentials and install a four-laptop demo role.

Secrets are written only under .local; no database or device is erased here.
"""
import argparse
import hashlib
import ipaddress
import json
import secrets
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PEOPLE = dict(cuong='100.95.248.100', thuy='100.109.158.8', bang='100.115.154.86', hop='100.111.90.116')
UID = 'ESP32-80B54EC8149C'


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding='utf-8')


def dump(path, value):
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sql(value):
    # Generated values are printable ASCII with no SQL escape sequences.
    if not all(32 <= ord(c) < 127 for c in value) or any(c in value for c in "'\\;"):
        raise ValueError('Unsafe SQL literal')
    return "'" + value + "'"


def seed_sql(c):
    return f"""-- Run after Flyway V1..V7 in smart_access_team. No USB required.
START TRANSACTION;
INSERT INTO accounts(full_name,email,password_hash,is_admin,status,created_at,updated_at)
SELECT 'Team Administrator',{sql(c['admin_email'])},{sql(c['admin_hash'])},TRUE,'ACTIVE',NOW(3),NOW(3)
WHERE NOT EXISTS(SELECT 1 FROM accounts WHERE email={sql(c['admin_email'])});
INSERT INTO devices(device_uid,device_name,device_type,device_secret_hash,bootstrap_secret_hash,
local_admin_pin_enabled,hardware_version,firmware_version,lifecycle_status,created_at,updated_at)
SELECT '{UID}','Smart Door cua Hop','DOOR_CONTROLLER',{sql(c['device_hash'])},{sql(c['bootstrap_hash'])},
FALSE,'esp32s3-n16r8','2.0.5-demo','REGISTERED',NOW(3),NOW(3)
WHERE NOT EXISTS(SELECT 1 FROM devices WHERE device_uid='{UID}');
INSERT INTO device_inventory(device_id,factory_mac,claim_hash,state,generation,setup_ready,state_updated_at)
SELECT device_id,'80B54EC8149C',{sql(c['claim_hash'])},'INVENTORY',1,FALSE,NOW(3)
FROM devices WHERE device_uid='{UID}' AND NOT EXISTS
(SELECT 1 FROM device_inventory WHERE factory_mac='80B54EC8149C');
COMMIT;
SELECT d.device_uid,i.factory_mac,i.state,i.generation,i.setup_ready
FROM devices d JOIN device_inventory i ON i.device_id=d.device_id WHERE d.device_uid='{UID}';
"""


def create(destination, lan):
    import bcrypt
    address = ipaddress.IPv4Address(lan)
    if not address.is_private or address.is_loopback or address.is_unspecified:
        raise ValueError('Use the Hop Wi-Fi LAN IPv4, not its Tailscale IP')
    if destination.exists():
        raise ValueError('Bundle already exists: reuse it; never silently rotate factory credentials')
    token = lambda: secrets.token_urlsafe(24)
    hashed = lambda value: bcrypt.hashpw(value.encode(), bcrypt.gensalt(rounds=12)).decode()
    secret, code, password = token(), token(), 'Team!' + token()[:16]
    c = dict(people=PEOPLE, lan=str(address), uid=UID, db_name='smart_access_team', db_user='smartdoor_team',
             db_password=token(), broker_password=token(), device_mqtt_password=token(),
             processor_token=secrets.token_urlsafe(32), admin_email='admin@smartdoor.team', admin_password=password,
             admin_hash=hashed(password), device_hash=hashed(secret), bootstrap_hash=hashed(token()),
             claim_hash=hashlib.sha256(code.encode()).hexdigest())
    factory = dict(deviceUid=UID, factoryMac='80B54EC8149C', generation=1, deviceSecret=secret,
                   activationCode=code, setupSsid='SmartDoor-C8149C', setupPassword=token()[:12])
    connection = dict(mqttHost=str(address), mqttPort=1884, mqttUser=UID, mqttPassword=c['device_mqtt_password'],
                      mqttTls=False, allowLocalPlaintext=True)
    dump(destination/'cuong/server.json', c)
    write(destination/'cuong/01-seed-admin-device.sql', seed_sql(c))
    write(destination/'cuong/00-create-database.sql', f"CREATE DATABASE IF NOT EXISTS smart_access_team CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nCREATE USER IF NOT EXISTS 'smartdoor_team'@'localhost' IDENTIFIED BY {sql(c['db_password'])};\nGRANT ALL PRIVILEGES ON smart_access_team.* TO 'smartdoor_team'@'localhost';\n")
    dump(destination/'hop/FACTORY_ESP32-80B54EC8149C.json', factory)
    dump(destination/'hop/ESP32-80B54EC8149C-connection.json', connection)
    dump(destination/'hop/role.json', dict(role='hop', people=PEOPLE, lan=str(address)))
    dump(destination/'thuy/role.json', dict(role='thuy', people=PEOPLE))
    login = f"Admin URL: http://{PEOPLE['thuy']}:8080/admin/index.html\nEmail: {c['admin_email']}\nPassword: {password}\n"
    write(destination/'bang/ADMIN_ACCESS.txt', login)
    write(destination/'cuong/ADMIN_ACCESS.txt', login)
    # Hướng dẫn riêng từng người chỉ giữ cục bộ (.gitignore: /docs/team-tailscale/), không có trên CI/bản clone mới.
    guides = ROOT/'docs/team-tailscale'
    for role in PEOPLE:
        for name in ('00-THU-TU-CHAY.md', f'{role.upper()}.md'):
            if (guides/name).is_file():
                shutil.copy2(guides/name, destination/role/name)
            else:
                print('Skipped missing local guide', guides/name)
    print('Created matching SQL, role configs and factory bundle at', destination)


def install(role, bundle):
    target = ROOT/'.local/team'
    if (target/'role.json').exists():
        previous = json.loads((target/'role.json').read_text())
        if previous['role'] != role:
            raise ValueError('This computer already has a different team role')
    if role == 'cuong':
        c = json.loads((bundle/'server.json').read_text(encoding='utf-8-sig'))
        if (target/'server.json').exists() and json.loads((target/'server.json').read_text()) != c:
            raise ValueError('Different server credentials already installed')
        dump(target/'server.json', c)
        dump(target/'role.json', dict(role=role, people=c['people']))
        for name in ('00-create-database.sql', '01-seed-admin-device.sql', 'ADMIN_ACCESS.txt'):
            write(target/name, (bundle/name).read_text(encoding='utf-8-sig'))
        env = dict(DB_URL='jdbc:mysql://127.0.0.1:3306/smart_access_team?serverTimezone=Asia/Ho_Chi_Minh',
                   DB_USERNAME=c['db_user'], DB_PASSWORD=c['db_password'], MQTT_ENABLED='true',
                   MQTT_BROKER_URL='tcp://127.0.0.1:1884', MQTT_USERNAME='backend', MQTT_PASSWORD=c['broker_password'],
                   MQTT_TOPIC_PREFIX='smartdoor-iot', FACE_PROCESSOR_URL='http://127.0.0.1:8091/extract',
                   FACE_PROCESSOR_TOKEN=c['processor_token'], USB_ENABLED='false',
                   PROVISION_MQTT_HOST=c['lan'], PROVISION_MQTT_PORT='1884', SERVER_ADDRESS='0.0.0.0',
                   SERVER_PORT='8080', SESSION_COOKIE_SECURE='false', SPRING_JPA_SHOW_SQL='false',
                   APP_DEVICE_BASE_URL=f"http://{c['lan']}:8080",
                   CORS_ALLOWED_ORIGINS=','.join(f'http://{ip}:{port}' for ip in [*PEOPLE.values(),'localhost','127.0.0.1'] for port in [8080,8081]))
        write(target/'backend.env', ''.join(f'{k}={v}\n' for k,v in env.items()))
        write(target/'face.env', f"FACE_PROCESSOR_TOKEN={c['processor_token']}\nFACE_PROCESSOR_PORT=8091\n")
        from local_runtime import mosquitto_tool
        broker = (target/'mosquitto').resolve()
        (broker/'data').mkdir(parents=True, exist_ok=True)
        from dynsec_config import write_config, plugin_path, broker_conf
        dynsec_file = broker/'data'/'dynamic-security.json'
        write_config(dynsec_file, c['broker_password'], {UID: c['device_mqtt_password']})
        write(broker/'mosquitto.conf', broker_conf(1884, dynsec_file, plugin_path(mosquitto_tool('mosquitto')), broker/'data'))
    else:
        c = json.loads((bundle/'role.json').read_text(encoding='utf-8-sig'))
        if c['role'] != role:
            raise ValueError('Wrong role bundle')
        dump(target/'role.json', c)
        if role == 'thuy':
            write(ROOT/'IOT_mobile/.env', f"EXPO_PUBLIC_API_BASE_URL=http://{PEOPLE['cuong']}:8080\n")
    print('Installed role', role, 'under .local/team; no existing local DB was modified')


def seed(bundle):
    import bcrypt
    import pymysql
    c = json.loads((bundle/'server.json').read_text(encoding='utf-8-sig'))
    db = pymysql.connect(host='127.0.0.1', user=c['db_user'], password=c['db_password'], database=c['db_name'], charset='utf8mb4')
    try:
        with db.cursor() as cur:
            cur.execute('SELECT success FROM flyway_schema_history WHERE version=%s', ('7',))
            if cur.fetchone() != (1,):
                raise ValueError('Start backend and wait for Flyway V7 before seeding')
            cur.execute('SELECT password_hash,is_admin FROM accounts WHERE email=%s', (c['admin_email'],))
            row = cur.fetchone()
            if row and (not row[1] or not bcrypt.checkpw(c['admin_password'].encode(), row[0].encode())):
                raise ValueError('Conflicting admin account; no password will be overwritten')
            cur.execute('SELECT device_secret_hash FROM devices WHERE device_uid=%s', (UID,))
            row = cur.fetchone()
            if row and row[0] != c['device_hash']:
                raise ValueError('Conflicting device identity; do not overwrite an existing device')
            cur.execute('SELECT claim_hash,state FROM device_inventory WHERE factory_mac=%s', ('80B54EC8149C',))
            row = cur.fetchone()
            if row and (row[0] != c['claim_hash'] or row[1] != 'INVENTORY'):
                raise ValueError('Device is already claimed or uses another QR; seed is first-install only')
            for statement in (bundle/'01-seed-admin-device.sql').read_text(encoding='utf-8-sig').split(';'):
                if statement.strip():
                    cur.execute(statement)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print('Admin and matching factory device ready in smart_access_team; no USB needed')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='action', required=True)
    create_p=sub.add_parser('create'); create_p.add_argument('--destination',type=Path,required=True); create_p.add_argument('--hop-lan',required=True)
    install_p=sub.add_parser('install'); install_p.add_argument('--role',choices=['cuong','thuy','hop'],required=True); install_p.add_argument('--bundle',type=Path,required=True)
    seed_p=sub.add_parser('seed'); seed_p.add_argument('--bundle',type=Path,default=ROOT/'.local/team')
    sub.add_parser('broker-path')
    a=p.parse_args()
    if a.action=='create': create(a.destination,a.hop_lan)
    elif a.action=='install': install(a.role,a.bundle)
    elif a.action=='seed': seed(a.bundle)
    else:
        from local_runtime import mosquitto_tool
        print(mosquitto_tool('mosquitto'))


if __name__=='__main__': main()
