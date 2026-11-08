"""Exercise actual PIN failure handling and alarm GPIO polling with fake hardware."""
from pathlib import Path
import shutil,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
sketch=(ROOT/'offline_door/offline_door.ino').read_text(encoding='utf-8')
def section(start,end):return start+sketch.split(start,1)[1].split(end,1)[0]
failure=section('bool setFailures(uint8_t count)', 'int cardIndex(')
poll=section('void pollDoorAlarm()', 'void serialStatus()')
network=(ROOT/'connected_door/network.h').read_text(encoding='utf-8')
response='const char *applyPinAlertResponse('+network.split('const char *applyPinAlertResponse(',1)[1].split('void saveOwners(',1)[0]
source=r'''
#include <cassert>
#include <cstdint>
#include <cstddef>
#include <map>
#include <string>
#include <initializer_list>
#include "door_alarm.h"
#include "door_restriction.h"
#include <cstring>
#define CONNECTED_DOOR 1
constexpr int HIGH=1,LOW=0,BUZZER_GPIO=5;
enum Screen{HOME,TOUCH_CAL,DOOR_CAL,SERVO_CAL};Screen screen=HOME;
unsigned clockNow=100,blockedSince=0,writes=0;int output=0;
bool ready=true,updating=false,storageFault=false,pinBlocked=false,buzzerHigh=false;
uint8_t failedPins=0,pinFailureLimit=5;
DoorAlarm::State doorAlarm;
struct Store {
 std::map<std::string,uint8_t> values;std::map<std::string,uint64_t> sequences;bool fail=false,lie=false;unsigned puts=0;
 uint64_t getULong64(const char *key,uint64_t fallback){auto p=sequences.find(key);return p==sequences.end()?fallback:p->second;}
 size_t putULong64(const char *key,uint64_t value){if(fail)return 0;if(!lie)sequences[key]=value;return sizeof(value);}
 uint8_t getUChar(const char *key,uint8_t fallback){auto p=values.find(key);return p==values.end()?fallback:p->second;}
 size_t putUChar(const char *key,uint8_t value){++puts;if(fail)return 0;if(!lie)values[key]=value;return 1;}
} nvs;
struct MotorState{int raw=0,stable=0,closedLevel=0;uint32_t changedAt=0,heldOpenMs=10000;bool calibrating=false,previewing=false;} motor;
MotorState snapshot(){return motor;}
uint32_t millis(){return clockNow;}
bool configured(){return ready;}
bool connectedAccessReady(){return ready && !storageFault;}
bool connectedUpdating(){return updating;}
bool isClosed(const MotorState &m,uint32_t now){return m.closedLevel>=0 && m.raw==m.stable && m.stable==m.closedLevel && uint32_t(now-m.changedAt)>=40;}
void digitalWrite(int pin,int value){assert(pin==5);output=value;++writes;}
void storageError(){storageFault=true;pinBlocked=false;}
void tell(const char *){}
struct SerialFake{template<class... Args> void printf(const char *,Args...){}} Serial;
''' + failure + poll + r'''
DoorRestriction::Mode restriction=DoorRestriction::NORMAL;
void clearPinEntry(){} void drawDigits(){}
void setRestriction(DoorRestriction::Mode mode){restriction=mode;if(nvs.putUChar("restrict",mode)!=1)storageFault=true;}
''' + response + r'''
void seed(){clockNow=100;blockedSince=0;ready=true;updating=storageFault=pinBlocked=buzzerHigh=false;failedPins=0;pinFailureLimit=5;
 doorAlarm={};motor={};nvs={};screen=HOME;output=0;writes=0;restriction=DoorRestriction::NORMAL;}
void open(){motor.raw=motor.stable=1;motor.changedAt=clockNow-40;}
int main(){
 // Settings survive reboot, avoid repeated flash writes and reject failed persistence.
 seed();assert(DoorAlarm::loadPinLimit(nvs)==5);
 for(int limit:{1,3,5,10}){assert(DoorAlarm::savePinLimit(nvs,limit));assert(DoorAlarm::loadPinLimit(nvs)==limit);
  unsigned before=nvs.puts;assert(DoorAlarm::savePinLimit(nvs,limit));assert(nvs.puts==before);}
 for(int bad:{-1,0,11,255})assert(!DoorAlarm::savePinLimit(nvs,bad));
 nvs.values["pinLimit"]=255;assert(DoorAlarm::loadPinLimit(nvs)==5);
 nvs.fail=true;assert(!DoorAlarm::savePinLimit(nvs,3));nvs.fail=false;nvs.lie=true;assert(!DoorAlarm::savePinLimit(nvs,3));
 // Real denyPin() reaches exactly the chosen limit and drives the shared GPIO poll.
 for(uint8_t limit:{uint8_t(1),uint8_t(3),uint8_t(5),uint8_t(10)}){
  seed();pinFailureLimit=limit;
  for(uint8_t i=1;i<=limit;i++){denyPin();pollDoorAlarm();assert(pinBlocked==(i==limit));assert(bool(output)==(i==limit));}
  assert(doorAlarm.reason==DoorAlarm::WRONG_PIN);
  unsigned start=clockNow;clockNow=start+150;pollDoorAlarm();assert(!output);
  clockNow=start+300;pollDoorAlarm();assert(output);clockNow=start+450;pollDoorAlarm();assert(!output);
  clockNow=start+29999;expirePinLockout(clockNow);assert(pinBlocked);
  clockNow=start+30000;expirePinLockout(clockNow);pollDoorAlarm();assert(!pinBlocked && !failedPins && !output && doorAlarm.reason==0);
 }
 // Wrong PIN below threshold, then a valid PIN, must not accumulate to a false alarm.
 seed();for(int i=0;i<4;i++)denyPin();assert(setFailures(0));denyPin();pollDoorAlarm();assert(!output && failedPins==1);
 // Physical open is tracked even without any unlock command (forced-open or boot-open).
 seed();open();pollDoorAlarm();clockNow+=9999;pollDoorAlarm();assert(!output);
 ++clockNow;pollDoorAlarm();assert(output && doorAlarm.reason==DoorAlarm::DOOR_OPEN);
 clockNow+=300;pollDoorAlarm();assert(!output);clockNow+=1200;pollDoorAlarm();assert(output);
 motor.raw=motor.stable=0;motor.changedAt=clockNow-40;pollDoorAlarm();assert(!output && !doorAlarm.trackingOpen);
 open();pollDoorAlarm();clockNow+=9999;pollDoorAlarm();assert(!output);++clockNow;pollDoorAlarm();assert(output);
 // Live timeout changes use elapsed physical open time, not the last screen redraw.
 motor.heldOpenMs=60000;pollDoorAlarm();assert(!output);clockNow+=50000;pollDoorAlarm();assert(output);
 // Closing a door cannot silence a concurrent PIN alarm.
 pinBlocked=true;blockedSince=clockNow;pollDoorAlarm();assert(doorAlarm.reason==3 && output);
 motor.raw=motor.stable=0;pollDoorAlarm();assert(doorAlarm.reason==DoorAlarm::WRONG_PIN && output);
 // No alarm in unclaimed/setup, OTA, calibration, or a storage failure.
 for(int gate=0;gate<6;gate++){
  seed();pinBlocked=true;open();
  if(gate==0)ready=false;if(gate==1)updating=true;if(gate==2)storageFault=true;
  if(gate==3)screen=DOOR_CAL;if(gate==4)motor.calibrating=true;if(gate==5)motor.previewing=true;
  pollDoorAlarm();clockNow+=600000;pollDoorAlarm();assert(!output && doorAlarm.reason==0);
 }
 // Unknown/bouncing reed readings never start an open alarm.
 seed();motor.raw=1;motor.stable=0;pollDoorAlarm();clockNow+=600000;pollDoorAlarm();assert(!output);
 // millis rollover does not bypass the timeout or lockout.
 seed();clockNow=0xfffffff0u;open();pollDoorAlarm();clockNow+=10000;pollDoorAlarm();assert(output);
 seed();clockNow=0xfffffff0u;for(int i=0;i<5;i++)denyPin();clockNow+=30000;expirePinLockout(clockNow);pollDoorAlarm();assert(!pinBlocked && !output);
 seed();nvs.fail=true;denyPin();pollDoorAlarm();assert(storageFault && !output);
 // SAFE releases the timed PIN block, persists a clean counter and never enables lockdown.
 seed();for(int i=0;i<5;i++)denyPin();pollDoorAlarm();assert(output && pinBlocked);
 assert(!strcmp(applyPinAlertResponse(false,10),"PIN_ALERT_SAFE_APPLIED"));
 assert(!output && !buzzerHigh && !pinBlocked && failedPins==0 && nvs.getUChar("badpin",255)==0);
 assert(restriction==DoorRestriction::NORMAL && DoorRestriction::allowLocal(restriction,false));
 assert(!strcmp(applyPinAlertResponse(false,9),"STALE_PIN_RESPONSE"));
 for(int i=0;i<5;i++)denyPin();pollDoorAlarm();assert(output && pinBlocked); // New incident is audible.
 assert(!strcmp(applyPinAlertResponse(true,11),"PIN_ALERT_LOCKDOWN_APPLIED"));
 assert(!output && !pinBlocked && !failedPins && restriction==DoorRestriction::LOCKDOWN);
 assert(!DoorRestriction::allowLocal(restriction,false) && DoorRestriction::allowLocal(restriction,true));
 assert(DoorRestriction::decode(nvs.getUChar("restrict",0))==DoorRestriction::LOCKDOWN); // Reboot keeps lockdown.
 assert(!strcmp(applyPinAlertResponse(false,12),"PIN_ALERT_ALREADY_LOCKED"));
 // Both actions also silence the currently sounding open-door alarm, until it closes.
 seed();open();pollDoorAlarm();clockNow+=10000;for(int i=0;i<5;i++)denyPin();pollDoorAlarm();assert(output && doorAlarm.reason==3);
 assert(!strcmp(applyPinAlertResponse(false,1),"PIN_ALERT_SAFE_APPLIED"));
 clockNow+=6000;pollDoorAlarm();assert(!output && doorAlarm.reason==DoorAlarm::DOOR_OPEN);
 motor.raw=0;pollDoorAlarm();motor.raw=1;pollDoorAlarm();assert(!output); // Reed bounce cannot restart a silenced incident.
 motor.raw=motor.stable=0;pollDoorAlarm();open();pollDoorAlarm();clockNow+=10000;pollDoorAlarm();assert(output);
 // No acknowledgement on failed writes/readback, no silent enabling of a suspended door.
 seed();for(int i=0;i<5;i++)denyPin();nvs.fail=true;
 assert(!strcmp(applyPinAlertResponse(false,1),"STORAGE_ERROR") && pinBlocked && storageFault);
 seed();nvs.lie=true;assert(!strcmp(applyPinAlertResponse(false,1),"STORAGE_ERROR"));
 seed();restriction=DoorRestriction::SUSPENDED;assert(!strcmp(applyPinAlertResponse(false,1),"DEVICE_SUSPENDED"));
 seed();ready=false;assert(!strcmp(applyPinAlertResponse(true,1),"NOT_READY"));

}
'''
compiler=shutil.which('g++')
if not compiler:raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='door-alarm-') as folder:
 folder=Path(folder);cpp=folder/'test.cpp';exe=folder/'test.exe';cpp.write_text(source,encoding='utf-8')
 subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-static-libgcc','-static-libstdc++','-I',str(ROOT/'include'),str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('PASS: production PIN alert SAFE/LOCKDOWN responses, mute/rearm, persistence/stale/write failures + GPIO5 alarm, open/close and live thresholds, persistence/faults/setup/OTA/rollover')
