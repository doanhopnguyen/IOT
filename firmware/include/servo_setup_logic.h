#pragma once
namespace ServoSetup {
struct State {
  int lockAngle=0,openAngle=30,range=180,openDirection=1;
  unsigned step=0;
  bool tested=false;
};
inline int angle(const State &s){return s.step==0?s.lockAngle:s.openAngle;}
// TFT and app show half of the stored command, preserving existing PWM/NVS.
inline bool validDemoCommand(int command){return command>=0 && command<=180;}
inline int stepDemoCommand(int command,int displayDelta){
  int next=(validDemoCommand(command)?command:0)+displayDelta*2;
  return next<0?0:next>180?180:next;
}
inline void adjust(State &s,int delta){
  if(s.step==0)return; // LOCK stays at the existing logical zero.
  int next=stepDemoCommand(s.openAngle,delta);
  if(next==s.openAngle && s.openDirection==1)return;
  s.openAngle=next;s.openDirection=1;s.tested=false;
}
inline int scaleAngle(int angle,int from,int to){return angle<0?-1:(angle*to+from/2)/from;}
inline bool validAngles(int lock,int open,int range,int direction){
  return range==180 && lock==0 && (direction==1 || direction==-1) &&
    open>=-180 && open<=180 && (open==0 || (open<0?-1:1)==direction);
}
// Each installation uses one 180-degree travel. Negative coordinates select
// the opposite physical end stop as logical LOCK=0; they never wrap PWM.
inline int physicalAngle(int angle,int direction){return direction<0?180+angle:angle;}
inline int pulseWidth(int angle,int range,int direction=1){return 1000+(physicalAngle(angle,direction)*1000+range/2)/range;}
inline bool canConfirm(const State &s,int lastAngle,bool pending,bool pulsing,bool closed,bool fault=false,bool executed=true){
  return s.tested && executed && !fault && lastAngle==angle(s) && !pending && !pulsing && (s.step!=0 || closed);
}
inline const char *direction(int from,int to){
  return from<-180 || from>180?"UNKNOWN":to>from?"INCREASE":to<from?"DECREASE":"HOLD";
}
}
