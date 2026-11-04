/*
 * SMART DOOR OFFLINE - ESP32-S3 N16R8, COM5 / 115200.
 * Mot sketch, khong Wi-Fi/MQTT/backend. Pinout theo README(4).md.
 * Arduino IDE: ESP32S3 Dev Module, Flash 16MB, OPI PSRAM, USB CDC enabled.
 * Libraries: Adafruit GFX, ST7735/ST7789 (or ILI9341), XPT2046_Touchscreen,
 * MFRC522, Adafruit Fingerprint Sensor Library, ESP32Servo.
 * TFT mac dinh ST7789 240x320; dat LCD_ILI9341=1 neu module dung ILI9341.
 * Lan dau: cham 3 diem + tam -> tao admin PIN -> user PIN -> dong cua/SAVE.
 * ADMIN tren man hinh: quan ly the/van tay/PIN, touch, cua, goc servo.
 * Serial chi co h/s/r (help/status/retry), khong co lenh bo qua xac thuc.
 * SG90: nguon 5V rieng, chung GND, thu khong tai va chinh goc truoc khi lap.
 * PWM tu ngat sau 900ms: co cau khoa phai tu giu vi tri khi servo nha luc.
 * Cam bien tu chi xac nhan canh cua, khong xac nhan vi tri chot khoa.
 * Chi mau van tay duoc dang ky tai menu nay moi duoc cap quyen.
 */
#include <Arduino.h>
#include <SPI.h>
#include <Preferences.h>
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
#include <mbedtls/sha256.h>
#include <esp_system.h>
#include <math.h>
#include <stddef.h>

// Forward types for Arduino's generated function declarations.
struct PinSecret;
struct Calibration;
struct Config;
struct Card;
struct MotorState;
enum Screen : uint8_t;

// BEGIN HOST-TESTED DOOR LOGIC
namespace DoorLogic {
struct State;
void release(State &s, uint32_t now, bool closed);
bool tick(State &s, uint32_t now, bool closed);
bool heldOpen(const State &s, uint32_t now, bool closed);
constexpr uint32_t ENTRY_MS = 5000, CLOSE_SETTLE_MS = 1000, HELD_MS = 20000;
struct State {
  bool released = false, opened = false, wasClosed = false;
  uint32_t releasedAt = 0, closedAt = 0, openedAt = 0;
};
void release(State &s, uint32_t now, bool closed) {
  s.released = true; s.opened = !closed; s.wasClosed = closed;
  s.releasedAt = now; s.closedAt = now; s.openedAt = now;
}
// True means command the latch closed. An open door NEVER triggers this.
bool tick(State &s, uint32_t now, bool closed) {
  if (closed && !s.wasClosed) s.closedAt = now;
  if (!closed && s.wasClosed) s.openedAt = now;
  s.wasClosed = closed;
  if (!s.released) return false;
  if (!closed) { s.opened = true; return false; }
  if ((s.opened && uint32_t(now - s.closedAt) >= CLOSE_SETTLE_MS) ||
      (!s.opened && uint32_t(now - s.releasedAt) >= ENTRY_MS)) {
    s.released = false;
    return true;
  }
  return false;
}
bool heldOpen(const State &s, uint32_t now, bool closed) {
  return s.released && !closed && uint32_t(now - s.openedAt) >= HELD_MS;
}
}
// END HOST-TESTED DOOR LOGIC

constexpr int TFT_CS=47, TOUCH_CS=48, RFID_CS=10, RFID_RST=9;
constexpr int TFT_DC=2, TFT_RST=1, DOOR_PIN=6, SERVO_PIN=4;
constexpr int FP_RX=17, FP_TX=18;
constexpr uint32_t FP_BAUD=57600, ADMIN_IDLE_MS=90000, ADMIN_MAX_MS=300000;
constexpr uint16_t BLACK=0x0000, WHITE=0xffff, CYAN=0x07ff;
constexpr uint16_t GREEN=0x07e0, RED=0xf800, YELLOW=0xffe0, GRAY=0x4208;
constexpr int MAX_CARDS=32, MAX_FINGERS=32;
constexpr uint32_t CONFIG_MAGIC=0x4f444f52;

struct PinSecret { uint8_t valid, salt[16], hash[32]; };
struct Card { uint8_t size, bytes[10]; };
struct Calibration { uint8_t valid; float a,b,c,d,e,f; };
struct Config {
  uint32_t magic, version;
  PinSecret admin, user;
  Calibration touch;
  int8_t closedLevel;
  uint8_t lockAngle, openAngle, cardCount, fingerCount;
  Card cards[MAX_CARDS];
  uint16_t fingers[MAX_FINGERS];
  uint8_t checksum[32];
};
Config cfg{};
Preferences nvs;
bool storageFault=false, rfidReady=false, fingerReady=false, touchReady=false;
bool actuatorReady=false;
uint8_t failedPins=0;
uint32_t blockedSince=0;
bool pinBlocked=false;

#if LCD_ILI9341
Adafruit_ILI9341 tft(&SPI,TFT_CS,TFT_DC,TFT_RST);
#else
Adafruit_ST7789 tft(&SPI,TFT_CS,TFT_DC,TFT_RST);
#endif
XPT2046_Touchscreen touch(TOUCH_CS);
MFRC522 rfid(RFID_CS,RFID_RST);
HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);
Servo servo;

// The motor task owns the Servo. UI/UART only submit state under this mutex.
SemaphoreHandle_t motorMutex=nullptr;
struct MotorState {
  DoorLogic::State door;
  int raw=HIGH, stable=HIGH, closedLevel=-1;
  uint32_t changedAt=0;
  bool enabled=false, pending=false, fault=false;
  int target=30, lockAngle=30, openAngle=100;
} motor;

enum Screen : uint8_t {
  HOME, ADMIN_LOGIN, SET_ADMIN, CONFIRM_ADMIN, SET_USER, CONFIRM_USER,
  MENU, ADD_CARD, REMOVE_CARD, ENROLL, REMOVE_FINGER, TOUCH_CAL,
  DOOR_CAL, MOTOR, DEVICE_STATUS, DELETE_CONFIRM
};
Screen screen=HOME;
bool adminSession=false;
uint32_t adminStarted=0, adminActivity=0;
String digits, firstPin, notice;
bool fingerHeld=false, touchDown=false;
uint32_t lastTouch=0, lastRfid=0, lastFinger=0, lastRefresh=0;
bool lastStateValid=false, lastReleased=false, lastDoorClosed=false;
uint8_t enrollStage=0;
uint16_t enrollSlot=0;
uint32_t enrollStarted=0;
uint8_t calStep=0;
int32_t calX[3],calY[3];
Calibration pendingCal{};
uint8_t listPage=0;
bool deletingFinger=false;
Card selectedCard{};
uint16_t selectedFinger=0;
int64_t sampleX=0,sampleY=0;
int sampleCount=0, sampleMinX=4095,sampleMaxX=0,sampleMinY=4095,sampleMaxY=0;
uint32_t touchStarted=0;
bool calCaptured=false;
bool calibrationArmed=false, releasingTouch=false;
uint32_t touchReleaseAt=0, touchDiagnosticAt=0, lastTouchDiagnostic=0;
bool touchDiagnostics=false;

bool sensorCycleVerified=false;
int8_t doorCalClosedSample=-1;
bool configured() { return cfg.admin.valid && cfg.user.valid && cfg.touch.valid && cfg.closedLevel>=0 && sensorCycleVerified; }
bool isClosed(const MotorState &m,uint32_t now) {
  return m.closedLevel>=0 && m.stable==m.closedLevel && m.raw==m.stable &&
         uint32_t(now-m.changedAt)>=40;
}
MotorState snapshot() {
  MotorState out;
  if (!motorMutex) return out;
  xSemaphoreTake(motorMutex,portMAX_DELAY); out=motor; xSemaphoreGive(motorMutex);
  return out;
}
void motorTask(void *) {
  bool pulsing=false;
  uint32_t pulseAt=0;
  for (;;) {
    uint32_t now=millis();
    xSemaphoreTake(motorMutex,portMAX_DELAY);
    int raw=digitalRead(DOOR_PIN);
    if (raw!=motor.raw) { motor.raw=raw; motor.changedAt=now; }
    if (now-motor.changedAt>=40) motor.stable=raw;
    bool closed=isClosed(motor,now);
    if (motor.enabled && DoorLogic::tick(motor.door,now,closed)) {
      motor.target=motor.lockAngle; motor.pending=true;
    }
    if (motor.pending && motor.enabled) {
      motor.pending=false;
      if (!servo.attached()) servo.attach(SERVO_PIN,1000,2000);
      if (servo.attached()) {
        servo.write(motor.target); pulseAt=now; pulsing=true;
      } else motor.fault=true;
    }
    if (pulsing && uint32_t(now-pulseAt)>=900) { servo.detach(); pulsing=false; }
    xSemaphoreGive(motorMutex);
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
void applyMotorConfig() {
  if (!actuatorReady) return;
  xSemaphoreTake(motorMutex,portMAX_DELAY);
  bool wasEnabled=motor.enabled;
  motor.closedLevel=cfg.closedLevel;
  motor.lockAngle=cfg.lockAngle; motor.openAngle=cfg.openAngle;
  motor.enabled=configured();
  if (motor.enabled && !wasEnabled) {
    bool closed=isClosed(motor,millis());
    if (closed) motor.door=DoorLogic::State{};
    else DoorLogic::release(motor.door,millis(),false);
    motor.target=closed ? motor.lockAngle : motor.openAngle;
    motor.pending=true;
  }
  xSemaphoreGive(motorMutex);
}
bool requestOpen() {
#ifdef CONNECTED_DOOR
  if (!connectedAccessReady()) return false;
#endif
  if (storageFault || !actuatorReady || !configured()) return false;
  xSemaphoreTake(motorMutex,portMAX_DELAY);
  bool ok=motor.enabled && !motor.fault;
  if (ok && !motor.door.released) {
    DoorLogic::release(motor.door,millis(),isClosed(motor,millis()));
    motor.target=motor.openAngle; motor.pending=true;
  }
  xSemaphoreGive(motorMutex);
  return ok;
}
bool requestLock() {
  if (!actuatorReady) return false;
  xSemaphoreTake(motorMutex,portMAX_DELAY);
  bool ok=motor.enabled && isClosed(motor,millis()) && !motor.fault;
  if (ok) {
    motor.door.released=false; motor.target=motor.lockAngle; motor.pending=true;
  }
  xSemaphoreGive(motorMutex);
  return ok;
}

void sha(const uint8_t *data,size_t size,uint8_t *out) {
  mbedtls_sha256_ret(data,size,out,0);
}
void pinDigest(const PinSecret &secret,const String &pin,uint8_t *out) {
  uint8_t input[22];
  memcpy(input,secret.salt,16);
  for (int i=0;i<6;i++) input[16+i]=pin[i];
  sha(input,sizeof(input),out);
  memset(input,0,sizeof(input));
}
bool pinMatches(const PinSecret &secret,const String &pin) {
  if (!secret.valid || pin.length()!=6) return false;
  uint8_t hash[32],diff=0; pinDigest(secret,pin,hash);
  for (int i=0;i<32;i++) diff|=hash[i]^secret.hash[i];
  memset(hash,0,sizeof(hash));
  return diff==0;
}
PinSecret makePin(const String &pin) {
  PinSecret result{}; result.valid=1;
  esp_fill_random(result.salt,sizeof(result.salt)); pinDigest(result,pin,result.hash);
  return result;
}
bool validCal(const Calibration &c) {
  return c.valid==1 && isfinite(c.a) && isfinite(c.b) && isfinite(c.c) &&
    isfinite(c.d) && isfinite(c.e) && isfinite(c.f) &&
    fabsf(c.a*c.e-c.b*c.d)>0.00001f;
}
bool validConfig(const Config &c) {
  if (c.magic!=CONFIG_MAGIC || c.version!=1 || c.admin.valid>1 || c.user.valid>1 ||
      c.cardCount>MAX_CARDS || c.fingerCount>MAX_FINGERS ||
      c.closedLevel < -1 || c.closedLevel>1 || c.lockAngle<5 || c.lockAngle>175 ||
      c.openAngle<5 || c.openAngle>175 || c.lockAngle==c.openAngle ||
      c.touch.valid>1 || (c.touch.valid && !validCal(c.touch))) return false;
  for (int i=0;i<c.cardCount;i++)
    if (c.cards[i].size!=4 && c.cards[i].size!=7 && c.cards[i].size!=10) return false;
  for (int i=0;i<c.fingerCount;i++) {
    if (!c.fingers[i] || c.fingers[i]>255) return false;
    for (int j=0;j<i;j++) if (c.fingers[i]==c.fingers[j]) return false;
  }
  uint8_t hash[32]; sha((const uint8_t*)&c,offsetof(Config,checksum),hash);
  return memcmp(hash,c.checksum,32)==0;
}
bool saveConfig(Config next) {
  if (storageFault) return false;
  sha((uint8_t*)&next,offsetof(Config,checksum),next.checksum);
  if (!validConfig(next) || nvs.putBytes("config",&next,sizeof(next))!=sizeof(next)) {
    storageFault=true; return false;
  }
  cfg=next; applyMotorConfig(); return true;
}
void loadConfig() {
  cfg={}; cfg.magic=CONFIG_MAGIC; cfg.version=1;
  cfg.closedLevel=-1; cfg.lockAngle=30; cfg.openAngle=100;
  if (!nvs.begin("offlinedoor",false)) { storageFault=true; return; }
  sensorCycleVerified=nvs.getBool("reedVerified",false);
  size_t size=nvs.getBytesLength("config");
  if (size) {
    Config stored{};
    if (size!=sizeof(stored) || nvs.getBytes("config",&stored,sizeof(stored))!=sizeof(stored) ||
        !validConfig(stored)) { storageFault=true; return; }
    cfg=stored;
  }
  failedPins=nvs.getUChar("badpin",0);
  if (failedPins>=5) { pinBlocked=true; blockedSince=millis(); }
}
bool setFailures(uint8_t count) {
  if (storageFault || nvs.putUChar("badpin",count)!=1) { storageFault=true; return false; }
  failedPins=count; return true;
}
void denyPin() {
  if (!setFailures(failedPins+1)) return;
  if (failedPins>=5) { pinBlocked=true; blockedSince=millis(); }
}
int cardIndex(const Card &card) {
  for (int i=0;i<cfg.cardCount;i++)
    if (card.size==cfg.cards[i].size && !memcmp(card.bytes,cfg.cards[i].bytes,card.size)) return i;
  return -1;
}
int fingerIndex(uint16_t id) {
  for (int i=0;i<cfg.fingerCount;i++) if (cfg.fingers[i]==id) return i;
  return -1;
}
String cardName(const Card &card) {
  String result;
  for (int i=0;i<card.size;i++) {
    if (card.bytes[i]<16) result+='0';
    result+=String(card.bytes[i],HEX);
  }
  result.toUpperCase(); return result;
}

void text(int x,int y,const String &value,uint16_t color=WHITE,int size=1) {
  tft.setCursor(x,y); tft.setTextColor(color); tft.setTextSize(size); tft.print(value);
}
void row(int y,const String &value,uint16_t color=WHITE) {
  tft.fillRect(0,y,240,17,BLACK); text(5,y+4,value.substring(0,38),color);
}
void button(int x,int y,int w,int h,const String &label,uint16_t color=CYAN) {
  tft.drawRoundRect(x,y,w,h,4,color);
  int size=label.length()<=3 ? 2 : 1;
  text(x+max(3,(w-int(label.length())*6*size)/2),y+(h-8*size)/2,label,color,size);
}
void title(const String &label) {
  tft.fillScreen(BLACK); text(5,10,label,CYAN,2);
}
void draw();
void go(Screen next) {
  if(next==DOOR_CAL)doorCalClosedSample=-1;
  screen=next; digits=""; fingerHeld=true; enrollStage=0;
  draw();
}
void tell(const String &message) {
  notice=message;
  Serial.println("[DOOR] "+message);
  if (screen!=TOUCH_CAL) row(35,message,YELLOW);
}
void drawStatus() {
  title("DEVICE STATUS");
  MotorState m=snapshot();
  row(40,storageFault ? "STORAGE ERROR - access blocked" : "Storage: OK",storageFault?RED:GREEN);
  row(65,actuatorReady && !m.fault ? "Motor task: OK" : "Motor task: FAILED",m.fault?RED:WHITE);
  row(90,rfidReady ? "RFID: responding" : "RFID: offline");
  row(115,fingerReady ? "Fingerprint: responding" : "Fingerprint: offline");
  row(140,"Cards: "+String(cfg.cardCount)+"/32");
  row(165,"Fingers: "+String(cfg.fingerCount)+"/32");
  row(190,"Door GPIO6 raw: "+String(m.raw));
  row(215,"Lock/Open: "+String(cfg.lockAngle)+" / "+String(cfg.openAngle));
  button(8,242,224,30,"RETRY MODULES");
  button(8,280,224,32,"BACK");
}
void drawCalibration() {
  title("TOUCH SETUP");
  row(35,calStep<3 ? "Hold target, then lift finger" : "Tap CENTER to verify",YELLOW);
  const int targetX[4]={25,215,25,120},targetY[4]={70,70,290,180};
  int x=targetX[calStep],y=targetY[calStep];
  tft.drawCircle(x,y,12,CYAN); tft.drawFastHLine(x-18,y,36,WHITE);
  tft.drawFastVLine(x,y-18,36,WHITE);
  row(105,"Point "+String(calStep+1)+" / 4");
  row(125,"Serial s: status, r: retry devices");
}
void draw() {
  if (screen==TOUCH_CAL) { drawCalibration(); return; }
  if (screen==DEVICE_STATUS) { drawStatus(); return; }
  if (screen==REMOVE_CARD || screen==REMOVE_FINGER) {
    title(screen==REMOVE_CARD?"DELETE CARD":"DELETE FINGER");
    int count=screen==REMOVE_CARD?cfg.cardCount:cfg.fingerCount;
    row(35,"Select entry to revoke",YELLOW);
    if (!count) row(90,"No authorized entries");
    for (int n=0;n<5;n++) {
      int index=listPage*5+n; if (index>=count) break;
      String label=screen==REMOVE_CARD?cardName(cfg.cards[index]):"Finger ID "+String(cfg.fingers[index]);
      button(5,62+n*38,230,33,label);
    }
    button(5,256,72,28,"PREV"); button(163,256,72,28,"NEXT");
    text(93,265,String(listPage+1)+"/"+String(max(1,(count+4)/5)));
    button(5,290,230,26,"CANCEL"); return;
  }
  if (screen==DELETE_CONFIRM) {
    title("CONFIRM DELETE");
    row(80,deletingFinger?"Finger ID "+String(selectedFinger):cardName(selectedCard),YELLOW);
    row(115,"This entry will lose door access");
    button(8,190,224,45,"REVOKE ACCESS",RED);
    button(8,280,224,32,"CANCEL"); return;
  }
  bool keypad=screen==HOME || screen==ADMIN_LOGIN || screen==SET_ADMIN ||
    screen==CONFIRM_ADMIN || screen==SET_USER || screen==CONFIRM_USER;
  if (keypad) {
    String heading="ENTER PIN";
    if (screen==ADMIN_LOGIN) heading="ADMIN PIN";
    if (screen==SET_ADMIN) heading="NEW ADMIN";
    if (screen==CONFIRM_ADMIN || screen==CONFIRM_USER) heading="REPEAT PIN";
    if (screen==SET_USER) heading="NEW DOOR PIN";
    title(heading);
    if (screen==HOME) button(165,2,72,29,"ADMIN");
    else if (cfg.admin.valid) button(182,2,55,29,"BACK");
    const char *keys="123456789C0E";
    for (int i=0;i<12;i++) button(8+(i%3)*76,92+(i/3)*55,72,50,String(keys[i]));
    row(35,notice,YELLOW);
    return;
  }
  if (screen==MENU) {
    title("ADMIN");
    const char *labels[]={"ADD CARD","DELETE CARD","ADD FINGER","DELETE FINGER","DOOR PIN",
      "ADMIN PIN","TOUCH SETUP","DOOR SETUP","SERVO SETUP","STATUS"};
    for (int i=0;i<10;i++) button(5+(i%2)*118,55+(i/2)*46,112,40,labels[i]);
    button(5,289,230,28,"EXIT ADMIN");
  } else if (screen==MOTOR) {
    title("SERVO SETUP");
    row(62,"Adjust unloaded, 5-degree steps");
    row(86,"LOCK ANGLE: "+String(cfg.lockAngle));
    button(8,110,105,38,"LOCK -"); button(127,110,105,38,"LOCK +");
    row(162,"OPEN ANGLE: "+String(cfg.openAngle));
    button(8,185,105,38,"OPEN -"); button(127,185,105,38,"OPEN +");
    button(8,236,105,36,"TEST OPEN"); button(127,236,105,36,"LOCK NOW");
    button(8,282,224,30,"BACK");
  } else if (screen==DOOR_CAL) {
    title("DOOR SETUP");
    row(75,"Close door / place magnet");
    row(100,"Confirm CLOSED, then confirm OPEN");
    row(125,"Never calibrate with door open",YELLOW);
    button(8,195,224,48,"CONFIRM STATE");
    if (cfg.closedLevel>=0) button(8,280,224,32,"CANCEL");
  } else {
    title(screen==ADD_CARD?"ADD CARD":screen==REMOVE_CARD?"DELETE CARD":
          screen==ENROLL?"ADD FINGER":"DELETE FINGER");
    row(80,(screen==ADD_CARD || screen==REMOVE_CARD)?"Present card to RC522":"Place finger on sensor");
    if (screen==ENROLL) row(115,"Scan -> lift -> same finger again");
    row(150,"Only registered users can enter");
    button(8,280,224,32,"CANCEL");
  }
  row(35,notice,YELLOW);
}
void drawDigits() {
  tft.fillRect(0,57,240,29,BLACK);
  String hidden; for (unsigned i=0;i<digits.length();i++) hidden+='*';
  text(65,60,hidden,WHITE,2);
}
void endAdmin() {
  adminSession=false; firstPin=""; notice=""; enrollStage=0;
  if (!cfg.admin.valid) go(SET_ADMIN);
  else if (!configured()) go(ADMIN_LOGIN);
  else go(HOME);
}
void continueSetup() {
  notice="";
  if (!cfg.user.valid) go(SET_USER);
  else if (cfg.closedLevel<0 || !sensorCycleVerified) go(DOOR_CAL);
  else go(MENU);
}
void storageError() {
  storageFault=true; adminSession=false; pinBlocked=false; firstPin="";
  go(DEVICE_STATUS); tell("Storage error. Reboot / service");
}
bool grant(const char *method) {
  if (requestOpen()) {
    Serial.printf("[ACCESS] %s GRANTED\n",method);
    tell("OPEN - enter, then close door");
#ifdef CONNECTED_DOOR
    if (strcmp(method,"PIN")==0) connectedRecord("PIN",true,"",-1);
#endif
    return true;
  } else tell("Access blocked: setup/motor/storage");
  return false;
}
void chooseDeleteCard(const Card &card) {
  deletingFinger=false; selectedCard=card; go(DELETE_CONFIRM);
}
void chooseDeleteFinger(uint16_t id) {
  deletingFinger=true; selectedFinger=id; go(DELETE_CONFIRM);
}
void deleteSelected() {
  if (!adminSession || storageFault) return;
  Config next=cfg;
  if (deletingFinger) {
    int index=fingerIndex(selectedFinger);
    if (index>=0) {
      next.fingers[index]=next.fingers[--next.fingerCount];
      if (!saveConfig(next)) { storageError(); return; }
    }
    bool deleted=fingerReady && finger.deleteModel(selectedFinger)==FINGERPRINT_OK;
    go(MENU); tell(deleted?"Finger revoked and deleted":"Revoked; sensor cleanup pending");
  } else {
    int index=cardIndex(selectedCard);
    if (index<0) { go(MENU); tell("Card already revoked"); return; }
    next.cards[index]=next.cards[--next.cardCount];
    if (!saveConfig(next)) { storageError(); return; }
    go(MENU); tell("Card revoked");
  }
}
void submitPin() {
  if (storageFault) { storageError(); return; }
  if (pinBlocked) { digits=""; drawDigits(); tell("PIN blocked for 30 seconds"); return; }
  if (digits.length()!=6) { tell("Enter exactly 6 digits"); return; }
  String entered=digits; digits=""; drawDigits();
  if (screen==HOME || screen==ADMIN_LOGIN) {
    bool ok=pinMatches(screen==HOME?cfg.user:cfg.admin,entered);
    entered="";
    if (!ok) { denyPin(); tell(pinBlocked?"Too many attempts - wait 30s":"Incorrect PIN"); return; }
    if (!setFailures(0)) { storageError(); return; }
    if (screen==HOME) { grant("PIN"); return; }
    adminSession=true; adminStarted=adminActivity=millis(); continueSetup(); return;
  }
  bool adminPin=screen==SET_ADMIN || screen==CONFIRM_ADMIN;
  if (screen==SET_ADMIN || screen==SET_USER) {
    if (pinMatches(adminPin?cfg.user:cfg.admin,entered)) {
      tell("Admin and door PIN must differ"); return;
    }
    firstPin=entered; go(adminPin?CONFIRM_ADMIN:CONFIRM_USER); return;
  }
  if (entered!=firstPin) {
    firstPin=""; go(adminPin?SET_ADMIN:SET_USER); tell("PINs differ - enter again"); return;
  }
  Config next=cfg;
  if (adminPin) next.admin=makePin(entered); else next.user=makePin(entered);
  firstPin=""; entered="";
  if (!saveConfig(next)) { storageError(); return; }
  if (!adminSession) { adminSession=true; adminStarted=adminActivity=millis(); }
  continueSetup(); tell("PIN saved");
}

bool readFingerBitmap(uint8_t *bitmap) {
  uint8_t data[2]={0x1f,0}; // Page 0, IDs 0..255 only.
  Adafruit_Fingerprint_Packet packet(FINGERPRINT_COMMANDPACKET,2,data);
  finger.writeStructuredPacket(packet);
  if (finger.getStructuredPacket(&packet,1000)!=FINGERPRINT_OK ||
      packet.type!=FINGERPRINT_ACKPACKET || packet.length!=35 || packet.data[0]!=FINGERPRINT_OK) return false;
  uint16_t sum=packet.type+(packet.length>>8)+(packet.length&255);
  for (int i=0;i<33;i++) sum+=packet.data[i];
  if (sum!=uint16_t((packet.data[33]<<8)|packet.data[34])) return false;
  memcpy(bitmap,packet.data+1,32); return true;
}
bool slotEmpty(uint16_t slot) {
  uint8_t bitmap[32];
  return slot>0 && slot<256 && readFingerBitmap(bitmap) && !(bitmap[slot/8]&(1<<(slot%8)));
}
void finishEnroll(const String &message) {
  enrollStage=0; fingerHeld=true; go(MENU); tell(message);
}
void startEnroll() {
  if (!fingerReady || cfg.fingerCount>=MAX_FINGERS) { tell("Sensor offline or 32-user limit"); return; }
  uint8_t bitmap[32];
  if (!readFingerBitmap(bitmap)) { tell("Cannot read sensor slots safely"); return; }
  enrollSlot=0;
  for (uint16_t id=1;id<min(uint16_t(256),finger.capacity);id++) {
    if (!(bitmap[id/8]&(1<<(id%8))) && fingerIndex(id)<0) { enrollSlot=id; break; }
  }
  if (!enrollSlot) { tell("No empty slot; existing data kept"); return; }
  go(ENROLL); enrollStage=1; enrollStarted=millis();
  tell("Lift finger, then scan #1");
}
void probeSensors() {
  for (int pin : {TFT_CS,TOUCH_CS,RFID_CS}) digitalWrite(pin,HIGH);
  rfid.PCD_Init();
  byte version=rfid.PCD_ReadRegister(MFRC522::VersionReg);
  rfidReady=version!=0 && version!=0xff;
  fingerReady=finger.verifyPassword() && finger.getParameters()==FINGERPRINT_OK;
  fingerHeld=true;
  Serial.printf("[SENSORS] RC522=0x%02X FP=%s capacity=%u\n",version,fingerReady?"OK":"OFFLINE",finger.capacity);
}
void pollRfid() {
  if (!rfidReady || millis()-lastRfid<120 || storageFault || !configured()) return;
  lastRfid=millis();
  if (screen!=HOME && screen!=ADD_CARD && screen!=REMOVE_CARD) return;
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  Card card{}; card.size=rfid.uid.size;
  if (card.size>10) { rfid.PICC_HaltA(); return; }
  memcpy(card.bytes,rfid.uid.uidByte,card.size);
  rfid.PICC_HaltA(); rfid.PCD_StopCrypto1();
#ifdef CONNECTED_DOOR
  if (connectedCaptureCard(cardName(card))) return;
#endif
  int index=cardIndex(card);
  if (screen==HOME) {
    bool opened=index>=0?grant("RFID"):false;
#ifdef CONNECTED_DOOR
    String uid=cardName(card);
    connectedRecord("RFID",opened,uid.c_str(),-1);
#endif
    if (index<0) tell("Card not authorized");
    return;
  }
  if (!adminSession) return;
  adminActivity=millis();
  if (screen==REMOVE_CARD) {
    if (index<0) tell("Card is not in allowlist");
    else chooseDeleteCard(card);
    return;
  }
  Config next=cfg;
  if (screen==ADD_CARD) {
    if (index>=0) { tell("Card already authorized"); return; }
    if (cfg.cardCount>=MAX_CARDS) { tell("32 cards maximum"); return; }
    next.cards[next.cardCount++]=card;
  }
  if (!saveConfig(next)) { storageError(); return; }
  go(MENU); tell("Card added");
}
void pollFinger() {
#ifdef CONNECTED_DOOR
  if (connectedIsEnrolling()) return;
#endif
  if (!fingerReady || storageFault || millis()-lastFinger<200) return;
  if (screen!=HOME && screen!=ENROLL && screen!=REMOVE_FINGER) return;
  if (screen==HOME && !configured()) return;
  lastFinger=millis();
  uint8_t result=finger.getImage();
  if (result==FINGERPRINT_NOFINGER) {
    fingerHeld=false;
    if (screen==ENROLL && enrollStage==2) { enrollStage=3; tell("Scan SAME finger #2"); }
    return;
  }
  if (result!=FINGERPRINT_OK) {
    if (result==FINGERPRINT_PACKETRECIEVEERR || result==FINGERPRINT_TIMEOUT) {
      fingerReady=false;
      if (screen==ENROLL) finishEnroll("Sensor lost; retry with Serial r");
      else tell("Fingerprint offline; use PIN/card");
    }
    return;
  }
  if (fingerHeld || (screen==ENROLL && enrollStage==2)) return;
  fingerHeld=true;
  if (finger.image2Tz(screen==ENROLL && enrollStage==3?2:1)!=FINGERPRINT_OK) {
    tell("Poor image - lift and retry"); return;
  }
  if (screen==ENROLL) {
    if (!adminSession) return;
    adminActivity=millis();
    if (enrollStage==1) {
      result=finger.fingerFastSearch();
      if (result==FINGERPRINT_OK) { finishEnroll("Finger already stored; delete first"); return; }
      if (result!=FINGERPRINT_NOTFOUND) { finishEnroll("Sensor search failed; retry"); return; }
      enrollStage=2; tell("Lift finger completely"); return;
    }
    if (finger.createModel()!=FINGERPRINT_OK) { finishEnroll("Scans differ; enrollment cancelled"); return; }
    if (!slotEmpty(enrollSlot)) { finishEnroll("Slot occupied/unreadable; kept intact"); return; }
    if (finger.storeModel(enrollSlot)!=FINGERPRINT_OK) { finishEnroll("Sensor could not save template"); return; }
    Config next=cfg; next.fingers[next.fingerCount++]=enrollSlot;
    if (!saveConfig(next)) {
      finger.deleteModel(enrollSlot); storageError(); return;
    }
    finishEnroll("Finger added ID "+String(enrollSlot)); return;
  }
  result=finger.fingerFastSearch();
  if (result!=FINGERPRINT_OK) { tell("Fingerprint not recognized"); return; }
  uint16_t id=finger.fingerID;
  int index=fingerIndex(id);
  if (screen==HOME) {
    bool opened=index>=0?grant("FINGER"):false;
#ifdef CONNECTED_DOOR
    connectedRecord("FINGERPRINT",opened,"",id);
#endif
    if (index<0) tell("Finger not authorized on this door");
    return;
  }
  if (!adminSession) return;
  adminActivity=millis();
  // Also permits cleanup of an orphan template after a failed sensor deletion.
  chooseDeleteFinger(id);
}

void beginCalibration() {
  calStep=0; calCaptured=false; sampleCount=0; calibrationArmed=false;
  go(TOUCH_CAL);
}
bool solveCalibration() {
  float x0=calX[0],y0=calY[0],dx1=calX[1]-x0,dy1=calY[1]-y0;
  float dx2=calX[2]-x0,dy2=calY[2]-y0,det=dx1*dy2-dx2*dy1;
  if (fabsf(det)<100000) return false;
  pendingCal={}; pendingCal.valid=1;
  pendingCal.a=190*dy2/det; pendingCal.b=-190*dx2/det;
  pendingCal.d=-220*dy1/det; pendingCal.e=220*dx1/det;
  pendingCal.c=25-pendingCal.a*x0-pendingCal.b*y0;
  pendingCal.f=70-pendingCal.d*x0-pendingCal.e*y0;
  return validCal(pendingCal);
}
void acceptCalibrationPoint(int x,int y) {
  Serial.printf("[TOUCH] Calibration point %u raw=%d,%d\n",calStep+1,x,y);
  if (calStep<3) {
    calX[calStep]=x; calY[calStep]=y; calStep++;
    if (calStep==3 && !solveCalibration()) { calStep=0; }
    drawCalibration(); return;
  }
  float sx=pendingCal.a*x+pendingCal.b*y+pendingCal.c;
  float sy=pendingCal.d*x+pendingCal.e*y+pendingCal.f;
  if (fabsf(sx-120)>22 || fabsf(sy-180)>22) {
    calStep=0; drawCalibration(); Serial.println("[TOUCH] Verification failed; repeat calibration"); return;
  }
  Config next=cfg; next.touch=pendingCal;
  if (!saveConfig(next)) { storageError(); return; }
  if (adminSession) { go(MENU); tell("Touch calibration saved"); }
  else if (!cfg.admin.valid) { notice="Create your 6-digit admin PIN"; go(SET_ADMIN); }
  else if (!configured()) { notice="Admin PIN to finish setup"; go(ADMIN_LOGIN); }
  else { notice=""; go(HOME); }
}
bool inside(int x,int y,int left,int top,int w,int h) {
  return x>=left && x<left+w && y>=top && y<top+h;
}
void tap(int x,int y) {
#ifdef CONNECTED_DOOR
  if(connectedSetupTouch(x,y))return;
#endif
  if (storageFault && screen!=DEVICE_STATUS) { storageError(); return; }
  if (adminSession) adminActivity=millis();
  if (screen==DEVICE_STATUS) {
    if (inside(x,y,8,242,224,30) && !storageFault) {
      probeSensors(); drawStatus(); return;
    }
    if (inside(x,y,8,280,224,32) && !storageFault) {
      if (adminSession) go(MENU); else endAdmin();
    }
    return;
  }
  if (screen==HOME || screen==ADMIN_LOGIN || screen==SET_ADMIN || screen==CONFIRM_ADMIN ||
      screen==SET_USER || screen==CONFIRM_USER) {
    if (screen==HOME && inside(x,y,165,2,72,29)) { notice=""; go(ADMIN_LOGIN); return; }
    if (screen!=HOME && cfg.admin.valid && inside(x,y,182,2,55,29)) {
      firstPin=""; if (adminSession && configured()) go(MENU); else endAdmin(); return;
    }
    for (int i=0;i<12;i++) if (inside(x,y,8+(i%3)*76,92+(i/3)*55,72,50)) {
      char key="123456789C0E"[i];
      if (key=='C') { digits=""; notice=""; row(35,""); }
      else if (key=='E') { submitPin(); return; }
      else if (digits.length()<6 && !pinBlocked) digits+=key;
      drawDigits(); return;
    }
    return;
  }
  if (!adminSession) { endAdmin(); return; }
  if (screen==DELETE_CONFIRM) {
    if (inside(x,y,8,190,224,45)) deleteSelected();
    else if (inside(x,y,8,280,224,32)) { go(deletingFinger?REMOVE_FINGER:REMOVE_CARD); }
    return;
  }
  if (screen==REMOVE_CARD || screen==REMOVE_FINGER) {
    int count=screen==REMOVE_CARD?cfg.cardCount:cfg.fingerCount;
    if (inside(x,y,5,290,230,26)) { notice=""; go(MENU); return; }
    if (inside(x,y,5,256,72,28) && listPage>0) { listPage--; draw(); return; }
    if (inside(x,y,163,256,72,28) && (listPage+1)*5<count) { listPage++; draw(); return; }
    for (int n=0;n<5;n++) if (inside(x,y,5,62+n*38,230,33)) {
      int index=listPage*5+n;
      if (index<count) {
        if (screen==REMOVE_CARD) chooseDeleteCard(cfg.cards[index]);
        else chooseDeleteFinger(cfg.fingers[index]);
      }
      return;
    }
    return;
  }
  if (screen==MENU) {
    if (inside(x,y,5,289,230,28)) { endAdmin(); return; }
    for (int i=0;i<10;i++) if (inside(x,y,5+(i%2)*118,55+(i/2)*46,112,40)) {
#ifdef CONNECTED_DOOR
      if (i<6 && connectedManaged()) { tell("Manage credentials in owner mobile"); return; }
      if (i==9) { connectedNetworkPage(); return; }
#endif
      notice="";
      switch(i) {
        case 0: if (rfidReady) go(ADD_CARD); else tell("RFID offline - Serial r to retry"); break;
        case 1: listPage=0; go(REMOVE_CARD); break;
        case 2: startEnroll(); break;
        case 3: listPage=0; go(REMOVE_FINGER); break;
        case 4: go(SET_USER); break;
        case 5: go(SET_ADMIN); break;
        case 6: beginCalibration(); break;
        case 7: go(DOOR_CAL); break;
        case 8: go(MOTOR); break;
        case 9: go(DEVICE_STATUS); break;
      }
      return;
    }
  } else if (screen==DOOR_CAL && inside(x,y,8,195,224,48)) {
    MotorState m=snapshot();
    if (m.raw!=m.stable || millis()-m.changedAt<500) { tell("Hold magnet steady; retry"); return; }
    if(doorCalClosedSample<0){doorCalClosedSample=m.stable;row(75,"Now OPEN door / move magnet away",YELLOW);tell("Open door, wait, press CONFIRM");return;}
    if(m.stable==doorCalClosedSample){tell("No state change. Check sensor wiring");return;}
    Config next=cfg; next.closedLevel=doorCalClosedSample;
    if(!nvs.putBool("reedVerified",true)){storageError();return;}
    sensorCycleVerified=true;
    if (!saveConfig(next)) { storageError(); return; }
    go(MENU); tell("Closed-door level saved");
  } else if (screen==MOTOR) {
    Config next=cfg; bool changed=false;
    if (inside(x,y,8,110,105,38)) { next.lockAngle=max(5,int(cfg.lockAngle)-5); changed=true; }
    if (inside(x,y,127,110,105,38)) { next.lockAngle=min(175,int(cfg.lockAngle)+5); changed=true; }
    if (inside(x,y,8,185,105,38)) { next.openAngle=max(5,int(cfg.openAngle)-5); changed=true; }
    if (inside(x,y,127,185,105,38)) { next.openAngle=min(175,int(cfg.openAngle)+5); changed=true; }
    if (changed) {
      if (next.lockAngle==next.openAngle) { tell("Open and lock angles must differ"); return; }
      MotorState m=snapshot();
      if (m.door.released) { tell("Close and relock before adjusting"); return; }
      if (!saveConfig(next)) { storageError(); return; }
      draw(); tell("Angle saved; use TEST/LOCK to move"); return;
    }
    if (inside(x,y,8,236,105,36)) { grant("ADMIN TEST"); return; }
    if (inside(x,y,127,236,105,36)) { tell(requestLock()?"Lock commanded":"Door must be closed and stable"); return; }
    if (inside(x,y,8,282,224,30)) { notice=""; go(MENU); return; }
  }
  if ((screen==ADD_CARD || screen==REMOVE_CARD || screen==ENROLL || screen==REMOVE_FINGER ||
       (screen==DOOR_CAL && cfg.closedLevel>=0)) && inside(x,y,8,280,224,32)) {
    notice="Cancelled"; go(MENU);
  }
}
void pollTouch() {
  if (!touchReady || millis()-lastTouch<20) return;
  lastTouch=millis();
  bool down=touch.touched();
  if (!down) {
    // Resistive panels can briefly drop pressure while a finger is still down.
    if (!releasingTouch) { releasingTouch=true; touchReleaseAt=millis(); }
    if (millis()-touchReleaseAt<80) return;
    if (screen==TOUCH_CAL && touchDown && calCaptured)
      acceptCalibrationPoint(int(sampleX/sampleCount),int(sampleY/sampleCount));
    calibrationArmed=true;
    touchDown=false; calCaptured=false; sampleCount=0;
    sampleX=sampleY=0; sampleMinX=sampleMinY=4095; sampleMaxX=sampleMaxY=0;
    return;
  }
  releasingTouch=false;
  TS_Point p=touch.getPoint();
  if (touchDiagnostics && millis()-lastTouchDiagnostic>=200) {
    lastTouchDiagnostic=millis();
    Serial.printf("[TOUCH RAW] x=%d y=%d pressure=%d step=%u\n",p.x,p.y,p.z,calStep+1);
  }
  if (p.z<300) return;
#ifdef CONNECTED_DOOR
  if(!cfg.touch.valid && screen!=TOUCH_CAL && connectedSetupTouch(-1,-1))return;
#endif
  if (!touchDown) { touchDown=true; touchStarted=millis(); }
  if (screen==TOUCH_CAL) {
    // Ignore the menu press that entered calibration until it is released.
    if (!calibrationArmed) return;
    if (adminSession) adminActivity=millis();
    if (!calCaptured) {
      sampleMinX=min(sampleMinX,int(p.x)); sampleMaxX=max(sampleMaxX,int(p.x));
      sampleMinY=min(sampleMinY,int(p.y)); sampleMaxY=max(sampleMaxY,int(p.y));
      if (sampleMaxX-sampleMinX>180 || sampleMaxY-sampleMinY>180) {
        sampleCount=0; sampleX=sampleY=0; sampleMinX=sampleMaxX=p.x;
        sampleMinY=sampleMaxY=p.y; touchStarted=millis();
      }
      sampleX+=p.x; sampleY+=p.y; sampleCount++;
      if (sampleCount>=8 && millis()-touchStarted>=140) {
        calCaptured=true; row(35,"Captured - lift finger",GREEN);
      }
    }
    return;
  }
  // One action per touch, after pressure has settled. Release before next key.
  if (calCaptured || millis()-touchStarted<60 || !cfg.touch.valid) return;
  calCaptured=true;
  int x=lroundf(cfg.touch.a*p.x+cfg.touch.b*p.y+cfg.touch.c);
  int y=lroundf(cfg.touch.d*p.x+cfg.touch.e*p.y+cfg.touch.f);
  if (x>=0 && x<240 && y>=0 && y<320) tap(x,y);
}
void serialStatus() {
  MotorState m=snapshot();
  Serial.printf("[STATUS] configured=%d storage=%s motor=%s raw=%d closedLevel=%d released=%d cards=%u fingers=%u heap=%u\n",
    configured(),storageFault?"ERROR":"OK",actuatorReady && !m.fault?"OK":"ERROR",
    m.raw,m.closedLevel,m.door.released,cfg.cardCount,cfg.fingerCount,ESP.getFreeHeap());
}
void setup() {
#ifdef CONNECTED_DOOR
  Serial.setRxBufferSize(8192);
#endif
  Serial.begin(115200);
  uint32_t start=millis(); while (!Serial && millis()-start<1500) delay(10);
  Serial.println("\nSMART DOOR OFFLINE: h=help, s=status, r=retry sensors");
  pinMode(DOOR_PIN,INPUT_PULLUP); pinMode(SERVO_PIN,OUTPUT); digitalWrite(SERVO_PIN,LOW);
  for (int pin : {TFT_CS,TOUCH_CS,RFID_CS}) { pinMode(pin,OUTPUT); digitalWrite(pin,HIGH); }
  SPI.begin(41,21,42);
#if LCD_ILI9341
  tft.begin(20000000);
#else
  tft.init(240,320); tft.setSPISpeed(20000000);
#endif
  tft.setRotation(0); touchReady=touch.begin(SPI); touch.setRotation(0);
  fpSerial.begin(FP_BAUD,SERIAL_8N1,FP_RX,FP_TX);
  loadConfig();
  motor.raw=motor.stable=digitalRead(DOOR_PIN); motor.changedAt=millis();
  motorMutex=xSemaphoreCreateMutex();
  servo.setPeriodHertz(50);
  if (motorMutex) actuatorReady=xTaskCreate(motorTask,"offline-motor",4096,nullptr,2,nullptr)==pdPASS;
  delay(60); applyMotorConfig();
  probeSensors();
  if (storageFault) storageError();
  else if (!touchReady) { go(DEVICE_STATUS); tell("Touch init failed; check wiring"); }
  else if (!cfg.touch.valid) beginCalibration();
  else if (!cfg.admin.valid) { notice="Choose 6 digits, E=save C=clear"; go(SET_ADMIN); }
  else if (!configured()) { notice="Admin PIN to finish setup"; go(ADMIN_LOGIN); }
  else { notice="PIN / card / fingerprint"; go(HOME); }
  serialStatus();
#ifdef CONNECTED_DOOR
  connectedSetup();
#endif
}
void loop() {
#ifdef CONNECTED_DOOR
  connectedPoll();
#endif
  uint32_t now=millis();
  if (pinBlocked && uint32_t(now-blockedSince)>=30000) {
    if (setFailures(0)) { pinBlocked=false; tell("PIN input available"); }
    else storageError();
  }
  if (adminSession && (uint32_t(now-adminActivity)>=ADMIN_IDLE_MS || uint32_t(now-adminStarted)>=ADMIN_MAX_MS)) {
    endAdmin(); tell("Admin session expired");
  }
  if (screen==ENROLL && uint32_t(now-enrollStarted)>=45000) finishEnroll("Enrollment timeout");
#ifndef CONNECTED_DOOR
  while (Serial.available()) {
    char c=Serial.read();
    if (c=='s') serialStatus();
    if (c=='h' || c=='?') Serial.println("s=status r=retry sensors t=touch diagnostics (5s). Use ADMIN + PIN on screen.");
    if (c=='t') { touchDiagnostics=true; touchDiagnosticAt=millis(); }
    if (c=='r') {
      if (screen==ENROLL) tell("Finish/cancel enrollment before retry");
      else { probeSensors(); tell("Sensors retried"); if (screen==DEVICE_STATUS) drawStatus(); }
    }
  }
#endif
  if (touchDiagnostics && millis()-touchDiagnosticAt>=5000) touchDiagnostics=false;
  pollTouch(); pollRfid(); pollFinger();
  if (millis()-lastRefresh>=250 && screen==HOME) {
    lastRefresh=millis(); MotorState m=snapshot(); bool closed=isClosed(m,millis());
    if (lastStateValid && (lastReleased!=m.door.released || lastDoorClosed!=closed)) {
      if (m.door.released) tell(closed?"Released - open door within 5s":"Door open - close after entry");
      else tell(closed?"Door closed - lock commanded":"Door open - check latch");
    }
    lastStateValid=true; lastReleased=m.door.released; lastDoorClosed=closed;
    if (m.fault || !actuatorReady) row(35,"MOTOR ERROR - service required",RED);
    else if (storageFault) row(35,"STORAGE ERROR - access blocked",RED);
    else if (pinBlocked) row(35,"PIN blocked: "+String(30-(millis()-blockedSince)/1000)+"s",RED);
    String state=closed?"Door:CLOSED":"Door:OPEN";
    state+=m.door.released?" | Latch:RELEASE CMD":" | Latch:LOCK CMD";
    row(76,state,closed?GREEN:YELLOW);
    if (DoorLogic::heldOpen(m.door,millis(),closed)) row(35,"DOOR HELD OPEN - please close",RED);
    else if (!m.door.released && !closed) row(35,"DOOR OPEN / check latch",RED);
  }
  delay(2);
}
