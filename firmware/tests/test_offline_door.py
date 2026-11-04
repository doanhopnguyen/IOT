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

harness = r'''
#include <stdint.h>
#include <assert.h>
#include <math.h>
#include <string.h>
#include <stdio.h>
constexpr int MAX_CARDS=32, MAX_FINGERS=32;
'''+ types + r'''
Config cfg{};
int32_t calX[3],calY[3];
Calibration pendingCal{};
''' + core + calibration + solver + lookup + r'''
int main() {
  using namespace DoorLogic;
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

  release(s,100,false); // Boot with door open retracts instead of locking.
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
  }
  calX[0]=calX[1]=calX[2]=1000;
  calY[0]=calY[1]=calY[2]=1000;
  assert(!solveCalibration()); // Repeated/collinear points must be rejected.
  pendingCal.valid=1; pendingCal.a=NAN; assert(!validCal(pendingCal));
  puts("PASS: door timing, open-door interlock, restart/rollover, allowlists, touch calibration");
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
                    "-static-libgcc", "-static-libstdc++", str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
