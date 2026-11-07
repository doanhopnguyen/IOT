"""Exercise production keypad input and PIN submission with fake hardware.

Run: python firmware/tests/test_physical_keypad.py (requires g++).
No real PIN, USB device or servo command is used.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SKETCH = (ROOT / "offline_door/offline_door.ino").read_text(encoding="utf-8")
NETWORK = (ROOT / "connected_door/network.h").read_text(encoding="utf-8")


def section(text, start, end):
    return start + text.split(start, 1)[1].split(end, 1)[0]


clear = section(SKETCH, "void clearPinEntry() {", "void go(")
deny = section(SKETCH, "void denyPin() {", "int cardIndex(")
grant = section(SKETCH, "bool grant(const char *method) {", "void chooseDeleteCard(")
submit = section(SKETCH, "void submitPin() {", "// Both input devices")
input_handlers = section(SKETCH, "void handlePinKey(", "bool readFingerBitmap(")
policy = section(NETWORK, "bool connectedAllowsPin()", "// Chặn cả lệnh mở")
restriction_notice = section(NETWORK, "const char *connectedRestrictionNotice()", "void setRestriction(")
restriction_update = section(NETWORK, "void setRestriction(", "bool connectedAllowsCard(")

harness = r'''
#include <cassert>
#include <cstdint>
#include <string>
#include <vector>
#include "door_restriction.h"
#define CONNECTED_DOOR 1
using String=std::string;
constexpr uint32_t KEYPAD_IDLE_MS=15000;
constexpr int LIST_MAX=10;
constexpr char NO_KEY='\0';
enum KeyState {IDLE,PRESSED,HOLD,RELEASED};
struct Key {
  char kchar;KeyState kstate;bool stateChanged;
  Key(char c=NO_KEY,KeyState state=IDLE,bool changed=false):kchar(c),kstate(state),stateChanged(changed){}
};
struct KeypadFake {
  Key key[LIST_MAX];bool changed=false;
  bool getKeys(){bool out=changed;changed=false;return out;}
} insideKeypad;
enum Screen {HOME,ADMIN_LOGIN,SET_ADMIN,CONFIRM_ADMIN,SET_USER,CONFIRM_USER,MENU,APP_SETUP,DEVICE_STATUS,SERVO_CAL};
Screen screen=HOME;
String digits,firstPin,notice;
bool physicalPinInput=false,keypadReleaseRequired=true;
uint32_t lastPhysicalKey=0,clockNow=1000,blockedSince=0,adminStarted=0,adminActivity=0,lastStatusBarDraw=0;
uint32_t millis(){return clockNow;}
bool ready=true,resetting=false,storageFault=false,pinBlocked=false,motorReady=true;
bool adminSession=false,pinAccessEnabled=true;
unsigned failedPins=0,openCalls=0,opened=0,adminTransitions=0;
DoorRestriction::Mode restriction=DoorRestriction::NORMAL;
bool configured(){return ready;}
bool connectedAccessReady(){return ready && !resetting && !storageFault;}
struct SerialFake {template<class... T> void printf(const char *,T...) {}} Serial;
struct PinSecret {String pin;};
struct Config {PinSecret user,admin;} cfg{{"123456"},{"987654"}};
bool pinMatches(const PinSecret &secret,const String &pin){return secret.pin==pin;}
PinSecret makePin(const String &pin){return {pin};}
bool saveConfig(Config next){cfg=next;return true;}
bool setFailures(unsigned count){if(storageFault)return false;failedPins=count;return true;}
void tell(const String &value){notice=value;}
void row(int,const String &){}
void drawDigits(){}
void storageError(){storageFault=true;screen=DEVICE_STATUS;}
void continueSetup(){++adminTransitions;}
void go(Screen next){screen=next;digits="";}
bool requestOpen(){++openCalls;if(!motorReady || !ready || storageFault)return false;++opened;return true;}
struct Event {String method;bool granted;};
std::vector<Event> events;
void connectedRecord(const char *method,bool granted,const char *,int){events.push_back({method,granted});}
struct Nvs {
  bool has=false,value=true,writeFail=false,readFail=false;unsigned writes=0;
  bool isKey(const char *){return has;}
  unsigned putBool(const char *,bool next){++writes;if(writeFail)return 0;has=true;value=next;return 1;}
  unsigned putUChar(const char *,uint8_t){return writeFail?0:1;}
  bool getBool(const char *,bool fallback){return !has || readFail?fallback:value;}
} nvs;
''' + clear + restriction_notice + restriction_update + policy + deny + grant + submit + input_handlers + r'''
void seed(){
  screen=HOME;digits=firstPin=notice="";physicalPinInput=false;lastPhysicalKey=0;
  keypadReleaseRequired=false;insideKeypad=KeypadFake{};clockNow=1000;
  ready=true;resetting=storageFault=pinBlocked=adminSession=false;motorReady=true;
  pinAccessEnabled=true;restriction=DoorRestriction::NORMAL;
  failedPins=openCalls=opened=adminTransitions=0;events.clear();nvs=Nvs{};
}
void enter(const char *value,bool physical=true){for(const char *p=value;*p;++p)handlePinKey(*p,physical);}
void press(char c){insideKeypad.key[0]={c,PRESSED,true};insideKeypad.changed=true;pollPhysicalKeypad();}
void release(){insideKeypad=KeypadFake{};insideKeypad.changed=true;pollPhysicalKeypad();}
int main(){
  seed();enter("123456");assert(opened==0);enter("#");
  assert(opened==1 && events.size()==1 && events[0].method=="PIN" && events[0].granted);
  assert(digits.empty());

  // Physical keypad only accepts the door PIN; admin PIN cannot open or enter menus.
  seed();enter("987654#");assert(!opened && !adminSession && !adminTransitions && failedPins==1);
  for(Screen page:{ADMIN_LOGIN,SET_ADMIN,CONFIRM_ADMIN,SET_USER,CONFIRM_USER,MENU,APP_SETUP,DEVICE_STATUS,SERVO_CAL}){
    seed();screen=page;enter("123456#");assert(!opened && digits.empty() && !adminSession && events.empty());
  }
  seed();screen=ADMIN_LOGIN;enter("987654#",false);assert(adminSession && adminTransitions==1 && !opened);

  // Editing, explicit submit, maximum length, unsupported keys and shared failure limit.
  seed();enter("12ABCD");assert(digits=="12");enter("*");assert(digits.empty());
  enter("123#");assert(!opened && failedPins==0 && digits=="123");
  enter("4567");assert(digits=="123456");enter("#");assert(opened==1);
  seed();for(int i=0;i<5;i++)enter("111111#",i%2==0);
  assert(pinBlocked && failedPins==5 && events.size()==5);
  enter("123456#");assert(!opened && events.size()==5 && failedPins==5 && digits.empty());

  // Never combine a partial PIN from inside and outside.
  seed();enter("123",false);enter("456");assert(digits=="456");enter("#");assert(!opened && failedPins==0);
  seed();enter("123");enter("456",false);assert(digits=="456");enter("#",false);assert(!opened && failedPins==0);

  // Expiry works at the boundary and across millis() rollover.
  seed();enter("123");clockNow+=KEYPAD_IDLE_MS-1;pollPhysicalKeypad();assert(digits=="123");
  ++clockNow;pollPhysicalKeypad();assert(digits.empty());enter("456#");assert(!opened);
  seed();clockNow=0xfffffff0u;enter("123");clockNow+=KEYPAD_IDLE_MS;pollPhysicalKeypad();assert(digits.empty());
  seed();enter("123");screen=MENU;pollPhysicalKeypad();assert(digits.empty());

  // Offline setup gates, PIN disable, restrictions and actuator/storage failures remain effective.
  seed();ready=false;enter("123456#");assert(!openCalls && events.empty());
  seed();resetting=true;enter("123456#");assert(!openCalls && events.empty());
  for(auto mode:{DoorRestriction::LOCKDOWN,DoorRestriction::SUSPENDED,DoorRestriction::RETIRED}){
    seed();restriction=mode;enter("123456#");assert(!openCalls && !failedPins && events.empty());
    enter("111111#");assert(!failedPins && events.empty());
  }
  seed();pinAccessEnabled=false;enter("123456#");assert(!openCalls && !failedPins && events.empty());
  seed();motorReady=false;enter("123456#");assert(openCalls==1 && !opened && events.empty());
  seed();storageFault=true;enter("123456#");assert(!openCalls && events.empty());
  seed();enter("123");setRestriction(DoorRestriction::LOCKDOWN);assert(digits.empty() && !connectedAllowsPin());
  setRestriction(DoorRestriction::NORMAL);assert(connectedAllowsPin() && digits.empty());
  seed();nvs.writeFail=true;setRestriction(DoorRestriction::SUSPENDED);assert(storageFault && digits.empty());

  // Held keys never repeat, multiple-key chords discard entry until every key is released.
  seed();press('1');assert(digits=="1");pollPhysicalKeypad();assert(digits=="1");
  insideKeypad.key[0].kstate=HOLD;insideKeypad.changed=true;pollPhysicalKeypad();assert(digits=="1");
  insideKeypad.key[1]={'2',PRESSED,true};insideKeypad.changed=true;pollPhysicalKeypad();assert(digits.empty());
  insideKeypad.key[1]=Key{};insideKeypad.changed=true;pollPhysicalKeypad();assert(digits.empty());
  release();press('3');assert(digits=="3");
  seed();screen=MENU;press('1');screen=HOME;pollPhysicalKeypad();assert(digits.empty());
  release();press('2');assert(digits=="2");

  // Saving pinEnabled is durable, avoids repeated writes and fails closed on NVS errors.
  seed();enter("123");assert(savePinAccess(false));assert(!pinAccessEnabled && digits.empty());
  assert(nvs.has && !nvs.value);assert(savePinAccess(false) && nvs.writes==1);
  pinAccessEnabled=true;loadPinAccess();assert(!pinAccessEnabled && !connectedAllowsPin());
  assert(savePinAccess(true) && pinAccessEnabled && nvs.value);
  pinAccessEnabled=false;loadPinAccess();assert(pinAccessEnabled);
  seed();pinAccessEnabled=false;loadPinAccess();assert(pinAccessEnabled); // Existing doors before this NVS key.
  seed();nvs.has=true;nvs.value=true;nvs.readFail=true;loadPinAccess();assert(!pinAccessEnabled);
  seed();nvs.writeFail=true;assert(!savePinAccess(false) && storageFault && !connectedAccessReady());
  seed();nvs.readFail=true;assert(!savePinAccess(false) && storageFault && !connectedAccessReady());
}
'''

compiler = shutil.which("g++")
if not compiler:
    raise SystemExit("g++ is required")
with tempfile.TemporaryDirectory(prefix="physical-keypad-") as folder:
    folder = Path(folder)
    cpp, exe = folder / "test.cpp", folder / "test.exe"
    cpp.write_text(harness, encoding="utf-8")
    subprocess.run([compiler, "-std=c++11", "-Wall", "-Wextra", "-Werror", "-static-libgcc", "-static-libstdc++",
                    "-I", str(ROOT / "include"), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("PASS: physical keypad, shared PIN/lockout/audit, source isolation, timeout, held/chord keys, policies and NVS")
