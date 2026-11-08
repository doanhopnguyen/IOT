#include <Arduino.h>
#include <Adafruit_Fingerprint.h>
#include <esp_system.h>

HardwareSerial fingerPort(1);
Adafruit_Fingerprint finger(&fingerPort);
String uid;
void setup(){
  Serial.begin(115200);Serial.setTimeout(500);
  uint8_t mac[6];esp_read_mac(mac,ESP_MAC_WIFI_STA);
  char id[32];snprintf(id,sizeof(id),"ESP32-%02X%02X%02X%02X%02X%02X",mac[0],mac[1],mac[2],mac[3],mac[4],mac[5]);uid=id;
  fingerPort.begin(57600,SERIAL_8N1,17,18);
  // No motor pin is attached, configured or driven by this maintenance image.
}
void loop(){
  if(!Serial.available()){delay(10);return;}
  String command=Serial.readStringUntil('\n');command.trim();
  if(command=="INFO"){Serial.println("WIPE_DEVICE "+uid);return;}
  if(command!="WIPE "+uid){Serial.println("WIPE_REJECTED");return;}
  if(!finger.verifyPassword() || finger.getParameters()!=FINGERPRINT_OK ||
     finger.emptyDatabase()!=FINGERPRINT_OK || finger.getTemplateCount()!=FINGERPRINT_OK || finger.templateCount!=0){
    Serial.println("WIPE_FAILED");return;
  }
  Serial.println("FINGERPRINT_EMPTY_VERIFIED templates=0");Serial.flush();
}
