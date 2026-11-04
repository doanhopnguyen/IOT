#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_ST7789.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>
#include <MFRC522.h>
#include <Adafruit_Fingerprint.h>
#include <ESP32Servo.h>
#include <mbedtls/sha256.h>
#include <esp_system.h>
#include <time.h>
#include <atomic>
#include "WifiSettings.h"
#if __has_include("smartdoor_config.h")
#include "smartdoor_config.h"
#else
#include "config.example.h"
#endif

constexpr int TFT_CS = 47, TOUCH_CS = 48, RFID_CS = 10;
#if LCD_ILI9341
Adafruit_ILI9341 tft(&SPI, TFT_CS, 2, 1);
#else
Adafruit_ST7789 tft(&SPI, TFT_CS, 2, 1);
#endif
XPT2046_Touchscreen touch(TOUCH_CS);
WifiSettings wifiSettings(tft);
MFRC522 rfid(RFID_CS, 9);
HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);
Servo servo;
Preferences prefs;
WiFiClient plain;
WiFiClientSecure secure;
PubSubClient mqtt(plain);
DynamicJsonDocument policy(16000);
String root, requestId, enteredPin, enrollmentUuid;
uint16_t enrollSlot = 0;
uint8_t enrollStage = 0;
uint32_t enrollStarted = 0, nextSensor = 0, nextConnect = 0, nextStatus = 0, nextEvent = 0;
uint32_t unlockStarted = 0, unlockMs = 0, beepStarted = 0, lastTap = 0, blockedAt = 0;
std::atomic<bool> unlocked{false};
bool fingerReady = false, fingerLift = false, policyReady = false, pinBlocked = false;
SemaphoreHandle_t actuatorMutex;
int failedPins = 0;
constexpr uint32_t PIN_BLOCK_MS = 30000;
constexpr uint16_t QUEUE_SIZE = 64;

String uuid() {
  uint8_t b[16]; esp_fill_random(b, sizeof(b)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  char out[37];
  snprintf(out, sizeof(out), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(out);
}
String digest(const String &text) {
  uint8_t hash[32]; mbedtls_sha256_ret((const unsigned char *)text.c_str(), text.length(), hash, 0);
  char hex[65]; for (int i = 0; i < 32; ++i) snprintf(hex + i * 2, 3, "%02x", hash[i]);
  return String(hex);
}
String canonical(String uid) { uid.replace(":", ""); uid.replace("-", ""); uid.toUpperCase(); return uid; }
String queueKey(uint16_t n) { return "event" + String(n); }
uint16_t head() { return prefs.getUShort("head", 0); }
uint16_t tail() { return prefs.getUShort("tail", 0); }
bool queueFull() { return (tail() + 1) % QUEUE_SIZE == head(); }

void message(const String &text) {
  if (wifiSettings.visible()) return;
  tft.fillRect(0, 35, 240, 47, ST77XX_BLACK);
  tft.setTextColor(ST77XX_YELLOW); tft.setTextSize(1); tft.setCursor(8, 40); tft.println(text);
}
void drawPin() {
  if (wifiSettings.visible()) return;
  tft.fillRect(0, 65, 240, 20, ST77XX_BLACK); tft.setCursor(12, 68);
  tft.setTextSize(2); tft.setTextColor(ST77XX_WHITE);
  for (unsigned i = 0; i < enteredPin.length(); i++) tft.print('*');
}
void drawHome() {
  tft.fillScreen(ST77XX_BLACK);
  tft.setCursor(8, 10); tft.setTextSize(2); tft.setTextColor(ST77XX_CYAN); tft.print("SMART ACCESS");
  tft.fillRect(166, 0, 74, 31, ST77XX_BLACK); tft.drawRect(166, 0, 74, 31, ST77XX_CYAN);
  tft.setTextSize(1); tft.setCursor(180, 12); tft.print("WI-FI");
  const char *keys = "123456789C0E";
  for (int i = 0; i < 12; i++) {
    int x = 6 + (i % 3) * 76, y = 90 + (i / 3) * 56;
    tft.drawRect(x, y, 72, 52, ST77XX_WHITE); tft.setTextSize(2); tft.setTextColor(ST77XX_CYAN);
    tft.setCursor(x + 28, y + 18); tft.print(keys[i]);
  }
  enteredPin = ""; message(unlocked ? "UNLOCKED - auto locking..." : "LOCKED - RFID / finger / PIN");
}
void lockDoor() {
  xSemaphoreTake(actuatorMutex, portMAX_DELAY);
  servo.write(SERVO_LOCK_ANGLE); unlocked = false;
  xSemaphoreGive(actuatorMutex); message("LOCKED - RFID / finger / PIN");
}
void unlockDoor(unsigned seconds) {
  xSemaphoreTake(actuatorMutex, portMAX_DELAY);
  servo.write(SERVO_UNLOCK_ANGLE); unlocked = true; unlockStarted = millis();
  unlockMs = constrain(seconds, 1U, 30U) * 1000;
  xSemaphoreGive(actuatorMutex); message("UNLOCKED - auto locking...");
  digitalWrite(BUZZER_PIN, HIGH); beepStarted = millis();
}
bool publish(const char *suffix, JsonDocument &doc) {
  String payload; serializeJson(doc, payload);
  return mqtt.publish((root + suffix).c_str(), payload.c_str(), false);
}
void ack(const String &id, bool success, const char *reason, bool remember = true) {
  DynamicJsonDocument doc(512); doc["commandUuid"] = id; doc["success"] = success;
  doc["message"] = reason; doc["deviceSecret"] = DEVICE_SECRET;
  if (remember) {
    // Persist terminal result before publishing: duplicate QoS delivery must not actuate twice.
    String stored; serializeJson(doc, stored);
    unsigned n = prefs.getUInt("ackPos", 0) % 16;
    prefs.putString(("ack" + String(n)).c_str(), stored); prefs.putUInt("ackPos", n + 1);
  }
  publish("ack", doc);
}
bool replayAck(const String &id) {
  for (int i = 0; i < 16; i++) {
    DynamicJsonDocument old(512);
    if (!deserializeJson(old, prefs.getString(("ack" + String(i)).c_str(), ""))
        && old["commandUuid"].as<String>() == id) { publish("ack", old); return true; }
  }
  if (prefs.getString("started", "") == id) { ack(id, false, "INTERRUPTED_COMMAND"); return true; }
  return false;
}
void access(const char *method, bool granted, const String &card = "", int templateId = -1) {
  // Keep audit capacity available; do not silently discard old entries.
  if (queueFull()) { message("Audit queue full - access blocked"); return; }
  DynamicJsonDocument doc(512); doc["eventUuid"] = uuid(); doc["method"] = method;
  doc["result"] = granted ? "GRANTED" : "DENIED";
  time_t now = time(nullptr); doc["occurredAt"] = now > 1700000000 ? (long long)now : 0;
  if (card.length()) doc["rfidUid"] = card;
  if (templateId >= 0) doc["templateId"] = templateId;
  String payload; serializeJson(doc, payload);
  uint16_t slot = tail();
  if (!prefs.putString(queueKey(slot).c_str(), payload)
      || !prefs.putUShort("tail", (slot + 1) % QUEUE_SIZE)) { message("Audit storage error"); return; }
  if (granted) unlockDoor(policy["unlockDurationSec"] | 5);
  else { message("ACCESS DENIED"); digitalWrite(BUZZER_PIN, HIGH); beepStarted = millis(); }
}
void flushEvent() {
  if (head() == tail()) return;
  DynamicJsonDocument doc(768);
  if (deserializeJson(doc, prefs.getString(queueKey(head()).c_str(), ""))) {
    message("Audit storage corrupt - service required"); return;
  }
  doc["deviceSecret"] = DEVICE_SECRET; publish("access", doc);
}
bool allowedFinger(int id) {
  if (!policyReady) return false;
  for (JsonVariant v : policy["fingerprints"].as<JsonArray>()) if (v.as<int>() == id) return true;
  return false;
}
bool allowedCard(const String &card) {
  if (!policyReady) return false;
  for (JsonVariant v : policy["rfid"].as<JsonArray>()) if (canonical(v.as<String>()) == card) return true;
  return false;
}
// Read the module's slot bitmap; loadModel failure alone is not proof that a slot is empty.
bool slotFree(uint16_t slot) {
  uint8_t data[2] = {0x1F, (uint8_t)(slot / 256)};
  Adafruit_Fingerprint_Packet packet(FINGERPRINT_COMMANDPACKET, sizeof(data), data);
  finger.writeStructuredPacket(packet);
  if (finger.getStructuredPacket(&packet, 1000) != FINGERPRINT_OK || packet.type != FINGERPRINT_ACKPACKET
      || packet.length != 35 || packet.data[0] != FINGERPRINT_OK) return false;
  uint16_t sum = packet.type + (packet.length >> 8) + (packet.length & 255);
  for (int i = 0; i < 33; i++) sum += packet.data[i];
  if (sum != ((uint16_t)packet.data[33] << 8 | packet.data[34])) return false;
  return !(packet.data[1 + (slot % 256) / 8] & (1 << (slot % 8)));
}
void finishEnroll(bool ok, const char *reason) {
  String id = enrollmentUuid; enrollmentUuid = ""; enrollStage = 0; fingerLift = true;
  ack(id, ok, reason); message(reason);
}
void pollFinger() {
  if (!fingerReady || (int32_t)(millis() - nextSensor) < 0) return;
  nextSensor = millis() + 120;
  if (enrollStage && millis() - enrollStarted > 45000) { finishEnroll(false, "ENROLL_TIMEOUT"); return; }
  uint8_t r = finger.getImage();
  if (enrollStage) {
    if (enrollStage == 2) {
      if (r == FINGERPRINT_NOFINGER) { enrollStage = 3; message("Place SAME finger again"); }
      return;
    }
    if (r == FINGERPRINT_NOFINGER) return;
    if (r != FINGERPRINT_OK || finger.image2Tz(enrollStage == 1 ? 1 : 2) != FINGERPRINT_OK) return;
    if (enrollStage == 1) { enrollStage = 2; message("Remove finger"); return; }
    if (finger.createModel() != FINGERPRINT_OK) { finishEnroll(false, "FINGER_MISMATCH"); return; }
    if (!slotFree(enrollSlot)) { finishEnroll(false, "SLOT_OCCUPIED_OR_INDEX_ERROR"); return; }
    finishEnroll(finger.storeModel(enrollSlot) == FINGERPRINT_OK, "ENROLL_FINISHED"); return;
  }
  if (r == FINGERPRINT_NOFINGER) { fingerLift = false; return; }
  if (fingerLift || r != FINGERPRINT_OK) return;
  fingerLift = true;
  if (finger.image2Tz() != FINGERPRINT_OK) return;
  bool matched = finger.fingerFastSearch() == FINGERPRINT_OK;
  int id = matched ? finger.fingerID : -1;
  access("FINGERPRINT", matched && allowedFinger(id), "", id);
}
void onMqtt(char *topic, uint8_t *payload, unsigned length) {
  if (length > 14000) return;
  DynamicJsonDocument doc(16000);
  if (deserializeJson(doc, payload, length)) return;
  String name(topic);
  if (name == root + "ack-confirm") {
    for (int i = 0; i < 16; i++) {
      String key = "ack" + String(i); DynamicJsonDocument old(640);
      if (!deserializeJson(old, prefs.getString(key.c_str(), ""))
          && old["commandUuid"].as<String>() == doc["commandUuid"].as<String>()) {
        old["confirmed"] = true; String saved; serializeJson(old, saved); prefs.putString(key.c_str(), saved);
      }
    }
    return;
  }
  if (name == root + "access-ack") {
    if (head() == tail()) return;
    DynamicJsonDocument event(512);
    if (!deserializeJson(event, prefs.getString(queueKey(head()).c_str(), ""))
        && doc["eventUuid"].as<String>() == event["eventUuid"].as<String>()) {
      // Move the pointer before cleanup; a reset may resend, but never loses an unacknowledged event.
      uint16_t slot = head();
      if (prefs.putUShort("head", (slot + 1) % QUEUE_SIZE)) prefs.remove(queueKey(slot).c_str());
      nextEvent = 0;
    }
    return;
  }
  if (name == root + "config") {
    if (!requestId.length() || doc["requestId"].as<String>() != requestId
        || !doc["rfid"].is<JsonArray>() || !doc["fingerprints"].is<JsonArray>()) return;
    String serialized; serializeJson(doc, serialized);
    if (serialized.length() > 11000 || !prefs.putString("policy", serialized)) return;
    policy.clear(); policyReady = !deserializeJson(policy, serialized); requestId = "";
    message("Permissions synchronized"); return;
  }
  if (name != root + "cmd") return;
  String id = doc["commandUuid"] | "", type = doc["commandType"] | "";
  if (id.length() != 36) return;
  if (replayAck(id)) return;
  if (id == enrollmentUuid) return;
  time_t now = time(nullptr); long long issued = doc["issuedAt"] | 0LL;
  int ttl = doc["ttlSec"] | 0;
  if (now < 1700000000 || issued > now + 2 || ttl < 1 || ttl > 60 || now - issued > ttl) {
    ack(id, false, "COMMAND_EXPIRED_OR_CLOCK_UNSYNCED"); return;
  }
  JsonObject data = doc["data"].as<JsonObject>();
  if (type == "DOOR_UNLOCK") {
    if (!prefs.putString("started", id)) { ack(id, false, "STORAGE_ERROR"); return; }
    unlockDoor(data["durationSec"] | 5); ack(id, true, "SERVO_COMMAND_ACCEPTED");
  } else if (type == "PIN_SET") {
    String pin = data["pin"] | "";
    bool valid = pin.length() == 6;
    for (unsigned i = 0; i < pin.length(); i++) if (!isDigit(pin[i])) valid = false;
    if (!valid) { ack(id, false, "INVALID_PIN"); return; }
    String salt = uuid(); String hash = digest(salt + pin);
    DynamicJsonDocument pinRecord(256); pinRecord["salt"] = salt; pinRecord["hash"] = hash;
    String record; serializeJson(pinRecord, record);
    bool ok = prefs.putString("pin", record) > 0;
    ack(id, ok, ok ? "PIN_STORED" : "STORAGE_ERROR");
  } else if (type == "FP_ENROLL") {
    int slot = data["templateId"] | 0;
    if (enrollStage || wifiSettings.visible() || !fingerReady || slot < 1 || slot >= finger.capacity || !slotFree(slot)) {
      ack(id, false, "SENSOR_BUSY_OR_SLOT_UNAVAILABLE"); return;
    }
    enrollmentUuid = id; enrollSlot = slot; enrollStage = 1; enrollStarted = millis(); message("Place finger (scan 1)");
  } else if (type == "FP_DELETE") {
    int slot = data["templateId"] | 0;
    bool ok = !enrollStage && fingerReady && slot > 0 && slot < finger.capacity && finger.deleteModel(slot) == FINGERPRINT_OK;
    ack(id, ok, ok ? "FINGER_DELETED" : "DELETE_FAILED");
  } else ack(id, false, "UNKNOWN_COMMAND");
}
void pollTouch() {
  if (!touch.touched() || millis() - lastTap < 300) return;
  TS_Point p = touch.getPoint(); if (p.z < 100) return; lastTap = millis();
  int x = constrain(map(p.x, 200, 3900, 239, 0), 0L, 239L);
  int y = constrain(map(p.y, 200, 3900, 319, 0), 0L, 319L);
  if (wifiSettings.tap(x, y)) { if (!wifiSettings.visible()) drawHome(); return; }
  if (x >= 166 && y < 31) {
    if (enrollStage) { message("Finish fingerprint enrollment first"); return; }
    enteredPin = ""; wifiSettings.open(); return;
  }
  if (y < 90 || y >= 314 || x < 6 || x >= 234) return;
  int row = (y - 90) / 56, col = (x - 6) / 76;
  const char *keys = "123456789C0E"; char key = keys[row * 3 + col];
  if (key == 'C') enteredPin = "";
  else if (key != 'E') { if (enteredPin.length() < 6) enteredPin += key; }
  else {
    if (pinBlocked && millis() - blockedAt < PIN_BLOCK_MS) { message("PIN locked for 30 seconds"); enteredPin = ""; drawPin(); return; }
    if (pinBlocked) { pinBlocked = false; failedPins = 0; }
    DynamicJsonDocument record(256); deserializeJson(record, prefs.getString("pin", ""));
    String salt = record["salt"] | "", hash = record["hash"] | "";
    bool ok = policyReady && (policy["pinEnabled"] | false) && enteredPin.length() == 6
        && salt.length() && hash.length() == 64 && digest(salt + enteredPin) == hash;
    if (ok) failedPins = 0;
    else if (++failedPins >= 5) { pinBlocked = true; blockedAt = millis(); }
    access("PIN", ok); enteredPin = "";
  }
  drawPin();
}
void setup() {
  Serial.begin(115200); prefs.begin("smartdoor", false);
  actuatorMutex = xSemaphoreCreateMutex();
  for (int pin : {TFT_CS, TOUCH_CS, RFID_CS}) { pinMode(pin, OUTPUT); digitalWrite(pin, HIGH); }
  pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW);
  SPI.begin(41, 21, 42, -1);
#if LCD_ILI9341
  tft.begin();
#else
  tft.init(240, 320);
#endif
  tft.setRotation(0); tft.fillScreen(ST77XX_BLACK); touch.begin(SPI); touch.setRotation(0); rfid.PCD_Init();
  drawHome();
  servo.setPeriodHertz(50); servo.attach(SERVO_PIN, 500, 2400); lockDoor();
  xTaskCreate([](void *) {
    for (;;) {
      xSemaphoreTake(actuatorMutex, portMAX_DELAY);
      if (unlocked && millis() - unlockStarted >= unlockMs) { servo.write(SERVO_LOCK_ANGLE); unlocked = false; }
      xSemaphoreGive(actuatorMutex); vTaskDelay(pdMS_TO_TICKS(10));
    }
  }, "auto-lock", 3072, nullptr, 2, nullptr);
  fpSerial.begin(57600, SERIAL_8N1, 17, 18);
  fingerReady = finger.verifyPassword() && finger.getParameters() == FINGERPRINT_OK;
  policyReady = !deserializeJson(policy, prefs.getString("policy", ""));
  root = String(MQTT_PREFIX) + "/" + DEVICE_UID + "/";
  if (MQTT_TLS) { secure.setCACert(MQTT_CA_CERT); secure.setTimeout(1); mqtt.setClient(secure); }
  plain.setTimeout(1); mqtt.setServer(MQTT_HOST, MQTT_PORT); mqtt.setCallback(onMqtt);
  mqtt.setBufferSize(16384); mqtt.setSocketTimeout(1); mqtt.setKeepAlive(20);
  wifiSettings.begin(WIFI_SSID, WIFI_PASSWORD);
}
void loop() {
  uint32_t now = millis();
  static bool wasUnlocked = false;
  xSemaphoreTake(actuatorMutex, portMAX_DELAY); bool open = unlocked; xSemaphoreGive(actuatorMutex);
  if (wasUnlocked && !open) message("LOCKED - RFID / finger / PIN");
  wasUnlocked = open;
  if (now - beepStarted > 150) digitalWrite(BUZZER_PIN, LOW);
  wifiSettings.poll(); pollTouch(); pollFinger();
  if (wifiSettings.joining() && mqtt.connected()) mqtt.disconnect();
  if (!enrollStage && rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid;
    for (byte i = 0; i < rfid.uid.size; i++) { if (rfid.uid.uidByte[i] < 16) uid += "0"; uid += String(rfid.uid.uidByte[i], HEX); }
    uid.toUpperCase(); access("RFID", allowedCard(uid), uid); rfid.PICC_HaltA(); rfid.PCD_StopCrypto1();
  }
  // Avoid blocking reconnect attempts during an open interval or fingerprint enrollment.
  if (!unlocked && !enrollStage && !wifiSettings.joining() && WiFi.status() == WL_CONNECTED && !mqtt.connected()
      && (int32_t)(now - nextConnect) >= 0 && strlen(DEVICE_SECRET) >= 24) {
    nextConnect = now + 5000;
    if (mqtt.connect(DEVICE_UID, MQTT_USER, MQTT_PASSWORD)) {
      mqtt.subscribe((root + "cmd").c_str(), 1); mqtt.subscribe((root + "config").c_str(), 1);
      mqtt.subscribe((root + "access-ack").c_str(), 1); nextStatus = 0;
      mqtt.subscribe((root + "ack-confirm").c_str(), 1);
    }
  }
  if (mqtt.connected()) {
    mqtt.loop();
    if ((int32_t)(now - nextStatus) >= 0) {
      nextStatus = now + 10000; requestId = uuid(); DynamicJsonDocument status(384);
      status["requestId"] = requestId; status["deviceSecret"] = DEVICE_SECRET;
      status["fingerReady"] = fingerReady; status["unlocked"] = unlocked.load();
      publish("status", status);
    }
    if ((int32_t)(now - nextEvent) >= 0) {
      nextEvent = now + 3000; flushEvent();
      for (int i = 0; i < 16; i++) {
        DynamicJsonDocument pending(640);
        if (!deserializeJson(pending, prefs.getString(("ack" + String(i)).c_str(), ""))
            && !(pending["confirmed"] | false)) publish("ack", pending);
      }
    }
  }
  delay(5);
}
