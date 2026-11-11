"""Fallback CLI: register a physical ESP32 by MAC and write its factory + MQTT connection files.

Preferred flow is the admin web: "Add device" then "Flash" (backend flashes and provisions over USB).
Use this only when the backend cannot reach the USB port (e.g. backend runs in Docker).
The backend creates the device's MQTT account itself (Mosquitto dynamic security) and returns the
connection; set PROVISION_MQTT_HOST on the backend to the broker address the ESP32 can reach.
"""
import argparse
import json
from pathlib import Path
import re

import requests

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mac", required=True)
    parser.add_argument("--name", default="Smart Door")
    parser.add_argument("--backend", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    mac = args.mac.replace(":", "").replace("-", "").upper()
    if not re.fullmatch(r"[0-9A-F]{12}", mac):
        parser.error("Invalid MAC.")
    output = LOCAL / ("FACTORY_ESP32-" + mac + ".json")
    if output.exists():
        parser.error("Factory file already exists; do not issue another identity for this chip.")
    cfg = json.loads((LOCAL / "runtime.json").read_text(encoding="utf-8-sig"))
    session = requests.Session()

    def csrf():
        response = session.get(args.backend + "/api/auth/csrf", timeout=10)
        response.raise_for_status()
        value = response.json()
        return {value["headerName"]: value["token"]}

    response = session.post(args.backend + "/api/auth/login", headers=csrf(),
                            json={"identifier": cfg["app_email"], "password": cfg["app_password"]}, timeout=15)
    response.raise_for_status()
    response = session.post(args.backend + "/api/admin/inventory", headers=csrf(),
                            json={"factoryMac": mac, "name": args.name}, timeout=15)
    response.raise_for_status()
    issued = response.json()
    connection = issued.get("connection")
    if not connection:
        raise SystemExit("Backend has no PROVISION_MQTT_HOST; configure it, then re-register this chip.")
    factory = {"deviceUid": issued["device"]["deviceUid"], "factoryMac": issued["device"]["factoryMac"],
               "generation": issued["device"]["generation"],
               **{key: issued[key] for key in ("deviceSecret", "activationCode", "setupSsid", "setupPassword")}}
    uid = factory["deviceUid"]
    output.write_text(json.dumps(factory, indent=2) + "\n", encoding="utf-8")
    link = LOCAL / (uid + "-connection.json")
    link.write_text(json.dumps(connection, indent=2) + "\n", encoding="utf-8")
    print("Factory file:", output)
    print("Connection file:", link)
    print("Then: python scripts/device_tool.py --port COMx provision --device", output, "--connection", link)


if __name__ == "__main__":
    main()
