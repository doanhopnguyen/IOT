"""Run the actual firmware reset/commit functions against fault-injected storage and sensors."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
network = (root/'connected_door/network.h').read_text(encoding='utf-8')
production = network[network.index('void executeReset('):network.index('void handleBroker(')]
source = r'''
#include <cassert>
#include <cstdint>
#include <map>
#include <string>
#include "servo_setup_logic.h"
using String=std::string;
struct Preferences {
  std::map<String,String> data; String failKey; bool failClear=false;
  size_t putString(String k,String v){if(k==failKey)return 0;data[k]=v;return v.size();}
  size_t putUInt(String k,uint32_t v){if(k==failKey)return 0;data[k]=std::to_string(v);return 4;}
  size_t putBool(String k,bool v){if(k==failKey)return 0;data[k]=v?"1":"0";return 1;}
  String getString(String k,String fallback){return data.count(k)?data[k]:fallback;}
  uint32_t getUInt(String k,uint32_t fallback){return data.count(k)?std::stoul(data[k]):fallback;}
  bool getBool(String k,bool fallback){return data.count(k)?data[k]=="1":fallback;}
  bool clear(){if(failClear)return false;data.clear();return true;}
  bool remove(String k){return data.erase(k)>0;}
} factoryPrefs,nvs,eventPrefs,networkPrefs;
constexpr int FINGERPRINT_OK=0,CONFIG_MAGIC=42,APP_SETUP=1,portMAX_DELAY=0;
struct Finger {
  int templateCount=1;bool fail=false;int erases=0;
  int emptyDatabase(){++erases;if(fail)return 1;templateCount=0;return 0;}
  int getTemplateCount(){return fail?1:0;}
} finger;
struct Servo {int detaches=0;void detach(){++detaches;}} servo;
struct Config {int magic=42,version=2,closedLevel=0,lockAngle=105,openAngle=100;bool credentials=true;} cfg;
struct Motor {bool enabled=true,pending=true,calibrating=true,pulsing=true;} motor;
struct Card {};struct Calibration {};
Card selectedCard;Calibration pendingCal;
bool resetPending=false,adminSession=true,networkPage=true,actuatorReady=true,fingerReady=true,storageFault=false;
bool appPinsReady=true,sensorCycleVerified=true,servoCycleVerified=true,claimed=true;
String resetIntent,resetReceipt,rfidScanUuid="scan",digits="123456",firstPin="654321",notice,wifiSsid="home",wifiPassword="password";
uint32_t generation=1,lastResetAttempt=0;
int remoteStage=1,motorMutex=1,queueHead=1,queueTail=2,droppedEvents=3,enrollStage=1,enrollSlot=2,selectedFinger=2,doorCalClosedSample=1;
ServoSetup::State servoSetup;
String lastAck;bool ackSuccess=false;
uint32_t millis(){return 20000;}
void xSemaphoreTake(int,int){} void xSemaphoreGive(int){}
void probeSensors(){} void go(int){} void tell(const char*){}
void sendAck(const String&,bool success,const char*message,bool=false){ackSuccess=success;lastAck=message;}
'''+production+r'''
const String uuid="12345678-1234-4234-8234-123456789abc";
void seed(){
  factoryPrefs={};nvs={};eventPrefs={};networkPrefs={};finger={};cfg={};motor={};
  nvs.putString("user","PIN/card/touch/servo");eventPrefs.putString("event","old access");
  networkPrefs.putString("ssid","home");networkPrefs.putString("password","password");
  factoryPrefs.putString("config","factory identity");factoryPrefs.putUInt("gen",1);
  resetPending=false;storageFault=false;adminSession=true;appPinsReady=true;sensorCycleVerified=true;servoCycleVerified=true;
  resetIntent="";resetReceipt="";generation=1;lastAck="";ackSuccess=false;claimed=true;
}
int main(){
  seed();executeReset(uuid,99);assert(!resetPending && finger.erases==0 && !nvs.data.empty());
  executeReset("",2);assert(!resetPending && finger.erases==0);
  seed();finger.fail=true;executeReset(uuid,2);
  assert(resetPending && !adminSession && !motor.enabled && !motor.pending && !motor.pulsing && !motor.calibrating);
  assert(!ackSuccess && lastAck=="FINGERPRINT_ERASE_NOT_VERIFIED" && !nvs.data.empty());
  assert(factoryPrefs.getString("resetIntent","")==uuid && resetReceipt.empty());
  // A reboot reloads the persistent intent; repeat the same erase, not a new operation.
  resetIntent=factoryPrefs.getString("resetIntent","");finger.fail=false;executeReset(resetIntent,2);
  assert(ackSuccess && lastAck=="RESET_EMPTY_VERIFIED" && finger.templateCount==0);
  assert(nvs.data.empty() && eventPrefs.data.empty() && !networkPrefs.data.empty());
  assert(!appPinsReady && !sensorCycleVerified && !servoCycleVerified && !adminSession);
  assert(cfg.closedLevel==-1 && cfg.lockAngle==100 && cfg.openAngle==30);
  assert(digits.empty() && firstPin.empty() && queueHead==0 && queueTail==0);
  assert(factoryPrefs.getString("resetAck","")==uuid && factoryPrefs.getString("config","")=="factory identity");
  assert(!finishResetCommit()); // Cannot discard the recovery network before server acknowledgement.
  factoryPrefs.putBool("resetCommit",true);networkPrefs.failClear=true;
  assert(!finishResetCommit() && factoryPrefs.getBool("resetCommit",false));
  networkPrefs.failClear=false;assert(finishResetCommit());
  assert(networkPrefs.data.empty() && generation==2 && !claimed && resetIntent.empty() && resetReceipt.empty());
  assert(wifiSsid.empty() && wifiPassword.empty() && !factoryPrefs.getBool("resetCommit",false));
  assert(factoryPrefs.getString("config","")=="factory identity");
  seed();nvs.failClear=true;executeReset(uuid,2);
  assert(!ackSuccess && resetReceipt.empty() && !nvs.data.empty() && resetPending);
  nvs.failClear=false;executeReset(uuid,2);assert(ackSuccess && nvs.data.empty());
  seed();factoryPrefs.failKey="resetIntent";executeReset(uuid,2);
  assert(storageFault && resetPending && finger.erases==0 && !nvs.data.empty() && !ackSuccess);
  seed();resetIntent=uuid;executeReset("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",2);
  assert(lastAck=="RESET_ALREADY_RUNNING" && finger.erases==0);
}
'''
compiler=shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='factory-reset-') as folder:
    folder=Path(folder); cpp=folder/'reset.cpp'; exe=folder/'reset.exe'
    cpp.write_text(source,encoding='utf-8')
    subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-static-libgcc','-static-libstdc++',
                    '-I',str(root/'include'),str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('PASS: production factory-reset functions; erase verification, sensor/storage failure, persistent resume, servo stopped, network commit and factory identity preserved')
