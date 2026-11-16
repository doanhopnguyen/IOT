"""Run production enrollment polling/cancellation with ArduinoJson and simulated sensor/transport.

This verifies the firmware state machine, not physical AS608/RC522 behavior.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
network = (root / 'connected_door/network.h').read_text(encoding='utf-8')
finish = network[network.index('void finishRemoteEnroll(bool success,const String &message) {'):network.index('// Dây UART')]
poll_cancel = network[network.index('void pollRemoteEnroll() {'):network.index('void executeMemberRemoval(')]
# Arduino's String(int) constructor is the only platform-specific string operation in these functions.
production = (finish + poll_cancel).replace('String(i)', 'std::to_string(i)')
source = r'''
#include <ArduinoJson.h>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <vector>
using String=std::string;
uint32_t clockMs=1000,remotePollAt=0,remoteStarted=1000,remoteBudget=45000;
uint32_t millis(){return clockMs;}
String remoteEnrollUuid,rfidScanUuid;
uint8_t remoteStage=0;int remoteSlot=5;bool fingerHeld=false,fingerReady=true;
uint8_t bitmap[32]={};
constexpr uint8_t FINGERPRINT_OK=0,FINGERPRINT_NOFINGER=2,FINGERPRINT_PACKETRECIEVEERR=3,FINGERPRINT_TIMEOUT=4,FINGERPRINT_NOTFOUND=5;
struct Preferences {
 std::map<String,String> strings;uint64_t sequence=0;bool fail=false;
 uint64_t getULong64(const char*,uint64_t){return sequence;}
 size_t putULong64(const char*,uint64_t value){if(fail)return 0;sequence=value;return sizeof(value);}
 String getString(const char *key,const char *fallback){auto it=strings.find(key);return it==strings.end()?fallback:it->second;}
 size_t putString(const char *key,const String &value){strings[key]=value;return value.size();}
} eventPrefs;
struct Finger {
 uint8_t image=FINGERPRINT_OK;int stores=0,deletes=0;bool slowModel=false;
 uint8_t getImage(){return image;}
 uint8_t image2Tz(int){return FINGERPRINT_OK;}
 uint8_t fingerFastSearch(){return FINGERPRINT_NOTFOUND;}
 uint8_t createModel(){if(slowModel)clockMs+=45000;return FINGERPRINT_OK;}
 uint8_t storeModel(int slot){++stores;bitmap[slot/8]|=1u<<(slot%8);return FINGERPRINT_OK;}
} finger;
struct Ack {String uuid;bool success;String message;};
std::vector<Ack> acks;
void sendAck(const String &uuid,bool success,const String &message,bool=true,int=0) {
 acks.push_back({uuid,success,message});
 DynamicJsonDocument doc(512);doc["commandUuid"]=uuid;doc["success"]=success;doc["message"]=message;
 String saved;serializeJson(doc,saved);eventPrefs.strings["ack"+std::to_string((acks.size()-1)%16)]=saved;
}
void tell(const String&){}
bool readFingerBitmapRetry(uint8_t *out){memcpy(out,bitmap,32);return true;}
''' + production + r'''
const String target="12345678-1234-4234-8234-123456789abc",cancel="abcdef01-1234-4234-8234-123456789abc";
void seed(){eventPrefs={};finger={};acks.clear();memset(bitmap,0,32);bitmap[1]=1u<<1; // Existing slot 9 must survive every scenario.
 clockMs=1000;remotePollAt=0;remoteStarted=1000;remoteBudget=45000;remoteEnrollUuid="";rfidScanUuid="";remoteStage=0;fingerHeld=false;fingerReady=true;}
void cancelKind(const char *kind,uint64_t sequence=10){DynamicJsonDocument data(512);data["targetCommandUuid"]=target;data["targetType"]=kind;data["targetSequence"]=sequence;cancelRemoteEnrollment(cancel,data.as<JsonObjectConst>());}
void assertCancelled(){assert(acks.back().success && acks.back().message=="ENROLLMENT_CANCELLED");assert(remoteStage==0 && remoteEnrollUuid.empty() && rfidScanUuid.empty());assert(bitmap[1]&(1u<<1));assert(finger.deletes==0);}
int main(){
 // Cancel before either sensor is scanned.
 seed();remoteEnrollUuid=target;remoteStage=1;cancelKind("FP_ENROLL");assertCancelled();pollRemoteEnroll();assert(finger.stores==0);
 seed();rfidScanUuid=target;cancelKind("RFID_SCAN");assertCancelled();
 // Cancel after first fingerprint and after lift, before second capture/store.
 for(int stage:{2,3}){seed();remoteEnrollUuid=target;remoteStage=stage;cancelKind("FP_ENROLL");assertCancelled();pollRemoteEnroll();assert(finger.stores==0);}
 // Completion just before cancel: keep the stored template and report completed separately, even after ACK cache was confirmed.
 seed();remoteEnrollUuid=target;remoteStage=3;pollRemoteEnroll();assert(finger.stores==1 && remoteStage==0);
 for(int i=0;i<16;i++)eventPrefs.strings.erase("ack"+std::to_string(i));
 cancelKind("FP_ENROLL");assert(acks.back().message=="ENROLLMENT_ALREADY_COMPLETED" && acks.back().success);assert(bitmap[0]&(1u<<5));assert(bitmap[1]&(1u<<1));
 // Network loss does not prevent the local deadline from releasing BUSY. No template may be stored on timeout.
 seed();remoteEnrollUuid=target;remoteStage=2;clockMs=46000;pollRemoteEnroll();assert(remoteStage==0 && finger.stores==0 && acks.back().message=="ENROLL_TIMEOUT");
 seed();remoteEnrollUuid=target;remoteStage=3;finger.slowModel=true;pollRemoteEnroll();assert(finger.stores==0 && acks.back().message=="ENROLL_TIMEOUT");
 // Cancel arriving before its start prevents delayed delivery via a durable sequence watermark.
 seed();cancelKind("FP_ENROLL");assertCancelled();assert(eventPrefs.sequence==10);
 // A different active UUID must remain untouched.
 seed();remoteEnrollUuid="another-session";remoteStage=2;cancelKind("FP_ENROLL");assert(remoteStage==2 && remoteEnrollUuid=="another-session");assert(finger.stores==0);
 // No proof after an interrupted sensor commit: report uncertainty rather than claiming success or deleting anything.
 seed();eventPrefs.sequence=10;cancelKind("FP_ENROLL");assert(!acks.back().success && acks.back().message=="ENROLLMENT_OUTCOME_UNKNOWN");assert(finger.deletes==0);
 seed();eventPrefs.fail=true;cancelKind("FP_ENROLL");assert(!acks.back().success && acks.back().message=="STORAGE_ERROR");
 // A stopped/failed session remains cancellable after transport confirmation cleared the ACK cache.
 seed();remoteEnrollUuid=target;remoteStage=1;finishRemoteEnroll(false,"SENSOR_COMMUNICATION_FAILED");eventPrefs.strings.erase("ack0");eventPrefs.sequence=10;cancelKind("FP_ENROLL");assertCancelled();
 // Re-enroll immediately following a confirmed cancel.
 seed();remoteEnrollUuid=target;remoteStage=1;cancelKind("FP_ENROLL");assertCancelled();remoteEnrollUuid="new-session";remoteStage=1;clockMs+=200;pollRemoteEnroll();assert(remoteStage==2);
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
arduino_json = root / '.pio/libdeps/esp32-s3-connected/ArduinoJson/src'
with tempfile.TemporaryDirectory(prefix='enrollment-cancel-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'cancel.cpp', folder / 'cancel.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    '-I', str(arduino_json), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: production enrollment cancellation, samples 1/2, store race, timeout offline, delayed start, wrong UUID, retry and reenrollment (simulated peripherals).')
