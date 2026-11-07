"""Exercise the production member-removal function with real ArduinoJson and fake sensor/storage."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
network = (root / 'connected_door/network.h').read_text(encoding='utf-8')
production = network[network.index('void executeMemberRemoval('):network.index('void executeReset(')]
source = r'''
#include <ArduinoJson.h>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <string>
#include <cstdio>
#include "credential_cleanup.h"
using String=std::string;
struct Card {uint8_t size,bytes[10];};
struct Config {uint8_t cardCount=0,fingerCount=0;Card cards[32];uint16_t fingers[32]={};} cfg;
bool resetPending=false,fingerReady=true,storageFailure=false,sensorFailure=false,deleteFailure=false,lieAboutErase=false;
int remoteStage=0,saves=0,deletes=0;String rfidScanUuid,lastAck;bool ack=false;
uint8_t bitmap[32]={};
struct Preferences {uint64_t sequence=0;bool fail=false;
 uint64_t getULong64(const char*,uint64_t){return sequence;}
 size_t putULong64(const char*,uint64_t value){if(fail)return 0;sequence=value;return 8;}
} eventPrefs;
struct Finger {int deleteModel(uint16_t slot){++deletes;if(deleteFailure)return 1;if(!lieAboutErase)bitmap[slot/8]&=~(1u<<(slot%8));return 0;}} finger;
constexpr int FINGERPRINT_OK=0;
void probeSensors(){}
bool readFingerBitmapRetry(uint8_t *out){if(sensorFailure)return false;memcpy(out,bitmap,32);return true;}
bool saveConfig(const Config &next){++saves;if(storageFailure)return false;cfg=next;return true;}
String cardName(const Card &card){String out;char byte[3];for(int i=0;i<card.size;i++){snprintf(byte,3,"%02X",card.bytes[i]);out+=byte;}return out;}
void sendAck(const String&,bool value,const char *message,bool){ack=value;lastAck=message;}
'''+production+r'''
const String uuid="12345678-1234-4234-8234-123456789abc";
void seed(){cfg={};bitmap[0]=(1u<<5)|(1u<<6);eventPrefs={};storageFailure=sensorFailure=deleteFailure=lieAboutErase=false;
 fingerReady=true;resetPending=false;remoteStage=0;rfidScanUuid="";saves=deletes=0;ack=false;lastAck="";
 cfg.fingerCount=2;cfg.fingers[0]=5;cfg.fingers[1]=6;cfg.cardCount=2;
 cfg.cards[0].size=4;memset(cfg.cards[0].bytes,0x11,4);cfg.cards[1].size=4;memset(cfg.cards[1].bytes,0x22,4);
}
int main(){
 DynamicJsonDocument doc(1024);doc["removalSequence"]=10;doc.createNestedArray("fingerprints").add(5);doc.createNestedArray("rfid").add("11111111");doc.createNestedArray("preserveFingerprints").add(6);doc["purgeFingerprints"]=true;
 seed();executeMemberRemoval(uuid,doc.as<JsonObjectConst>());
 assert(ack && lastAck=="MEMBER_CREDENTIALS_REMOVED" && eventPrefs.sequence==10 && deletes==1);
 assert(cfg.fingerCount==1 && cfg.fingers[0]==6 && cfg.cardCount==1 && cardName(cfg.cards[0])=="22222222");
 assert(!(bitmap[0]&(1u<<5)) && (bitmap[0]&(1u<<6)));
 // ACK confirmation may have removed the normal ACK cache. A delayed config must not erase a reused slot.
 bitmap[0]|=1u<<5;cfg.fingers[cfg.fingerCount++]=5;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());
 assert(ack && deletes==1 && cfg.fingerCount==2 && (bitmap[0]&(1u<<5)));
 seed();deleteFailure=true;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());
 assert(!ack && eventPrefs.sequence==0 && lastAck=="FINGERPRINT_ERASE_NOT_VERIFIED");
 assert(cfg.fingerCount==1 && cfg.fingers[0]==6); // Denied in the allowlist before sensor failure.
 deleteFailure=false;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(ack && eventPrefs.sequence==10);
 seed();lieAboutErase=true;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(!ack && eventPrefs.sequence==0);
 seed();sensorFailure=true;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(!ack && eventPrefs.sequence==0);
 seed();storageFailure=true;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(!ack && deletes==0 && eventPrefs.sequence==0);
 seed();eventPrefs.fail=true;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(!ack && eventPrefs.sequence==0);
 eventPrefs.fail=false;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(ack && deletes==1);
 seed();remoteStage=1;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(!ack && saves==0 && deletes==0);
 seed();doc["fingerprints"][0]=0;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());assert(!ack && saves==0 && deletes==0);
 seed();doc["fingerprints"].as<JsonArray>().clear();doc["purgeFingerprints"]=false;doc["preserveFingerprints"].as<JsonArray>().add(5);fingerReady=false;sensorFailure=true;executeMemberRemoval(uuid,doc.as<JsonObjectConst>());
 assert(ack && cfg.cardCount==1 && cfg.fingerCount==2 && deletes==0); // RFID-only removal needs no fingerprint sensor.
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
arduino_json = root / '.pio/libdeps/esp32-s3-connected/ArduinoJson/src'
if not arduino_json.is_dir():
    raise SystemExit('Build platformio.connected.ini first to install ArduinoJson.')
with tempfile.TemporaryDirectory(prefix='member-removal-') as directory:
    directory = Path(directory)
    cpp, executable = directory/'cleanup.cpp', directory/'cleanup.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    '-I', str(root/'include'), '-I', str(arduino_json), str(cpp), '-o', str(executable)], check=True)
    subprocess.run([str(executable)], check=True)
print('PASS: actual member removal; allowlist pruning, sensor erase/readback, storage faults, retry and durable duplicate protection')
