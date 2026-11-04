/*
 * Test offline ESP32-S3 N16R8 - pinout: README(4).md (04/11/2026).
 * Arduino IDE: ESP32S3 Dev Module, Flash 16MB, PSRAM OPI,
 * USB CDC On Boot Enabled, Port COM5, Serial Monitor 115200.
 * Libraries: Adafruit GFX, Adafruit ST7735 and ST7789, Adafruit ILI9341
 * (only if LCD_ILI9341=1), XPT2046_Touchscreen, MFRC522,
 * Adafruit Fingerprint Sensor Library, ESP32Servo.
 *
 * Khong can Wi-Fi, MQTT, backend. Khong ghi/xoa mau van tay hay NVS.
 * Servo khong quay luc boot; chi quay khi go o/l. Thu servo khong tai,
 * nguon 5V rieng va chung GND; chinh goc theo co cau truoc khi lap.
 * RFID/van tay chi bao ket qua, khong tu dong mo servo.
 * Touch chi hien toa do raw + diem uoc luong, chua hieu chuan.
 * ST7789 va XPT2046 la gia dinh can xac nhan tren module thuc te.
 * Lenh Serial (khong can newline):
 * h help; s status; d RGB/display test; o servo open; l servo close;
 * x detach servo; r retry RFID/fingerprint; c calibrate door-closed level.
 */
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#ifndef LCD_ILI9341
#define LCD_ILI9341 0
#endif
#if LCD_ILI9341
#include <Adafruit_ILI9341.h>
#else
#include <Adafruit_ST7789.h>
#endif
#include <XPT2046_Touchscreen.h>
#include <MFRC522.h>
#include <Adafruit_Fingerprint.h>
#include <ESP32Servo.h>

constexpr int TFT_CS = 47, TFT_DC = 2, TFT_RST = 1;
constexpr int TOUCH_CS = 48, RFID_CS = 10, RFID_RST = 9;
constexpr int SPI_CLK = 41, SPI_MOSI = 42, SPI_MISO = 21;
constexpr int SERVO_PIN = 4, DOOR_PIN = 6, FP_RX = 17, FP_TX = 18;
constexpr int SERVO_CLOSE = 30, SERVO_OPEN = 100; // Goc thu, can chinh thuc te.
constexpr uint32_t FP_BAUD = 57600; // Doi neu module da cai baud khac.
constexpr uint16_t BLACK = 0x0000, WHITE = 0xffff, CYAN = 0x07ff;
constexpr uint16_t YELLOW = 0xffe0, RED = 0xf800, GREEN = 0x07e0, BLUE = 0x001f;

#if LCD_ILI9341
Adafruit_ILI9341 tft(&SPI, TFT_CS, TFT_DC, TFT_RST);
#else
Adafruit_ST7789 tft(&SPI, TFT_CS, TFT_DC, TFT_RST);
#endif
XPT2046_Touchscreen touch(TOUCH_CS); // Polling, khong can T_IRQ.
MFRC522 rfid(RFID_CS, RFID_RST);
HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);
Servo servo;
bool rfidReady = false, fingerReady = false, fingerHeld = false;
bool touchReady = false;
int doorRaw = HIGH, doorStable = HIGH, doorClosedLevel = -1;
uint32_t doorChangedAt = 0, lastTouch = 0, lastRfid = 0, lastFinger = 0;
uint32_t servoMovedAt = 0;
bool servoPulsing = false;

// Tat ca thiet bi dung cung hardware SPI, thu vien quan ly transaction/CS.
void deselectBus() {
  digitalWrite(TFT_CS, HIGH);
  digitalWrite(TOUCH_CS, HIGH);
  digitalWrite(RFID_CS, HIGH);
}

void line(int y, const String &value, uint16_t color = WHITE) {
  tft.fillRect(0, y, 240, 17, BLACK);
  tft.setCursor(4, y + 3);
  tft.setTextSize(1);
  tft.setTextColor(color);
  tft.print(value.substring(0, 38));
}

void showDoor() {
  String state = doorStable == LOW ? "LOW/contact closed" : "HIGH/contact open";
  if (doorClosedLevel >= 0)
    state = doorStable == doorClosedLevel ? "DOOR CLOSED" : "DOOR OPEN";
  line(70, "Door: " + state, YELLOW);
  Serial.printf("[DOOR] GPIO6=%s", doorStable == LOW ? "LOW" : "HIGH");
  if (doorClosedLevel >= 0)
    Serial.print(doorStable == doorClosedLevel ? " -> CLOSED" : " -> OPEN");
  else Serial.print("; chua hieu chuan (dong cua roi go c)");
  Serial.println();
}

void home() {
  tft.fillScreen(BLACK);
  line(4, "ESP32-S3 OFFLINE HARDWARE TEST", CYAN);
  line(25, "No Wi-Fi / MQTT / backend");
  line(48, "Serial 115200: h = help", YELLOW);
  showDoor();
  line(92, rfidReady ? "RC522: responding" : "RC522: NOT detected");
  line(114, fingerReady ? "Finger: responding" : "Finger: NOT detected");
  line(136, "Touch screen: raw X/Y -> Serial");
  line(158, "Servo: o=open l=close x=detach");
  line(180, "Cards/fingers do NOT move servo");
  line(204, "Touch area (approximate mapping):");
  tft.drawRect(0, 225, 240, 95, CYAN);
}

void help() {
  Serial.println("\n=== OFFLINE HARDWARE TEST - COM5 / 115200 ===");
  Serial.println("h: help | s: status | d: RGB/TFT test");
  Serial.println("o: servo open | l: servo close | x: detach servo");
  Serial.println("r: retry RC522 + fingerprint (may wait ~1 second)");
  Serial.println("c: Dong cua/dua nam cham vao vi tri DONG, roi go c");
  Serial.println("RFID: dua the lai gan, xem UID; khong ghi the.");
  Serial.println("Finger: dat ngon tay; chup anh/tim mau da co, khong dang ky/xoa.");
  Serial.println("Touch: cham 4 goc, xem raw X/Y/Z; mapping chua hieu chuan.");
  Serial.println("Servo chi phat PWM 800ms moi lenh, sau do detach.");
}

void status() {
  Serial.printf("[SYSTEM] uptime=%lus, free heap=%u, PSRAM=%u\n",
                millis() / 1000, ESP.getFreeHeap(), ESP.getPsramSize());
  Serial.printf("[MODULES] RC522=%s Finger=%s TouchInit=%s\n",
                rfidReady ? "OK" : "FAIL", fingerReady ? "OK" : "FAIL",
                touchReady ? "OK (can cham de xac nhan)" : "FAIL");
  Serial.println("[TFT] Can quan sat man hinh de xac nhan, khong tu doc ID.");
  Serial.printf("[SERVO] PWM=%s; khong co phan hoi vi tri chot\n",
                servo.attached() ? "ON" : "OFF");
  showDoor();
}

void probeSensors() {
  deselectBus();
  rfid.PCD_Init();
  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  rfidReady = version == 0x90 || version == 0x91 || version == 0x92 || version == 0x88;
  Serial.printf("[RC522] VersionReg=0x%02X -> %s\n", version,
                rfidReady ? "responding" : "unknown/absent; check 3V3, SPI, CS, RST");
  fingerReady = finger.verifyPassword();
  fingerHeld = false;
  Serial.printf("[FINGER] verifyPassword: %s (UART RX17 TX18, baud %lu)\n",
                fingerReady ? "OK" : "FAIL - check wiring/baud/password/power", FP_BAUD);
  if (fingerReady) {
    uint8_t result = finger.getTemplateCount();
    if (result == FINGERPRINT_OK) Serial.printf("[FINGER] Stored templates: %u\n", finger.templateCount);
    else Serial.printf("[FINGER] getTemplateCount error=0x%02X\n", result);
  }
}

void moveServo(int angle) {
  servo.setPeriodHertz(50);
  if (!servo.attached()) servo.attach(SERVO_PIN, 1000, 2000);
  if (!servo.attached()) { Serial.println("[SERVO] Attach FAILED"); return; }
  servo.write(angle);
  servoMovedAt = millis();
  servoPulsing = true;
  Serial.printf("[SERVO] Command angle=%d; detach after 800ms\n", angle);
  line(158, "Servo command: " + String(angle) + " deg", YELLOW);
}

void pollDoor() {
  int value = digitalRead(DOOR_PIN);
  if (value != doorRaw) { doorRaw = value; doorChangedAt = millis(); }
  if (doorStable != doorRaw && millis() - doorChangedAt >= 40) {
    doorStable = doorRaw;
    showDoor();
  }
}

void pollTouch() {
  if (!touchReady || millis() - lastTouch < 120) return;
  lastTouch = millis();
  if (!touch.touched()) return;
  TS_Point p = touch.getPoint();
  Serial.printf("[TOUCH] raw x=%d y=%d z=%d\n", p.x, p.y, p.z);
  line(136, "Touch raw: " + String(p.x) + "," + String(p.y) + " z=" + String(p.z), CYAN);
  // Chi la minh hoa. Doi mapping/dao truc sau khi hieu chuan 4 goc.
  int x = constrain(map(p.x, 200, 3900, 0, 239), 0L, 239L);
  int y = constrain(map(p.y, 200, 3900, 226, 318), 226L, 318L);
  tft.fillCircle(x, y, 2, YELLOW);
}

void pollRfid() {
  if (!rfidReady || millis() - lastRfid < 120) return;
  lastRfid = millis();
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  String uid;
  for (byte i = 0; i < rfid.uid.size; ++i) {
    if (i) uid += ':';
    if (rfid.uid.uidByte[i] < 16) uid += '0';
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  Serial.println("[RFID] UID=" + uid);
  line(92, "UID: " + uid, GREEN);
}

void pollFinger() {
  if (!fingerReady || millis() - lastFinger < 250) return;
  lastFinger = millis();
  uint8_t result = finger.getImage();
  if (result == FINGERPRINT_NOFINGER) { fingerHeld = false; return; }
  if (result != FINGERPRINT_OK) {
    Serial.printf("[FINGER] getImage error=0x%02X; go r de thu lai\n", result);
    if (result == FINGERPRINT_PACKETRECIEVEERR || result == FINGERPRINT_TIMEOUT)
      fingerReady = false; // Khong lap timeout khi module bi rut.
    return;
  }
  if (fingerHeld) return;
  fingerHeld = true;
  Serial.println("[FINGER] Image captured OK");
  result = finger.image2Tz();
  if (result != FINGERPRINT_OK) {
    Serial.printf("[FINGER] image2Tz error=0x%02X\n", result);
    line(114, "Finger: image conversion failed", YELLOW);
    return;
  }
  result = finger.fingerFastSearch();
  if (result == FINGERPRINT_OK) {
    Serial.printf("[FINGER] Match ID=%u confidence=%u\n", finger.fingerID, finger.confidence);
    line(114, "Finger ID=" + String(finger.fingerID) + " score=" + String(finger.confidence), GREEN);
  } else if (result == FINGERPRINT_NOTFOUND) {
    Serial.println("[FINGER] Capture OK, no stored match (normal if not enrolled)");
    line(114, "Finger capture OK / no match", YELLOW);
  } else {
    Serial.printf("[FINGER] Search error=0x%02X\n", result);
    line(114, "Finger search error: " + String(result), RED);
  }
}

void setup() {
  Serial.begin(115200);
  uint32_t started = millis();
  while (!Serial && millis() - started < 2000) delay(10);
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW); // Khong attach/quay servo khi boot.
  pinMode(DOOR_PIN, INPUT_PULLUP);
  doorRaw = doorStable = digitalRead(DOOR_PIN);
  for (int cs : {TFT_CS, TOUCH_CS, RFID_CS}) {
    pinMode(cs, OUTPUT);
    digitalWrite(cs, HIGH);
  }
  SPI.begin(SPI_CLK, SPI_MISO, SPI_MOSI);
#if LCD_ILI9341
  tft.begin(20000000);
#else
  tft.init(240, 320);
  tft.setSPISpeed(20000000);
#endif
  tft.setRotation(0);
  touchReady = touch.begin(SPI);
  touch.setRotation(0);
  fpSerial.begin(FP_BAUD, SERIAL_8N1, FP_RX, FP_TX);
  delay(250); // Cho module van tay on dinh nguon.
  help();
  probeSensors();
  home();
  status();
}

void loop() {
  pollDoor();
  // Tat PWM truoc cac lenh UART co the timeout.
  if (servoPulsing && millis() - servoMovedAt >= 800) {
    servo.detach();
    servoPulsing = false;
    Serial.println("[SERVO] Detached; khong giu luc sau test");
  }
  while (Serial.available()) {
    char command = Serial.read();
    switch (command) {
      case 'h': case '?': help(); break;
      case 's': status(); break;
      case 'o': moveServo(SERVO_OPEN); break;
      case 'l': moveServo(SERVO_CLOSE); break;
      case 'x': servo.detach(); servoPulsing = false; Serial.println("[SERVO] Detached"); break;
      case 'c':
        if (digitalRead(DOOR_PIN) != doorStable || millis() - doorChangedAt < 40)
          Serial.println("[DOOR] Chua on dinh; giu nam cham yen roi go c lai");
        else { doorClosedLevel = doorStable; showDoor(); }
        break;
      case 'r':
        if (servoPulsing) Serial.println("[TEST] Doi servo detach roi go r lai");
        else { probeSensors(); home(); }
        break;
      case 'd':
        if (servoPulsing) { Serial.println("[TEST] Doi servo detach roi go d lai"); break; }
        for (uint16_t color : {RED, GREEN, BLUE, WHITE}) { tft.fillScreen(color); delay(200); }
        home();
        Serial.println("[TFT] RGB/white done; kiem tra day man, mau va chieu xoay");
        break;
      case '\r': case '\n': case ' ': break;
      default: Serial.println("Lenh khong hop le; go h"); break;
    }
  }
  pollTouch();
  pollRfid();
  if (!servoPulsing) pollFinger(); // Tranh UART timeout keo dai PWM servo.
  delay(2);
}
