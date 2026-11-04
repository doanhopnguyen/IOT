#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_Fingerprint.h>
#include <MFRC522.h>

HardwareSerial sensorUart(2);
Adafruit_Fingerprint finger(&sensorUart);
MFRC522 reader(10,9);
String command;

void scanSensor() {
  for(uint32_t baud : {57600UL,9600UL,19200UL,38400UL,115200UL}) {
    sensorUart.end();sensorUart.begin(baud,SERIAL_8N1,17,18);delay(150);
    while(sensorUart.available())sensorUart.read();
    bool authenticated=finger.verifyPassword();
    Serial.printf("DIAG baud=%u authenticated=%d\n",baud,authenticated);
    if(authenticated){Serial.println("DIAG_SENSOR_FOUND");return;}
  }
  sensorUart.end();sensorUart.begin(57600,SERIAL_8N1,17,18);
  Serial.println("DIAG_NO_UART_RESPONSE");
}

void runCleanup() {
  Serial.println("CLEANUP_BEGIN");
  bool ready=finger.verifyPassword();
  Serial.printf("FINGERPRINT_AUTH=%s\n",ready?"OK":"FAILED");
  if (!ready) { Serial.println("CLEANUP_FAILED_NO_FINGERPRINT_ACK"); return; }
  uint8_t result=finger.getTemplateCount();
  if (result!=FINGERPRINT_OK) {
    Serial.printf("CLEANUP_FAILED_COUNT_BEFORE=0x%02X\n",result); return;
  }
  Serial.printf("FINGERPRINT_COUNT_BEFORE=%u\n",finger.templateCount);
  result=finger.emptyDatabase();
  Serial.printf("FINGERPRINT_ERASE_ACK=0x%02X\n",result);
  if (result!=FINGERPRINT_OK) { Serial.println("CLEANUP_FAILED_ERASE"); return; }
  delay(300);
  result=finger.getTemplateCount();
  Serial.printf("FINGERPRINT_VERIFY_ACK=0x%02X\n",result);
  if (result!=FINGERPRINT_OK) { Serial.println("CLEANUP_FAILED_VERIFY"); return; }
  Serial.printf("FINGERPRINT_COUNT_AFTER=%u\n",finger.templateCount);
  if (finger.templateCount!=0) { Serial.println("CLEANUP_FAILED_NOT_EMPTY"); return; }
  reader.PCD_Reset();
  reader.PCD_Init();
  uint8_t version=reader.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("RC522_RESET_VERSION=0x%02X\n",version);
  Serial.println("CLEANUP_FINGERPRINT_EMPTY_VERIFIED");
  if (version==0 || version==0xff) Serial.println("RC522_NOT_RESPONDING");
  else Serial.println("RC522_RESET_RESPONDING");
}

void setup() {
  Serial.begin(115200);
  pinMode(4,OUTPUT); digitalWrite(4,LOW);
  for (int cs : {47,48,10}) { pinMode(cs,OUTPUT); digitalWrite(cs,HIGH); }
  SPI.begin(41,21,42);
  sensorUart.begin(57600,SERIAL_8N1,17,18);
  reader.PCD_Init();
  delay(500);
  Serial.println("CLEANUP_READY: send ERASE_FINGERPRINTS newline");
}
void loop() {
  while (Serial.available()) {
    char c=Serial.read();
    if (c=='\n') {
      command.trim();
      if (command=="ERASE_FINGERPRINTS") runCleanup();
      else if (command=="SCAN") scanSensor();
      else if (command=="STATUS") Serial.println("CLEANUP_READY");
      command="";
    } else if (command.length()<64) command+=c;
  }
  delay(5);
}
