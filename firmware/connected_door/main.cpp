#include <Arduino.h>
#include <Preferences.h>
#define CONNECTED_DOOR 1
bool connectedAccessReady();
bool connectedManaged();
bool connectedIsEnrolling();
bool connectedCaptureCard(const String &);
void connectedRecord(const char *,bool,const char *,int);
void connectedSetup();
void connectedPoll();
void connectedNetworkPage();
bool connectedSetupTouch(int,int);
#include "../offline_door/offline_door.ino"
#include "network.h"
