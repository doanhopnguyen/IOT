"""Exercise the production onboarding state policy; no ESP32 or network writes."""
from pathlib import Path
import shutil, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
source=r'''
#include <assert.h>
#include <string.h>
#include "setup_logic.h"
#include "servo_setup_logic.h"
using namespace SetupLogic;
int main(){
  assert(!strcmp(stage(false,false,false,false,false,false,false,0,false,false),"WIFI"));
  assert(!strcmp(stage(false,true,false,false,false,false,false,0,false,false),"SERVICE"));
  assert(!strcmp(stage(false,true,true,false,false,false,false,0,false,false),"CLAIM"));
  assert(!strcmp(stage(false,true,true,true,false,false,false,0,false,false),"PINS"));
  for(unsigned i=0;i<4;i++){const char *expected[]={"TOUCH_1","TOUCH_2","TOUCH_3","TOUCH_4"};
    assert(!strcmp(stage(false,true,true,true,true,false,false,i,false,false),expected[i]));}
  assert(!strcmp(stage(false,true,true,true,true,true,false,3,false,false),"DOOR_CLOSED"));
  assert(!strcmp(stage(false,true,true,true,true,true,false,3,true,false),"DOOR_OPEN"));
  assert(!strcmp(stage(false,true,true,true,true,true,true,3,true,false),"READY"));
  assert(!strcmp(stage(true,true,true,true,true,true,true,3,true,false),"RESETTING"));
  assert(!strcmp(stage(false,true,true,true,true,true,true,3,true,false,false,false),"SERVO_LOCK"));
  assert(!strcmp(stage(false,true,true,true,true,true,true,3,true,false,false,true),"SERVO_OPEN"));
  assert(localAccessAllowed(true,true,true,false)); // No Wi-Fi/broker input: offline auth stays local.
  assert(!localAccessAllowed(false,true,true,false));assert(!localAccessAllowed(true,false,true,false));
  assert(!localAccessAllowed(true,true,false,false));assert(!localAccessAllowed(true,true,true,true));
  assert(signalBars(-40)==4 && signalBars(-60)==3 && signalBars(-70)==2 && signalBars(-80)==1 && signalBars(-95)==0);
  ServoSetup::State servo;
  servo.lockAngle=105;servo.openAngle=100;
  assert(!ServoSetup::canConfirm(servo,105,false,false,true)); // A draft alone is not a test.
  servo.tested=true;
  assert(!ServoSetup::canConfirm(servo,105,true,false,true));
  assert(!ServoSetup::canConfirm(servo,105,false,true,true));
  assert(!ServoSetup::canConfirm(servo,105,false,false,true,true)); // Servo driver failure.
  assert(!ServoSetup::canConfirm(servo,105,false,false,true,false,false)); // Canceled queued test is not evidence.
  assert(!ServoSetup::canConfirm(servo,105,false,false,false)); // LOCK requires a closed leaf.
  assert(ServoSetup::canConfirm(servo,105,false,false,true));
  ServoSetup::adjust(servo,-5);assert(servo.lockAngle==100 && !servo.tested);
  servo.step=1;servo.tested=true;
  assert(ServoSetup::canConfirm(servo,100,false,false,false)); // OPEN may be checked with the leaf open.
  assert(!strcmp(ServoSetup::direction(105,100),"DECREASE"));
  assert(!strcmp(ServoSetup::direction(100,105),"INCREASE"));
  assert(!strcmp(ServoSetup::direction(100,100),"HOLD"));
  assert(!strcmp(ServoSetup::direction(-1,100),"UNKNOWN"));
  assert(wifiAllowed(false,0,100)); // Initial provisioning only selects Wi-Fi.
  assert(!wifiAllowed(true,0,100)); // An owned door requires owner authorization.
  assert(wifiAllowed(true,200,100));assert(!wifiAllowed(true,200,200));
  assert(wifiAllowed(true,20,0xfffffff0u));assert(!wifiAllowed(true,20,21));
  assert(!wifiAttemptExpired(100,35100,false));assert(wifiAttemptExpired(100,35101,false));
  assert(!wifiAttemptExpired(100,60000,true));assert(!wifiAttemptExpired(0,60000,false));
  assert(wifiAttemptExpired(0xfffffff0u,uint32_t(0xfffffff0u+35001u),false));
}
'''
compiler=shutil.which('g++')
if not compiler: raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='setup-flow-') as folder:
    folder=Path(folder); cpp=folder/'test.cpp'; exe=folder/'test.exe';cpp.write_text(source)
    subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-static-libgcc','-static-libstdc++','-I',str(root/'connected_door'),'-I',str(root/'include'),str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('PASS: offline access policy, Wi-Fi bars/recovery, touch/sensor stages, explicit LOCK/OPEN servo tests/confirmation, angles and direction')
