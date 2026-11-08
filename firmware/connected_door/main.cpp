#include <Arduino.h>
#include <Preferences.h>
#define CONNECTED_DOOR 1
// Gửi trong heartbeat để backend theo dõi phiên bản phần cứng/firmware của thiết bị.
#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.14.0"
#endif
#define FIRMWARE_IDENTITY "SMARTDOOR_OTA_V1|" FIRMWARE_VERSION
#define HARDWARE_VERSION "esp32s3-n16r8"
bool connectedAccessReady();
bool connectedManaged();
bool connectedIsEnrolling();
bool connectedCaptureCard(const String &);
void connectedRecord(const char *,bool,const char *,int,const char *reason=nullptr);
bool connectedRetired();
void connectedRetiredBoot();
bool connectedAllowsCard(const String &);
bool connectedAllowsFinger(int);
bool connectedAllowsPin();
bool connectedOpenBlocked();
const char *connectedRestrictionNotice();
void connectedSetup();
void connectedPoll();
void connectedNetworkPage();
bool connectedSetupTouch(int,int);
bool connectedCredentialsReady();
bool connectedContinueSetup();
bool connectedCompleteDoorSetup();
bool connectedUpdating();
void connectedDrawStatusBar(bool);
#include "../offline_door/offline_door.ino"
#include "network.h"
