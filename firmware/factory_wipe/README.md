# Workshop fingerprint wipe helper

This is a temporary maintenance image, not the door application. It never
attaches or drives a servo. Boot alone does not erase fingerprint templates.

Build/upload with `platformio.factory-wipe.ini`, read `INFO` over USB serial at
115200, verify the printed hardware UID, then send `WIPE <that exact UID>` only
when the owner has requested a factory reset. Require the response
`FINGERPRINT_EMPTY_VERIFIED templates=0` before proceeding.

After the sensor is verified empty, erase the ESP32 flash using esptool, restore
the connected door firmware, and provision the matching factory/connection JSON
with `scripts/device_tool.py`. Erasing ESP32 flash alone does not erase the
external fingerprint sensor. Never ship the maintenance image as door firmware.
