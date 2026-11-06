"""Compile and exercise the actual pure logic extracted from the single sketch.

Run: python firmware/tests/test_offline_door.py (requires g++ on PATH).
No ESP32 or third-party Python package needed.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "offline_door/offline_door.ino").read_text(encoding="utf-8")


def between(start, end):
    return SOURCE.split(start, 1)[1].split(end, 1)[0]


core = between("// BEGIN HOST-TESTED DOOR LOGIC", "// END HOST-TESTED DOOR LOGIC")
calibration = "bool validCal" + between("bool validCal", "bool validConfig")
solver = "bool solveCalibration" + between("bool solveCalibration", "void acceptCalibrationPoint")
lookup = "int cardIndex" + between("int cardIndex", "String cardName")
types = "struct PinSecret {" + between("struct PinSecret {", "Config cfg{};")
motor_types = "struct MotorState {" + between("struct MotorState {", "enum Screen")
apply_motor = "void applyMotorConfig()" + between("void applyMotorConfig()", "bool requestOpen()")
door_closed = "bool isClosed" + between("bool isClosed", "MotorState snapshot()")
motor_requests = "bool requestOpen()" + between("bool requestOpen()", "void sha(")
valid_config = "bool validConfig" + between("bool validConfig", "bool saveConfig")
network = (ROOT / "connected_door/network.h").read_text(encoding="utf-8")
local_access = "bool connectedAccessReady()" + network.split("bool connectedAccessReady()",1)[1].split("bool connectedCredentialsReady()",1)[0]

harness = r'''
#include <stdint.h>
#include <assert.h>
#include <math.h>
#include <string.h>
#include <stdio.h>
#include <stddef.h>
#include "setup_logic.h"
#define CONNECTED_DOOR 1
constexpr int MAX_CARDS=32, MAX_FINGERS=32;
constexpr uint32_t CONFIG_MAGIC=0x4f444f52;
'''+ types + r'''
Config cfg{};
int32_t calX[3],calY[3];
Calibration pendingCal{};
''' + core + r'''
constexpr int HIGH=1, portMAX_DELAY=0;
int motorMutex=0;
bool actuatorReady=true, testConfigured=true;
bool storageFault=false;
bool claimed=true,appPinsReady=true,resetPending=false;
uint32_t millis() { return 1000; }
bool configured() { return testConfigured; }
void xSemaphoreTake(int,int) {}
void xSemaphoreGive(int) {}
// Stub only the digest primitive; exercise the production stored-config checks.
void sha(const uint8_t *data,size_t size,uint8_t *out) {
  memset(out,0,32); for(size_t i=0;i<size;i++) out[i%32]^=data[i];
}
''' + local_access + motor_types + door_closed + apply_motor + motor_requests + calibration + valid_config + solver + lookup + r'''
int main() {
  using namespace DoorLogic;
  Config equal{}; equal.magic=CONFIG_MAGIC; equal.version=2; equal.closedLevel=-1;
  equal.lockAngle=equal.openAngle=100;
  sha((const uint8_t*)&equal,offsetof(Config,checksum),equal.checksum);
  assert(validConfig(equal)); // Equal angles must also load after a reboot.
  equal.lockAngle=4; sha((const uint8_t*)&equal,offsetof(Config,checksum),equal.checksum);
  assert(!validConfig(equal));
  assert(validServoAngles(105,100) && validServoAngles(100,100) && validServoAngles(95,100));
  assert(validServoAngles(5,5) && validServoAngles(175,175));
  assert(!validServoAngles(4,90) && !validServoAngles(90,176));
  Config old{}; old.version=1; old.lockAngle=30; old.openAngle=100;
  old.admin.valid=1; old.cards[0].size=4; old.touch.c=123; old.closedLevel=0;
  Config upgraded=upgradeServoAngles(old);
  assert(upgraded.version==2 && upgraded.lockAngle==100 && upgraded.openAngle==30);
  assert(upgraded.admin.valid==1 && upgraded.cards[0].size==4 && upgraded.touch.c==123 && upgraded.closedLevel==0);
  upgraded.lockAngle=110; upgraded.openAngle=25;
  Config again=upgradeServoAngles(upgraded);
  assert(again.lockAngle==110 && again.openAngle==25); // Preserve later user edits.
  cfg.closedLevel=0; cfg.lockAngle=100; cfg.openAngle=30;
  for (int raw=0;raw<=1;raw++) {
    motor=MotorState{}; motor.raw=motor.stable=raw;
    motor.pending=true; motor.door.released=true; // Stale work must be cleared.
    applyMotorConfig();
    assert(motor.enabled && !motor.pending && !motor.door.released && !motor.commanded);
    // Opening/closing the leaf without authorization never starts a servo move.
    for (uint32_t now=100;now<30000;now+=100)
      assert(!tick(motor.door,now,(now/1000)%2));
    release(motor.door,30000,true); motor.pending=true;
    applyMotorConfig(); // Saving settings must preserve a real active release.
    assert(motor.door.released && motor.pending);
    testConfigured=false; applyMotorConfig();
    assert(!motor.enabled && !motor.pending && !motor.door.released);
    testConfigured=true; applyMotorConfig();
    assert(motor.enabled && !motor.pending && !motor.door.released);
  }
  motor=MotorState{}; motor.raw=motor.stable=0; applyMotorConfig();
  assert(!motor.pending && !motor.commanded);
  assert(requestOpen() && motor.target==30 && motor.door.released);
  motor.raw=motor.stable=1;
  assert(!requestLock() && motor.target==30); // Never extend latch into an open leaf.
  motor.raw=motor.stable=0;
  assert(requestLock() && motor.target==100 && !motor.door.released);
  motor=MotorState{}; motor.raw=motor.stable=0;
  cfg.lockAngle=cfg.openAngle=100; applyMotorConfig();
  assert(!motor.pending && !motor.commanded && motor.lockAngle==100 && motor.openAngle==100);
  cfg.lockAngle=95; applyMotorConfig(); // Cross the equal-angle midpoint without moving.
  assert(!motor.pending && !motor.commanded && motor.lockAngle==95 && motor.openAngle==100);
  // Compile the production connected-access gate without a Wi-Fi or broker
  // object: losing either connection must never become an unlock prerequisite.
  assert(requestOpen());assert(motor.door.released);
  assert(requestLock());
  claimed=false;assert(!requestOpen());claimed=true;
  appPinsReady=false;assert(!requestOpen());appPinsReady=true;
  resetPending=true;assert(!requestOpen());resetPending=false;
  motor.calibrating=true;assert(!requestOpen() && !requestLock());motor.calibrating=false;
  State s;
  assert(!tick(s,0,true) && !s.released);
  assert(!tick(s,50000,false) && !s.released); // Forced-open is not an unlock.

  release(s,100,true);
  assert(!tick(s,5099,true));
  assert(tick(s,5100,true) && !s.released); // No entry: 5s relock.
  assert(!tick(s,6100,true)); // No duplicate command.

  release(s,10000,true);
  assert(!tick(s,11000,false));
  assert(!tick(s,100000,false) && s.released); // Never throw bolt while open.
  assert(heldOpen(s,100000,false));
  assert(!tick(s,100010,true));
  assert(!tick(s,101009,true));
  assert(tick(s,101010,true)); // Settle 1s AFTER door closure.

  release(s,0,true);
  tick(s,100,false); tick(s,200,true); tick(s,800,false);
  assert(!tick(s,1000,true));
  assert(!tick(s,1999,true));
  assert(tick(s,2000,true)); // Reopen resets close countdown.

  release(s,0,true);
  tick(s,4900,false);
  assert(!heldOpen(s,20000,false)); // Alarm starts at opening, not authentication.
  assert(heldOpen(s,24900,false));
  tick(s,25000,true); tick(s,25500,false);
  assert(!heldOpen(s,25501,false)); // A reopened door gets a new warning interval.

  release(s,100,false); // An explicit unlock while the leaf is already open.
  assert(!tick(s,10000,false));
  assert(!tick(s,10010,true));
  assert(tick(s,11010,true));

  release(s,0xfffffff0u,true);
  assert(!tick(s,uint32_t(0xfffffff0u+4999u),true));
  assert(tick(s,uint32_t(0xfffffff0u+5000u),true));
  release(s,0xfffffff0u,false);
  assert(!tick(s,50,true));
  assert(!tick(s,1049,true));
  assert(tick(s,1050,true)); // millis rollover on close countdown.

  uint32_t seed=123456789;
  for (uint32_t now=0;now<1000000;now+=13) {
    seed=1664525u*seed+1013904223u;
    bool closed=(seed>>30)!=0;
    if ((seed&255)==0) release(s,now,closed);
    bool command=tick(s,now,closed);
    assert(!command || closed);
    assert(!command || !s.released);
  }

  // No sensor template is authorized simply because it exists on the module.
  assert(fingerIndex(7)==-1);
  cfg.fingerCount=2; cfg.fingers[0]=7; cfg.fingers[1]=255;
  assert(fingerIndex(7)==0 && fingerIndex(255)==1 && fingerIndex(8)==-1);
  cfg.fingers[0]=cfg.fingers[--cfg.fingerCount];
  assert(fingerIndex(7)==-1 && fingerIndex(255)==0);
  Card a{}; a.size=4; memcpy(a.bytes,"ABCD",4);
  assert(cardIndex(a)==-1);
  cfg.cards[0]=a; cfg.cardCount=1; assert(cardIndex(a)==0);
  Card b=a; b.size=7; assert(cardIndex(b)==-1);
  b=a; b.bytes[3]='X'; assert(cardIndex(b)==-1);
  cfg.cardCount=0; assert(cardIndex(a)==-1);

  // Three-point affine calibration must handle swapped and reversed axes.
  for (int variant=0;variant<4;variant++) {
    const int screenX[3]={25,215,25},screenY[3]={70,70,290};
    for (int i=0;i<3;i++) {
      int rx=200+screenX[i]*10,ry=300+screenY[i]*9;
      if (variant&1) rx=4095-rx;
      if (variant&2) { int swap=rx; rx=ry; ry=swap; }
      calX[i]=rx; calY[i]=ry;
    }
    assert(solveCalibration());
    int rx=200+120*10,ry=300+180*9;
    if (variant&1) rx=4095-rx;
    if (variant&2) { int swap=rx; rx=ry; ry=swap; }
    assert(fabsf(pendingCal.a*rx+pendingCal.b*ry+pendingCal.c-120)<0.01);
    assert(fabsf(pendingCal.d*rx+pendingCal.e*ry+pendingCal.f-180)<0.01);
    // Existing rotation-0 calibration must still hit the same physical point
    // after the display is turned. New calibration uses the same NVS format.
    Calibration rotated=halfTurnCalibration(pendingCal);
    assert(validCal(rotated));
    for (int i=0;i<3;i++) {
      float x=rotated.a*calX[i]+rotated.b*calY[i]+rotated.c;
      float y=rotated.d*calX[i]+rotated.e*calY[i]+rotated.f;
      assert(fabsf(x-(239-screenX[i]))<0.01);
      assert(fabsf(y-(319-screenY[i]))<0.01);
      assert(239-lroundf(x)==screenX[i]);
      assert(319-lroundf(y)==screenY[i]);
    }
    Calibration restored=halfTurnCalibration(rotated);
    assert(fabsf(restored.a-pendingCal.a)<0.0001);
    assert(fabsf(restored.b-pendingCal.b)<0.0001);
    assert(fabsf(restored.c-pendingCal.c)<0.001);
    assert(fabsf(restored.d-pendingCal.d)<0.0001);
    assert(fabsf(restored.e-pendingCal.e)<0.0001);
    assert(fabsf(restored.f-pendingCal.f)<0.001);
  }
  calX[0]=calX[1]=calX[2]=1000;
  calY[0]=calY[1]=calY[2]=1000;
  assert(!solveCalibration()); // Repeated/collinear points must be rejected.
  pendingCal.valid=1; pendingCal.a=NAN; assert(!validCal(pendingCal));
  puts("PASS: no boot/setup servo move, door timing, open-door interlock, restart/rollover, allowlists, touch calibration");
}
'''

compiler = shutil.which("g++")
if not compiler:
    raise SystemExit("g++ is required to run offline door host tests")
with tempfile.TemporaryDirectory(prefix="offline-door-tests-") as folder:
    folder = Path(folder)
    cpp = folder / "test.cpp"
    exe = folder / "test.exe"
    cpp.write_text(harness, encoding="utf-8")
    subprocess.run([compiler, "-std=c++11", "-Wall", "-Wextra", "-Werror", "-O2",
                    "-static-libgcc", "-static-libstdc++", "-I", str(ROOT / "connected_door"), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
