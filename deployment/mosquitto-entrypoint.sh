#!/bin/sh
# Sinh /mosquitto/config/passwords từ biến môi trường rồi chạy broker.
#   MQTT_BACKEND_PASSWORD  mật khẩu user "backend" (bắt buộc)
#   MQTT_DEVICE_ACCOUNTS   "UID1:matkhau1,UID2:matkhau2" — username của thiết bị phải đúng UID (ACL dùng %u)
set -eu
FILE=/mosquitto/config/passwords
: "${MQTT_BACKEND_PASSWORD:?MQTT_BACKEND_PASSWORD is required}"
umask 077
printf 'backend:%s\n' "$MQTT_BACKEND_PASSWORD" > "$FILE"
if [ -n "${MQTT_DEVICE_ACCOUNTS:-}" ]; then
  echo "$MQTT_DEVICE_ACCOUNTS" | tr ',' '\n' | while IFS= read -r entry; do
    [ -n "$entry" ] && printf '%s\n' "$entry" >> "$FILE"
  done
fi
mosquitto_passwd -U "$FILE"
chown mosquitto:mosquitto "$FILE" 2>/dev/null || true
exec mosquitto -c /mosquitto/config/mosquitto.conf
