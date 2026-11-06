"""Register a physical ESP32 and prepare separate factory/MQTT files on the central PC.

Run while the backend is up. Uses the private local bootstrap admin credentials.
Alternatively use --factory-file with the file downloaded from the admin website.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

import requests

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--mac")
    source.add_argument("--factory-file", type=Path)
    parser.add_argument("--name", default="Smart Door")
    parser.add_argument("--mqtt-host", required=True, help="LAN IPv4 of this ESP32 site's gateway")
    parser.add_argument("--mqtt-port", type=int, default=1884)
    args = parser.parse_args()
    # Validate endpoint before registering a device or issuing its one-time credentials.
    import ipaddress
    address = ipaddress.IPv4Address(args.mqtt_host)
    if not address.is_private or address.is_loopback or address.is_unspecified or not 1 <= args.mqtt_port <= 65535:
        parser.error("Use the site gateway private LAN IPv4 and a valid TCP port.")
    if args.factory_file:
        factory = json.loads(args.factory_file.read_text(encoding="utf-8-sig"))
    else:
        mac = args.mac.replace(":", "").replace("-", "").upper()
        if not re.fullmatch(r"[0-9A-F]{12}", mac):
            parser.error("Invalid MAC.")
        output = LOCAL / ("FACTORY_ESP32-" + mac + ".json")
        if output.exists():
            parser.error("Factory file already exists. Reuse it with --factory-file; do not issue another identity.")
        cfg = json.loads((LOCAL / "runtime.json").read_text(encoding="utf-8-sig"))
        session = requests.Session()
        base = "http://127.0.0.1:8080"

        def csrf():
            response = session.get(base + "/api/auth/csrf", timeout=10)
            response.raise_for_status()
            value = response.json()
            return {value["headerName"]: value["token"]}

        response = session.post(base + "/api/auth/login", headers=csrf(),
                                json={"identifier": cfg["app_email"], "password": cfg["app_password"]}, timeout=15)
        response.raise_for_status()
        response = session.post(base + "/api/admin/inventory", headers=csrf(),
                                json={"factoryMac": mac, "name": args.name}, timeout=15)
        response.raise_for_status()
        issued = response.json()
        factory = {"deviceUid": issued["device"]["deviceUid"], "factoryMac": issued["device"]["factoryMac"],
                   "generation": issued["device"]["generation"],
                   **{key: issued[key] for key in ("deviceSecret", "activationCode", "setupSsid", "setupPassword")}}
    uid = factory.get("deviceUid", "")
    if not re.fullmatch(r"ESP32-[0-9A-F]{12}", uid) or any(not factory.get(key) for key in
            ("factoryMac", "deviceSecret", "activationCode", "setupPassword", "generation")):
        parser.error("Incomplete factory bundle.")
    output = LOCAL / ("FACTORY_" + uid + ".json")
    output.write_text(json.dumps(factory, indent=2) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(ROOT / "scripts/configure_local_device.py"), "--uid", uid,
                    "--host", args.mqtt_host, "--mqtt-port", str(args.mqtt_port)], check=True)
    print("Factory file:", output)
    print("Copy ONLY this device's factory file and connection file to its USB provisioning PC.")
    print("Restart this project's broker to load its MQTT account, then run device_tool.py provision.")


if __name__ == "__main__":
    main()
