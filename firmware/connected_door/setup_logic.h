#pragma once
#include <stdint.h>
namespace SetupLogic {
inline bool localAccessAllowed(bool claimed,bool pins,bool calibrated,bool resetting){
  return claimed && pins && calibrated && !resetting;
}
inline int signalBars(int rssi){return rssi>=-55?4:rssi>=-65?3:rssi>=-75?2:rssi>=-85?1:0;}
inline bool wifiAllowed(bool claimed,uint32_t deadline,uint32_t now) {
  return !claimed || (deadline && int32_t(deadline-now)>0);
}
inline bool wifiAttemptExpired(uint32_t started,uint32_t now,bool connected) {
  return started && !connected && uint32_t(now-started)>35000;
}
inline const char *stage(bool reset,bool wifi,bool service,bool claimed,bool pins,bool touch,
                         bool door,unsigned point,bool closedSample,bool wifiPage,bool servo=true,bool servoOpen=false) {
  if(reset)return "RESETTING";
  if(!wifi)return "WIFI";
  if(!service)return "SERVICE";
  if(!claimed)return "CLAIM";
  if(!pins)return "PINS";
  if(!touch){const char *points[]={"TOUCH_1","TOUCH_2","TOUCH_3","TOUCH_4"};return points[point<4?point:3];}
  if(!door)return closedSample?"DOOR_OPEN":"DOOR_CLOSED";
  if(!servo)return servoOpen?"SERVO_OPEN":"SERVO_LOCK";
  return wifiPage?"WIFI_SETTINGS":"READY";
}
}
