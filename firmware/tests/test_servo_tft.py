"""Compile real TFT servo render functions and verify saved angles/display controls."""
from pathlib import Path
import shutil, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
sketch=(root/'offline_door/offline_door.ino').read_text(encoding='utf-8')
def between(start,end): return start+sketch.split(start,1)[1].split(end,1)[0]
format_angle=between('String servoDisplayAngle(int command)', 'void row(')
guided=between('void drawServoCalibration()', 'void beginServoCalibration()')
settings=sketch.split('  } else if (screen==MOTOR) {',1)[1].split('  } else if (screen==DOOR_CAL)',1)[0]
source=r'''
#include <cassert>
#include <string>
#include <vector>
#include "servo_setup_logic.h"
struct String {
  std::string value;
  String(const char*s):value(s){} String(int n):value(std::to_string(n)){}
  String(std::string s):value(s){}
  friend String operator+(const String&a,const String&b){return String(a.value+b.value);}
};
constexpr int WHITE=0,CYAN=1,YELLOW=2;
std::vector<std::string> labels;
void title(const String&s){labels.push_back(s.value);}
void row(int,const String&s,int=WHITE){assert(s.value.size()<=38);labels.push_back(s.value);}
void button(int,int,int w,int,const String&s){assert(int(s.value.size())*6<=w-6);labels.push_back(s.value);}
bool has(const std::string&s){for(auto&v:labels)if(v==s)return true;return false;}
struct MotorState {int commandSequence=1,lastAngle=180;bool pending=false,pulsing=false;};
MotorState snapshot(){return MotorState{};}
ServoSetup::State servoSetup;
bool servoPreviouslyVerified=true;
struct {int lockAngle=0,openAngle=180,openDirection=1;}cfg;
''' + format_angle + guided + '\nvoid drawSettings(){'+settings+'}\n' + r'''
int main(){
  for(int raw=0;raw<=180;raw++){
    std::string expected=std::to_string(raw/2)+(raw%2?".5":"");
    assert(servoDisplayAngle(raw).value==expected);
  }
  assert(servoDisplayAngle(-30).value=="--" && servoDisplayAngle(181).value=="--");
  drawSettings();assert(has("SERVO 0-90 DEG") && has("OPEN ANGLE: 90 DEG"));
  assert(has("DECREASE 5") && has("INCREASE 5") && has("LOCK FIXED: 0 DEG"));
  labels.clear();cfg.openAngle=135;drawSettings();assert(has("OPEN ANGLE: 67.5 DEG"));
  labels.clear();servoSetup.openAngle=180;servoSetup.step=0;drawServoCalibration();
  assert(has("LOCK: 0 deg / OPEN: 90 deg") && has("Last command: 90 deg"));
  assert(!has("DECREASE 5") && has("LOCK FIXED AT 0 DEG"));
  labels.clear();servoSetup.step=1;servoSetup.openAngle=135;drawServoCalibration();
  assert(has("LOCK: 0 deg / OPEN: 67.5 deg") && has("DECREASE 5") && has("INCREASE 5"));
  for(auto&s:labels){assert(s.find("NEGATIVE")==std::string::npos);assert(s.find("180")==std::string::npos);}
}
'''
compiler=shutil.which('g++')
if not compiler: raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='servo-tft-') as folder:
    folder=Path(folder);cpp=folder/'test.cpp';exe=folder/'test.exe';cpp.write_text(source)
    subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-static-libgcc','-static-libstdc++','-I',str(root/'include'),str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('PASS: production TFT servo screens, 181 saved angles, half degrees, control labels and text fit')
