"""Compile the actual motor task and preview/calibration requests with fake hardware."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
sketch = (root / 'offline_door/offline_door.ino').read_text(encoding='utf-8')


def section(start, end):
    return sketch.split(start, 1)[1].split(end, 1)[0]


core = section('// BEGIN HOST-TESTED DOOR LOGIC', '// END HOST-TESTED DOOR LOGIC')
types = 'struct MotorState {' + section('struct MotorState {', 'enum Screen')
closed = 'bool isClosed' + section('bool isClosed', 'MotorState snapshot()')
preview = section('// BEGIN HOST-TESTED SERVO PREVIEW', '// END HOST-TESTED SERVO PREVIEW')
task = 'void motorTask(void *)' + section('void motorTask(void *)', 'void applyMotorConfig()')
requests = 'bool requestOpen(' + section('bool requestOpen(', 'void sha(')
calibrate = 'bool testServoCalibration()' + section('bool testServoCalibration()', 'void confirmServoCalibration()')
source = r'''
#include <cassert>
#include <cstdint>
#include <vector>
#include <functional>
#include "servo_setup_logic.h"
constexpr int HIGH=1,portMAX_DELAY=0,DOOR_PIN=6,SERVO_PIN=4;
uint32_t clockNow=1000;
uint32_t millis(){return clockNow;}
void xSemaphoreTake(int,int){} void xSemaphoreGive(int){}
int motorMutex=1,sensorRaw=0;
bool actuatorReady=true,storageFault=false,ready=true,adminSession=true;
bool configured(){return ready;}
struct Servo {
  bool attachedNow=false,fail=false;int detaches=0;
  std::vector<int> writes;
  bool attached(){return attachedNow;}
  void attach(int,int,int){attachedNow=!fail;}
  void detach(){attachedNow=false;++detaches;}
  void writeMicroseconds(int us){writes.push_back(us);}
} servo;
int digitalRead(int){return sensorRaw;}
int pdMS_TO_TICKS(int n){return n;}
struct End{};
int ticksLeft=0;
std::function<void()> onTick;
void vTaskDelay(int ms){
  clockNow+=ms;
  if(onTick)onTick();
  if(--ticksLeft<=0)throw End{};
}
ServoSetup::State servoSetup;
uint32_t servoTestSequence=0;
''' + core + types + closed + preview + task + requests + calibrate + r'''
void run(int ticks){ticksLeft=ticks;try{motorTask(nullptr);}catch(End&){} }
void seed(){
  motor=MotorState{};motor.enabled=true;motor.closedLevel=0;
  motor.raw=motor.stable=0;servo={};clockNow=1000;sensorRaw=0;
  ready=true;storageFault=false;actuatorReady=true;onTick=nullptr;
}
int main(){
  seed();run(100);assert(servo.writes.empty()); // Never move on mount/boot.
  assert(requestServoPreview(0,true));run(1);
  assert(servo.writes==std::vector<int>{1000} && motor.calibrating);
  assert(!requestOpen() && !requestLock()); // Normal access cannot race a jog.
  assert(requestServoPreview(5,false));
  assert(requestServoPreview(10,false)); // Latest target replaces queued work.
  run(100);assert((servo.writes==std::vector<int>{1000,1056}));
  assert(!servo.attached() && !motor.pulsing && motor.previewing);
  stopServoPreview();assert(!motor.previewing && !motor.calibrating && !motor.commanded);
  assert(!motor.pending && !servo.attached());
  run(600);assert(servo.writes.size()==2); // Stopping never drives an old lock angle.
  assert(requestOpen());run(1);assert(servo.writes.back()==1167);

  seed();assert(requestServoPreview(89,false));run(1);
  run(500);assert(!motor.previewing && !motor.calibrating && !motor.commanded);
  assert(servo.writes.size()==1); // Lost app connection ends the session after 5s.
  seed();sensorRaw=motor.raw=motor.stable=1;
  assert(!requestServoPreview(0,true)); // Never extend into an open door leaf.
  assert(requestServoPreview(89,false));run(1);assert(servo.writes.back()==1494);
  stopServoPreview();
  seed();assert(requestServoPreview(0,true));sensorRaw=1;run(10);
  assert(servo.writes.empty() && !motor.pending && !motor.previewing); // Opened between accept and PWM.
  for(int angle:{-181,-1,181,360})assert(!requestServoPreview(angle,false));
  ready=false;assert(!requestServoPreview(90,false));ready=true;
  storageFault=true;assert(!requestServoPreview(90,false));storageFault=false;
  motor.door.released=true;assert(!requestServoPreview(90,false));motor.door.released=false;
  motor.calibrating=true;assert(!requestServoPreview(90,false));motor.calibrating=false;
  motor.fault=true;assert(!requestServoPreview(90,false));
  seed();servo.fail=true;assert(requestServoPreview(90,false));run(2);
  assert(motor.fault && !motor.previewing && servo.writes.empty());

  seed();clockNow=0xfffffff0u;
  assert(requestServoPreview(89,false));run(501);assert(!motor.previewing); // millis rollover.
  // Explicit remote LOCK overrides the sensor wait once, even with a queued
  // unlock, without changing the automatic relock preference.
  seed();motor.openAngle=180;assert(requestOpen());
  sensorRaw=motor.raw=motor.stable=1;
  assert(requestLock(true));run(1);
  assert(motor.lastAngle==0 && servo.writes.back()==1000);
  assert(!motor.door.released && !motor.door.lockPending && motor.waitForClose);
  run(600);assert(servo.writes.size()==1); // Old unlock/timer cannot reopen.
  assert(requestLock(true));run(1);assert(servo.writes.size()==2);
  seed();motor.openAngle=180;assert(requestOpen());run(1);
  sensorRaw=motor.raw=motor.stable=1;
  assert(requestLock());assert(motor.door.lockPending); // Local/default still waits.
  assert(requestLock(true));run(1);assert(motor.lastAngle==0 && !motor.door.lockPending);
  for(int failure=0;failure<4;failure++){
    seed();
    if(failure==0)motor.fault=true;
    if(failure==1)storageFault=true;
    if(failure==2)motor.enabled=false;
    if(failure==3)motor.calibrating=true;
    assert(!requestLock(true));run(1);assert(servo.writes.empty());
  }
  seed();servoSetup={};servoSetup.step=1;
  servoSetup.openAngle=-10;servoSetup.openDirection=-1;
  assert(!testServoCalibration() && !motor.pending);
  servoSetup.openAngle=181;servoSetup.openDirection=1;
  assert(!testServoCalibration() && !motor.pending);
  servoSetup.openAngle=30;servoSetup.openDirection=-1;
  assert(!testServoCalibration() && !motor.pending);
  seed();servoSetup={};servoSetup.step=1;
  ServoSetup::adjust(servoSetup,5);assert(testServoCalibration());run(1);
  assert(motor.lastAngle==40 && motor.pulsing);
  ServoSetup::adjust(servoSetup,5);assert(testServoCalibration());run(100);
  assert(motor.lastAngle==50 && !motor.pulsing);
  assert(ServoSetup::canConfirm(servoSetup,motor.lastAngle,motor.pending,motor.pulsing,true,motor.fault,motor.commandSequence!=servoTestSequence));
  seed();
  assert(requestServoPreview(-5,false,-1));run(1);assert(servo.writes.back()==1972);
  assert(requestServoPreview(-10,false,-1));run(1);assert(servo.writes.back()==1944);
  assert(requestServoPreview(-15,false,-1));run(1);assert(servo.writes.back()==1917);
  assert(requestServoPreview(-180,false,-1));run(1);assert(servo.writes.back()==1000);
  assert(requestServoPreview(0,true,-1));run(1);assert(servo.writes.back()==2000);
  assert(requestServoPreview(0,true,1));run(1);assert(servo.writes.back()==1000);
  assert(!requestServoPreview(-5,false,1) && !requestServoPreview(5,false,-1));
  assert(!requestServoPreview(5,true,1) && !requestServoPreview(-181,false,-1));
  stopServoPreview();motor.openDirection=-1;motor.openAngle=-15;
  assert(requestOpen());run(1);assert(servo.writes.back()==1917);
  assert(requestLock());run(1);assert(servo.writes.back()==2000);
  seed();sensorRaw=motor.raw=motor.stable=1;
  assert(!requestServoPreview(-5,false,-1)); // End-stop reversal requires closure.
  assert(!requestServoPreview(0,false,1)); // OPEN=0 is also the locked position.
  seed();assert(requestServoPreview(-5,false,-1));sensorRaw=1;run(10);
  assert(servo.writes.empty()); // Door opened before direction-changing PWM.

}
'''
network = (root / 'connected_door/network.h').read_text(encoding='utf-8')
remote_lock = network.split('if(type=="DOOR_LOCK"){',1)[1].split('if(type=="PIN_SET")',1)[0]
assert 'requestLock(true)' in remote_lock and 'LOCK_WAITING_FOR_DOOR' not in remote_lock
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='servo-preview-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'test.cpp', folder / 'test.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    '-I', str(root / 'include'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: actual motor task, fixed zero lock, signed 5-degree live jogs, latest target, stop/expiry, open-leaf interlock, faults, rollover, local calibration')
