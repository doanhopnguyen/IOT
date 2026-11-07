/* Read-only UART fingerprint test for ESP32-S3. No servo, Wi-Fi or template writes. */
#include <Arduino.h>
#include <Adafruit_Fingerprint.h>

HardwareSerial sensorUart(2);
Adafruit_Fingerprint finger(&sensorUart);
String command;
bool ready=false;
uint32_t lastCapture=0;
bool captured=false;

void checkSensor() {
  ready=false;captured=false;
  for (uint32_t baud : {57600UL,9600UL,19200UL,38400UL,115200UL}) {
    sensorUart.end();sensorUart.begin(baud,SERIAL_8N1,17,18);delay(150);
    while(sensorUart.available())sensorUart.read();
    uint8_t verify[]={FINGERPRINT_VERIFYPASSWORD,0,0,0,0};
    Adafruit_Fingerprint_Packet packet(FINGERPRINT_COMMANDPACKET,sizeof(verify),verify);
    finger.writeStructuredPacket(packet);
    uint8_t transport=finger.getStructuredPacket(&packet,1000);
    if(transport!=FINGERPRINT_OK || packet.type!=FINGERPRINT_ACKPACKET || packet.length<3){
      Serial.printf("FP_BAUD baud=%u packetStatus=%u no_valid_ack=1\n",baud,transport);continue;
    }
    if(packet.data[0]!=FINGERPRINT_OK){Serial.printf("FP_AUTH_FAILED baud=%u ackCode=%u\n",baud,packet.data[0]);return;}
    uint8_t parameters=finger.getParameters();
    uint8_t count=finger.getTemplateCount();
    ready=parameters==FINGERPRINT_OK;
    Serial.printf("FP_CHECK baud=%u authenticated=1 parameters=%u capacity=%u countStatus=%u templates=%u\n",
      baud,parameters,finger.capacity,count,finger.templateCount);
    if(ready)Serial.println("FP_READY TX_SENSOR=GPIO17 RX_SENSOR=GPIO18");
    return;
  }
  Serial.println("FP_NO_UART_RESPONSE check_power_TX17_RX18_GND");
}

void setup() {
  Serial.begin(115200);
  uint32_t start=millis();while(!Serial && millis()-start<2000)delay(10);
  Serial.println("FP_TEST_READY read_only; CHECK=recheck, no_template_changes");
  checkSensor();
}

void loop() {
  while(Serial.available()){
    char c=Serial.read();
    if(c=='\n'){
      command.trim();if(command=="CHECK" || command=="INFO")checkSensor();command="";
    }else if(command.length()<32)command+=c;
  }
  if(ready && millis()-lastCapture>=300){
    lastCapture=millis();uint8_t result=finger.getImage();
    if(result==FINGERPRINT_OK && !captured){captured=true;Serial.println("FP_IMAGE_CAPTURED");}
    else if(result==FINGERPRINT_NOFINGER && captured){captured=false;Serial.println("FP_FINGER_REMOVED");}
    else if(result!=FINGERPRINT_OK && result!=FINGERPRINT_NOFINGER){Serial.printf("FP_IMAGE_ERROR code=%u\n",result);}
  }
  delay(5);
}
