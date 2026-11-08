"""Run the actual connected setup completion against NVS and motor stubs."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
network = (root / 'connected_door/network.h').read_text(encoding='utf-8')
start = network.index('bool connectedCompleteDoorSetup() {')
end = network.index('bool connectedContinueSetup()', start)
function = network[start:end]
source = r'''
#include <cassert>
#include <string>
struct Pin { bool valid=true; };
struct Config { Pin admin,user,touch; int closedLevel=0,lockAngle=203,openAngle=179,servoRange=360; } cfg;
bool claimed=true,appPinsReady=true,resetPending=false,storageFault=false;
bool sensorCycleVerified=true,servoCycleVerified=false,adminSession=true;
int configuredCount=0,homeCount=0,errorCount=0;
const int HOME=1;
struct Preferences {
  bool value=false,failWrite=false,failRead=false; int writes=0;
  int putBool(const char *key,bool next){assert(std::string(key)=="servoVerified");writes++;if(failWrite)return 0;value=next;return 1;}
  bool getBool(const char *,bool){return failRead?false:value;}
} nvs;
void storageError(){storageFault=true;errorCount++;}
void applyMotorConfig(){configuredCount++;}
void go(int screen){assert(screen==HOME);homeCount++;}
''' + function + r'''
void reset(){cfg=Config{};claimed=appPinsReady=sensorCycleVerified=adminSession=true;
 resetPending=storageFault=servoCycleVerified=false;nvs=Preferences{};configuredCount=homeCount=errorCount=0;}
int main(){
 reset();assert(connectedCompleteDoorSetup());assert(servoCycleVerified && nvs.value);
 assert(nvs.writes==1 && configuredCount==1 && homeCount==1 && !adminSession);
 assert(cfg.lockAngle==203 && cfg.openAngle==179 && cfg.servoRange==360);
 assert(connectedCompleteDoorSetup());assert(nvs.writes==1 && configuredCount==1);
 for(int mode=0;mode<2;mode++){reset();nvs.failWrite=mode==0;nvs.failRead=mode==1;
  assert(connectedCompleteDoorSetup());assert(!servoCycleVerified && storageFault);
  assert(errorCount==1 && configuredCount==0 && homeCount==0);}
 for(int gate=0;gate<8;gate++){reset();
  if(gate==0)claimed=false;if(gate==1)appPinsReady=false;if(gate==2)resetPending=true;
  if(gate==3)cfg.touch.valid=false;if(gate==4)sensorCycleVerified=false;
  if(gate==5)cfg.closedLevel=-1;if(gate==6)cfg.admin.valid=false;if(gate==7)cfg.user.valid=false;
  assert(!connectedCompleteDoorSetup());assert(nvs.writes==0 && configuredCount==0 && homeCount==0);}
 reset();storageFault=true;assert(!connectedCompleteDoorSetup());assert(nvs.writes==0);
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='servo-default-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'test.cpp', folder / 'test.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation',
                    '-static-libgcc', '-static-libstdc++', str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: onboarding persists saved/default servo settings without commanding movement; NVS failures and setup gates stay blocked')
