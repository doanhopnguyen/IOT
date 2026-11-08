#pragma once
#include <stddef.h>
#include <string.h>
namespace OtaPolicy {
inline bool manifest(const char *current,const char *next,const char *sha,size_t size,size_t partition) {
  if(!next || !*next || strlen(next)>50 || !strcmp(current,next) || !sha || strlen(sha)!=64 ||
     size<256 || size>4u*1024u*1024u || size>partition)return false;
  for(const char *c=sha;*c;c++)if(!((*c>='0'&&*c<='9')||(*c>='a'&&*c<='f')))return false;
  return true;
}
inline bool digest(const char *expected,const char *actual,size_t received,size_t size) {
  return received==size && expected && actual && strlen(expected)==64 && strlen(actual)==64 && !strcmp(expected,actual);
}
inline bool canStart(bool ready,bool reset,bool enrolling,bool servoPage,bool fault,bool released,
                     bool pending,bool pulsing,bool calibrating,bool previewing,bool closed) {
  return ready && !reset && !enrolling && !servoPage && !fault && !released && !pending && !pulsing && !calibrating && !previewing && closed;
}
}
