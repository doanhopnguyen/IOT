#pragma once
#include <stdint.h>
namespace DoorTiming {
constexpr uint32_t DEFAULT_TIMING = (20u<<8)|5u;
inline bool valid(int seconds){return seconds>=1 && seconds<=30;}
inline unsigned openSeconds(uint32_t value){return (value&0x7fffffffu)>>8;}
inline bool waitForClose(uint32_t value){return !(value&0x80000000u);}
template<class Store> uint32_t load(Store &store) {
  uint32_t value=store.getUInt("doorTiming",DEFAULT_TIMING);
  return valid(value&255) && openSeconds(value)>=10 && openSeconds(value)<=600?value:DEFAULT_TIMING;
}
template<class Store> bool save(Store &store,int unlockSec,int openSec,bool wait=true) {
  if(!valid(unlockSec) || openSec<10 || openSec>600)return false;
  uint32_t value=(uint32_t(openSec)<<8)|uint32_t(unlockSec)|(wait?0u:0x80000000u);
  if(store.getUInt("doorTiming",0)==value)return true;
  return store.putUInt("doorTiming",value)==sizeof(uint32_t) && store.getUInt("doorTiming",0)==value;
}
}
