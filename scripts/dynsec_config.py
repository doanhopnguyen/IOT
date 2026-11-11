"""Create the initial Mosquitto dynamic-security.json (backend + already provisioned devices).

The broker owns the file afterwards: the backend adds/disables device clients at runtime via
$CONTROL/dynamic-security/v1, so an existing file is never overwritten.
Role/ACL layout must match DynsecCommands.java in the backend.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import hashlib

PREFIX = 'smartdoor-iot'
DEVICE_PUBLISH = ('status', 'ack', 'access', 'face')
DEVICE_SUBSCRIBE = ('cmd', 'config', 'access-ack', 'ack-confirm')
CONTROL = '$CONTROL/dynamic-security/#'


def hash_password(password, salt, iterations=101):
    return base64.b64encode(hashlib.pbkdf2_hmac('sha512', password.encode(), salt, iterations)).decode()


def acl(kind, topic):
    return {'acltype': kind, 'topic': topic, 'priority': 0, 'allow': True}


def client(username, password, roles):
    salt = secrets.token_bytes(12)
    return {'username': username, 'textname': '', 'roles': [{'rolename': r} for r in roles],
            'salt': base64.b64encode(salt).decode(), 'password': hash_password(password, salt), 'iterations': 101}


def device_role(uid):
    base = f'{PREFIX}/{uid}/'
    return {'rolename': 'device-' + uid,
            'acls': [acl('publishClientSend', base + s) for s in DEVICE_PUBLISH]
                    + [acl('subscribeLiteral', base + s) for s in DEVICE_SUBSCRIBE]}


def build_config(backend_password, devices):
    roles = [
        {'rolename': 'admin', 'acls': [acl('publishClientSend', CONTROL), acl('publishClientReceive', CONTROL),
                                       acl('subscribePattern', CONTROL), acl('unsubscribePattern', CONTROL)]},
        {'rolename': 'backend-data', 'acls': [acl('subscribePattern', f'{PREFIX}/+/{s}') for s in DEVICE_PUBLISH]
                                             + [acl('publishClientSend', f'{PREFIX}/+/{s}') for s in DEVICE_SUBSCRIBE]},
    ]
    clients = [client('backend', backend_password, ['admin', 'backend-data'])]
    for uid, password in sorted(devices.items()):
        roles.append(device_role(uid))
        clients.append(client(uid, password, ['device-' + uid]))
    return {'defaultACLAccess': {'publishClientSend': False, 'publishClientReceive': True,
                                 'subscribe': False, 'unsubscribe': True},
            'clients': clients, 'groups': [], 'roles': roles}


def write_config(path, backend_password, devices):
    """Write only when missing; returns True when a new file was created."""
    path = Path(path)
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(build_config(backend_password, devices), indent=2) + '\n', encoding='utf-8')
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return True


def plugin_path(mosquitto_exe=None):
    """Plugin shipped next to the Windows mosquitto.exe; Linux images use /usr/lib."""
    if mosquitto_exe:
        candidate = Path(mosquitto_exe).parent / 'mosquitto_dynamic_security.dll'
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f'Missing {candidate}; reinstall Mosquitto 2 with plugins.')
    return Path('/usr/lib/mosquitto_dynamic_security.so')


def broker_conf(port, dynsec_file, plugin, data_dir):
    return '\n'.join([f'listener {port} 0.0.0.0', 'allow_anonymous false', f'plugin {Path(plugin).as_posix()}',
                      f'plugin_opt_config_file {Path(dynsec_file).as_posix()}', 'persistence true',
                      f'persistence_location {Path(data_dir).as_posix()}/', 'log_dest stdout']) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--backend-password-from', required=True, type=Path,
                        help='JSON file with broker_password (e.g. .local/runtime.json or team server.json)')
    parser.add_argument('--devices', type=Path, help='JSON {uid: mqttPassword} of devices provisioned before dynsec')
    args = parser.parse_args()
    backend = json.loads(args.backend_password_from.read_text(encoding='utf-8-sig'))['broker_password']
    devices = json.loads(args.devices.read_text(encoding='utf-8-sig')) if args.devices and args.devices.exists() else {}
    print('Created' if write_config(args.out, backend, devices) else 'Kept existing (broker-managed)', args.out)


if __name__ == '__main__':
    main()
