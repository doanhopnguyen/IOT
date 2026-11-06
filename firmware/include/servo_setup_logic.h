#pragma once
namespace ServoSetup {
struct State {
  int lockAngle=100,openAngle=30;
  unsigned step=0;
  bool tested=false;
};
inline int angle(const State &s){return s.step==0?s.lockAngle:s.openAngle;}
inline void adjust(State &s,int delta){
  int next=angle(s)+delta;if(next<5)next=5;if(next>175)next=175;
  if(s.step==0)s.lockAngle=next;else s.openAngle=next;
  s.tested=false;
}
inline bool canConfirm(const State &s,int lastAngle,bool pending,bool pulsing,bool closed,bool fault=false,bool executed=true){
  return s.tested && executed && !fault && lastAngle==angle(s) && !pending && !pulsing && (s.step!=0 || closed);
}
inline const char *direction(int from,int to){
  return from<0?"UNKNOWN":to>from?"INCREASE":to<from?"DECREASE":"HOLD";
}
}
