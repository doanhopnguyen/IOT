"""Prepare a per-camera .env on the central PC from the identity issued in the app.

Copy only the resulting .env to the Edge AI PC. It contains that camera's credentials.
"""
import argparse
import json
from pathlib import Path
import secrets
import subprocess

from local_runtime import mosquitto_tool
from mqtt_gateway import tailscale_address

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--identity", type=Path, required=True, help="Three FACE_* lines issued by the app")
    parser.add_argument("--server", type=tailscale_address, required=True)
    args = parser.parse_args()
    values = {}
    for line in args.identity.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    uid = values.get("FACE_DEVICE_UID", "")
    import re
    if not re.fullmatch(r"FACE-[a-fA-F0-9-]{36}", uid) or not values.get("FACE_DEVICE_SECRET"):
        parser.error("Use the camera identity issued in the owner's app, including FACE_DEVICE_SECRET.")
    cfg = json.loads((LOCAL / "runtime.json").read_text(encoding="utf-8-sig"))
    registry = LOCAL / "broker-devices.json"
    entries = json.loads(registry.read_text(encoding="utf-8-sig")) if registry.exists() else {}
    entries.setdefault(uid, secrets.token_urlsafe(24))
    registry.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    password_file = LOCAL / "mosquitto/passwords"
    password_file.write_text(f"backend:{cfg['broker_password']}\n" + "".join(
        f"{name}:{password}\n" for name, password in entries.items()), encoding="utf-8")
    subprocess.run([mosquitto_tool("mosquitto_passwd"), "-U", str(password_file)], check=True,
                   stdout=subprocess.DEVNULL)
    result = dict(FACE_API_URL=f"http://{args.server}:8080", FACE_DEVICE_UID=uid,
                  FACE_DEVICE_SECRET=values["FACE_DEVICE_SECRET"], MQTT_HOST=args.server,
                  MQTT_PORT="1884", MQTT_USERNAME=uid, MQTT_PASSWORD=entries[uid], MQTT_TOPIC_PREFIX="smartdoor-iot",
                  FACE_LIVENESS_ENABLED="true", FACE_ALLOW_UNVERIFIED_LIVENESS="false")
    output = LOCAL / (uid + ".env")
    output.write_text("".join(f"{key}={value}\n" for key, value in result.items()), encoding="utf-8")
    print("Private camera configuration:", output)
    print("Restart the project broker. Copy this file as face-node/.env on that Edge PC, then start node.py --camera.")


if __name__ == "__main__":
    main()
