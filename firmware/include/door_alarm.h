#pragma once
#include <stdint.h>

namespace DoorAlarm {
constexpr uint8_t DEFAULT_PIN_LIMIT=5, MIN_PIN_LIMIT=1, MAX_PIN_LIMIT=10;
constexpr uint32_t PIN_LOCKOUT_MS=30000;
enum Reason:uint8_t { NONE=0, WRONG_PIN=1, DOOR_OPEN=2 };
inline bool validPinLimit(int limit){return limit>=MIN_PIN_LIMIT && limit<=MAX_PIN_LIMIT;}
template<class Store> uint8_t loadPinLimit(Store &store){
  uint8_t limit=store.getUChar("pinLimit",DEFAULT_PIN_LIMIT);
  return validPinLimit(limit)?limit:DEFAULT_PIN_LIMIT;
}
template<class Store> bool savePinLimit(Store &store,int limit){
  if(!validPinLimit(limit))return false;
  if(store.getUChar("pinLimit",0)==limit)return true;
  return store.putUChar("pinLimit",uint8_t(limit))==1 && store.getUChar("pinLimit",0)==limit;
}
struct State {
  bool trackingOpen=false;
  uint32_t openedAt=0,patternAt=0;
  uint8_t reason=NONE;
};
// A stable closed reed ends the open interval. Brief unsettled readings do not
// discard a tracked interval or authorize an alarm on their own.
inline bool tick(State &s,uint32_t now,bool armed,bool doorKnown,bool closed,
                 uint32_t openLimitMs,bool pinBlocked){
  if(!armed){s=State{};return false;}
  if(doorKnown){
    if(closed)s.trackingOpen=false;
    else if(!s.trackingOpen){s.trackingOpen=true;s.openedAt=now;}
  }
  bool openAlarm=doorKnown && !closed && s.trackingOpen && openLimitMs>=10000 &&
    uint32_t(now-s.openedAt)>=openLimitMs;
  uint8_t reason=(pinBlocked?WRONG_PIN:0)|(openAlarm?DOOR_OPEN:0);
  if(reason!=s.reason){s.reason=reason;s.patternAt=now;}
  if(reason&WRONG_PIN){uint32_t phase=uint32_t(now-s.patternAt)%1000;return phase<150 || (phase>=300 && phase<450);}
  return reason&DOOR_OPEN && uint32_t(now-s.patternAt)%1500<300;
}
inline const char *label(uint8_t reason){
  return reason==(WRONG_PIN|DOOR_OPEN)?"PIN_AND_DOOR":reason==WRONG_PIN?"PIN_FAILURE":reason==DOOR_OPEN?"DOOR_OPEN":"NONE";
}
}
