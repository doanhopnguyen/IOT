"""Clear this project's isolated local database, preserving existing administrator accounts.

Stop project services and reset physical devices before reusing this installation.
This does not erase a physical ESP32 or its fingerprint sensor.
"""
import argparse
import json
import re
import socket
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
TABLES = {"accounts", "access_units", "devices", "device_inventory", "user_access", "credentials",
          "face_requests", "access_logs", "telemetry", "events", "commands", "audit_logs", "door_invitations"}
OPTIONAL_TABLES = {"event_related_accounts", "firmware_releases"}  # Allow databases before V5/V6.


def clear_database(db):
    """Keep original admin IDs/password hashes and delete business rows atomically."""
    with db.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        actual = {row[0] for row in cursor.fetchall()} - {"flyway_schema_history"}
        if actual - OPTIONAL_TABLES != TABLES:
            raise RuntimeError("Unexpected database schema; inspect before clearing it.")
        cursor.execute("SELECT * FROM accounts WHERE is_admin=TRUE ORDER BY account_id")
        administrators = cursor.fetchall()
        if not administrators:
            raise RuntimeError("No existing administrator found; stopped before deleting any data.")
        cursor.execute("SET FOREIGN_KEY_CHECKS=0")
        try:
            for table in sorted(actual - {"accounts"}):
                cursor.execute("DELETE FROM `" + table + "`")
            cursor.execute("DELETE FROM accounts WHERE is_admin=FALSE")
        finally:
            cursor.execute("SET FOREIGN_KEY_CHECKS=1")
        cursor.execute("SELECT * FROM accounts WHERE is_admin=TRUE ORDER BY account_id")
        if cursor.fetchall() != administrators:
            raise RuntimeError("Administrator verification failed; reset will be rolled back.")
        for table in sorted(actual):
            cursor.execute("SELECT COUNT(*) FROM `" + table + "`")
            expected = len(administrators) if table == "accounts" else 0
            if cursor.fetchone()[0] != expected:
                raise RuntimeError("Reset verification failed for " + table)
    db.commit()
    return len(administrators)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-database", required=True)
    args = parser.parse_args()
    cfg = json.loads((LOCAL / "runtime.json").read_text(encoding="utf-8-sig"))
    name = cfg["db_name"]
    if not re.fullmatch(r"smart_access_dev_[a-zA-Z0-9_]+", name) or args.confirm_database != name:
        parser.error("Database scope check failed: use the exact isolated local database name.")
    for port in (1884, 8080, 8081, 8091, 8092):
        with socket.socket() as connection:
            connection.settimeout(.3)
            if connection.connect_ex(("127.0.0.1", port)) == 0:
                parser.error(f"Stop the project listener on port {port} before resetting.")
    db = pymysql.connect(host="127.0.0.1", user=cfg["db_user"], password=cfg["db_password"], database=name)
    try:
        admin_count = clear_database(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    for key in ("account_id", "unit_id", "device_uid", "device_secret", "device_mqtt_password",
                "face_uid", "face_secret", "face_mqtt_password"):
        cfg.pop(key, None)
    (LOCAL / "runtime.json").write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    address = cfg.get("tailscale_ip") or cfg["lan_ip"]
    (LOCAL / "ADMIN_ACCESS.txt").write_text(
        f"Admin URL: http://{address}:8080/admin/index.html\nLocal URL: http://127.0.0.1:8080/admin/index.html\n"
        f"Email: {cfg['app_email']}\nPassword: {cfg['app_password']}\n", encoding="utf-8")
    registry = LOCAL / "broker-devices.json"
    registry.write_text("{}\n", encoding="utf-8")
    # Only immediate, known generated files inside the ignored local runtime directory.
    for pattern in ("FACTORY_*.json", "ESP32-*-connection.json", "FACE-*-connection.json", "FACE-*.env", "PRODUCT_QR_ESP32-*.png"):
        for path in LOCAL.glob(pattern):
            if path.is_file():
                path.unlink()
    data = LOCAL / "mosquitto/data/mosquitto.db"
    data.unlink(missing_ok=True)
    print(f"Cleared {name}: 0 devices/doors/regular users/credentials/history; {admin_count} existing admin(s) preserved unchanged.")
    print("Run bootstrap_local.py broker to remove old MQTT accounts before starting the broker.")
    print("Physical ESP32 and fingerprint memory must be erased separately; see the run guide.")


if __name__ == "__main__":
    main()
