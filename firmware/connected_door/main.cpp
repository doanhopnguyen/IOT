#include <Arduino.h>
#include <Preferences.h>
#define CONNECTED_DOOR 1
// Gửi trong heartbeat để backend theo dõi phiên bản phần cứng/firmware của thiết bị.
#define FIRMWARE_VERSION "1.9.0"
#define HARDWARE_VERSION "esp32s3-n16r8"
bool connectedAccessReady();
bool connectedManaged();
bool connectedIsEnrolling();
bool connectedCaptureCard(const String &);
void connectedRecord(const char *,bool,const char *,int);
void connectedSetup();
void connectedPoll();
void connectedNetworkPage();
bool connectedSetupTouch(int,int);
bool connectedCredentialsReady();
bool connectedContinueSetup();
void connectedDrawStatusBar(bool);
#include "../offline_door/offline_door.ino"
#include "network.h"
