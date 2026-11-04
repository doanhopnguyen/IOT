#pragma once
// Copy to smartdoor_config.h (ignored by Git). Secret must match devices.device_secret_hash (BCrypt).
// Optional first-boot fallback. Wi-Fi can be selected/changed on the TFT without reflashing.
// A connection saved from the TFT takes precedence over these values.
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define DEVICE_UID "door-s3-01"
#define DEVICE_SECRET ""
#define MQTT_HOST "192.168.1.10"
#define MQTT_PORT 1883
#define MQTT_USER "door-s3-01"
#define MQTT_PASSWORD ""
#define MQTT_PREFIX "smartdoor-iot"
// For TLS, set port 8883 and paste the issuing CA certificate below. Never use setInsecure().
#define MQTT_TLS false
#define MQTT_CA_CERT ""
#define LCD_ILI9341 false
// New pins: check the physical board and adjust before connecting.
#define SERVO_PIN 4
#define BUZZER_PIN 5
#define SERVO_LOCK_ANGLE 0
#define SERVO_UNLOCK_ANGLE 90
