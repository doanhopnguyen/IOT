#pragma once
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <atomic>
#include <qrcode.h>
#include "setup_page.h"
#include <time.h>
#include <sys/time.h>

Preferences factoryPrefs,networkPrefs,eventPrefs;
WiFiClient localTransport;
WiFiClientSecure tlsTransport;
PubSubClient broker(localTransport);
WebServer setupWeb(80);
String deviceUid,deviceSecret,brokerHost,brokerUser,brokerPassword,brokerCa,wifiSsid,wifiPassword;
String setupSsid,setupPassword,setupCsrf,serialLine,requestNonce;
String resetReceipt,remoteEnrollUuid,activationCode;
String rfidScanUuid;uint32_t rfidScanStarted=0;
DNSServer setupDns;
bool setupApActive=false;
uint32_t setupConnectStarted=0,setupApCloseAt=0,lastConfigAt=0;
uint8_t setupBadPins=0;uint32_t setupBlockedAt=0;
String setupScanCache;bool setupScanPending=false,serialScanPending=false;uint32_t setupScanStarted=0,setupScanFinished=0;
std::atomic<int> setupScanEventStatus{-1},setupScanEventCount{-1};
uint32_t generation=1,lastBrokerAttempt=0,lastStatusAt=0,lastEventAt=0,lastWifiAttempt=0;
bool brokerTls=true,benchLan=false,claimed=false,networkPage=false,resetPending=false;
uint16_t brokerPort=8883;
uint16_t remoteSlot=0;uint8_t remoteStage=0;uint32_t remoteStarted=0,remotePollAt=0;
uint16_t queueHead=0,queueTail=0;uint32_t droppedEvents=0;
uint32_t lastSensorRetry=0;

String randomId() {
  uint8_t b[16];esp_fill_random(b,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  char out[37];snprintf(out,sizeof(out),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);return out;
}
String factoryMac() {uint8_t bytes[6];esp_efuse_mac_get_default(bytes);char out[13];for(int i=0;i<6;i++)snprintf(out+i*2,3,"%02X",bytes[i]);return out;}
String topic(const char *suffix){return "smartdoor-iot/"+deviceUid+"/"+suffix;}
bool connectedManaged(){return claimed;}
bool connectedAccessReady(){return claimed && !resetPending;}
bool connectedIsEnrolling(){return remoteStage!=0 || !rfidScanUuid.isEmpty();}
bool publishDocument(const char *suffix,JsonDocument &doc) {
  doc["deviceSecret"]=deviceSecret;doc["generation"]=generation;
  String payload;serializeJson(doc,payload);return broker.publish(topic(suffix).c_str(),payload.c_str(),false);
}
void sendAck(const String &uuid,bool success,const String &message,bool remember=true) {
  DynamicJsonDocument doc(512);doc["commandUuid"]=uuid;doc["success"]=success;doc["message"]=message;
  if(remember){String value;serializeJson(doc,value);unsigned n=eventPrefs.getUInt("ackpos",0)%16;
    if(!eventPrefs.putString(("ack"+String(n)).c_str(),value))storageFault=true;
    eventPrefs.putUInt("ackpos",n+1);eventPrefs.remove("started");}
  publishDocument("ack",doc);
}
void connectedRecord(const char *method,bool granted,const char *uid,int fingerId) {
  if(!claimed || resetPending || deviceUid.isEmpty())return;
  DynamicJsonDocument doc(512);doc["eventUuid"]=randomId();doc["method"]=method;
  doc["result"]=granted?"GRANTED":"DENIED";time_t now=time(nullptr);doc["occurredAt"]=now>1700000000?now:0;
  if(uid && *uid)doc["rfidUid"]=uid;if(fingerId>=0)doc["templateId"]=fingerId;
  uint16_t next=(queueTail+1)%64;
  if(next==queueHead){eventPrefs.remove(("ev"+String(queueHead)).c_str());queueHead=(queueHead+1)%64;eventPrefs.putUShort("head",queueHead);droppedEvents++;eventPrefs.putUInt("dropped",droppedEvents);}
  String value;serializeJson(doc,value);
  if(!eventPrefs.putString(("ev"+String(queueTail)).c_str(),value)){storageFault=true;return;}
  queueTail=next;eventPrefs.putUShort("tail",queueTail);
}
void enableSetupAp() {
  if(setupApActive)return;
  setupSsid="SmartDoor-"+factoryMac().substring(6);
  if(setupPassword.isEmpty())setupPassword=factoryPrefs.getString("setupKey","");
  if(setupPassword.length()<8){setupPassword=randomId().substring(0,12);factoryPrefs.putString("setupKey",setupPassword);}
  WiFi.mode(WIFI_AP_STA);WiFi.setSleep(false);WiFi.softAP(setupSsid.c_str(),setupPassword.c_str());
  setupDns.start(53,"*",WiFi.softAPIP());setupApActive=true;
}
String productQr() {
  if(activationCode.isEmpty() || claimed)return "";
  return "smartdoor://activate?code="+activationCode+"&uid="+deviceUid+"&ssid="+setupSsid+"&key="+setupPassword;
}
void connectedNetworkPage() {
  enableSetupAp();networkPage=true;screen=DEVICE_STATUS;title("SMART DOOR SETUP");
  row(33,deviceUid.isEmpty()?"ESP32-"+factoryMac():deviceUid);
  String value=productQr();
  if(!value.isEmpty()){
    QRCode qr;uint8_t data[qrcode_getBufferSize(8)];
    if(qrcode_initText(&qr,data,8,ECC_LOW,value.c_str())==0){
      const int scale=3,x=34,y=54;tft.fillRect(x,y,171,171,WHITE);
      for(int r=0;r<qr.size;r++)for(int c=0;c<qr.size;c++)if(qrcode_getModule(&qr,c,r))tft.fillRect(x+(c+4)*scale,y+(r+4)*scale,scale,scale,BLACK);
    }else row(90,"Use the QR label on product",YELLOW);
  }else {row(85,claimed?"Door already activated":"Factory setup not completed",YELLOW);row(115,"Use setup Wi-Fi below");}
  row(234,"Wi-Fi: "+setupSsid,CYAN);row(254,"Key: "+setupPassword,YELLOW);
  row(274,"Browser: 192.168.4.1");button(5,295,230,22,cfg.touch.valid?"SETUP ON SCREEN":"TOUCH SCREEN TO SETUP");
}
bool connectedSetupTouch(int x,int y) {
  if(!networkPage || screen!=DEVICE_STATUS)return false;
  if(!cfg.touch.valid || y>=290){networkPage=false;if(!cfg.touch.valid)beginCalibration();else if(!cfg.admin.valid)go(SET_ADMIN);else if(!configured())go(ADMIN_LOGIN);else go(HOME);}
  return true;
}
bool localHttp(){return setupApActive && setupWeb.client().localIP()==WiFi.softAPIP();}
void setupReply(int code,const String &message){DynamicJsonDocument doc(384);doc["message"]=message;String body;serializeJson(doc,body);setupWeb.sendHeader("Cache-Control","no-store");setupWeb.send(code,"application/json",body);}
bool setupAuthorized() {
  if(!localHttp() || resetPending || storageFault || setupWeb.arg("csrf")!=setupCsrf){setupReply(403,"Phiên thiết lập không hợp lệ. Mở lại trang tại cửa.");return false;}
  if(!cfg.admin.valid)return true;
  if(setupBadPins>=5 && millis()-setupBlockedAt<30000){setupReply(429,"Nhập sai PIN nhiều lần. Vui lòng chờ 30 giây.");return false;}
  if(!pinMatches(cfg.admin,setupWeb.arg("adminAuth"))){setupBadPins++;setupBlockedAt=millis();setupReply(403,"PIN quản trị hiện tại chưa đúng.");return false;}
  setupBadPins=0;return true;
}
void startSetupScan(bool refresh) {
  if(setupScanPending)return;
  if(!setupScanCache.isEmpty() && (!refresh || millis()-setupScanFinished<2000))return;
  WiFi.scanDelete();setupScanEventStatus=-1;setupScanEventCount=-1;setupScanStarted=millis();int result=WiFi.scanNetworks(true,false,false,600);
  setupScanPending=result==WIFI_SCAN_RUNNING;
  if(!setupScanPending){setupScanCache="{\"scanning\":false,\"networks\":[],\"message\":\"Chưa quét được Wi-Fi, hãy bấm tìm lại.\"}";setupScanFinished=millis();}
}
void pollSetupScan() {
  if(!setupScanPending)return;int count=WiFi.scanComplete();
  if(count<0 && millis()-setupScanStarted<22000)return;
  DynamicJsonDocument doc(6144);doc["scanning"]=false;JsonArray rows=doc.createNestedArray("networks");bool testNetwork=false;
  if(count>=0)for(int i=0;i<count && rows.size()<32;i++){
    String ssid=WiFi.SSID(i);if(ssid.isEmpty())continue;bool duplicate=false;
    for(JsonObject prior:rows)if(prior["ssid"].as<String>()==ssid){duplicate=true;break;}if(duplicate)continue;
    JsonObject n=rows.createNestedObject();n["ssid"]=ssid;n["rssi"]=WiFi.RSSI(i);n["secured"]=WiFi.encryptionType(i)!=WIFI_AUTH_OPEN;if(ssid=="PTIT_B2")testNetwork=true;
  }
  if(count<0)doc["message"]="Tìm Wi-Fi chưa thành công, hãy bấm tìm lại.";
  setupScanCache="";serializeJson(doc,setupScanCache);setupScanPending=false;setupScanFinished=millis();WiFi.scanDelete();
  if(serialScanPending){Serial.printf("FACTORY_SCAN raw=%d count=%u testNetworkFound=%d event=%d eventCount=%d mode=%d apClients=%u\n",count,unsigned(rows.size()),testNetwork,setupScanEventStatus.load(),setupScanEventCount.load(),int(WiFi.getMode()),unsigned(WiFi.softAPgetStationNum()));serialScanPending=false;}
}
void startSetupWeb() {
  setupCsrf=randomId();if(!claimed||wifiSsid.isEmpty())enableSetupAp();
  setupWeb.on("/",HTTP_GET,[]{if(!localHttp()){setupReply(403,"Kết nối mạng thiết lập của cửa để tiếp tục.");return;}setupWeb.sendHeader("Cache-Control","no-store");setupWeb.send_P(200,"text/html; charset=utf-8",SETUP_PAGE);});
  setupWeb.on("/api/setup/status",HTTP_GET,[]{
    if(!localHttp()){setupReply(403,"Kết nối mạng thiết lập của cửa.");return;}
    DynamicJsonDocument doc(768);doc["deviceUid"]=deviceUid;doc["csrf"]=setupCsrf;doc["adminPinSet"]=cfg.admin.valid;
    bool connected=WiFi.status()==WL_CONNECTED && WiFi.SSID()==wifiSsid;
    doc["wifiConnected"]=connected;doc["ssid"]=wifiSsid;doc["connecting"]=!connected&&setupConnectStarted&&millis()-setupConnectStarted<35000;
    doc["localReady"]=configured();doc["activated"]=claimed;String body;serializeJson(doc,body);setupWeb.sendHeader("Cache-Control","no-store");setupWeb.send(200,"application/json",body);
  });
  setupWeb.on("/api/wifi/scan",HTTP_GET,[]{
    if(!localHttp()){setupReply(403,"Kết nối mạng thiết lập của cửa.");return;}
    startSetupScan(setupWeb.arg("refresh")=="1");
    setupWeb.sendHeader("Cache-Control","no-store");setupWeb.send(200,"application/json",setupScanPending?"{\"scanning\":true}":setupScanCache);

  });
  setupWeb.on("/setup",HTTP_POST,[]{
    if(!setupAuthorized())return;String ssid=setupWeb.arg("ssid"),password=setupWeb.arg("password");
    if(ssid.isEmpty()||ssid.length()>32||password.length()>63||(!password.isEmpty()&&password.length()<8)){setupReply(400,"Tên Wi-Fi hoặc mật khẩu chưa hợp lệ.");return;}
    wifiSsid=ssid;wifiPassword=password;setupConnectStarted=millis();WiFi.begin(ssid.c_str(),password.c_str());
    setupReply(200,"Đang kết nối Wi-Fi. Chỉ lưu khi kết nối thành công.");
  });
  setupWeb.on("/api/setup/pin",HTTP_POST,[]{
    if(!setupAuthorized())return;String pin=setupWeb.arg("doorPin"),admin=setupWeb.arg("adminPin");
    bool valid=pin.length()==6 && pin==setupWeb.arg("doorConfirm");for(char c:pin)valid=valid&&isdigit(c);
    if(!cfg.admin.valid){valid=valid && admin.length()==6 && admin==setupWeb.arg("adminConfirm");for(char c:admin)valid=valid&&isdigit(c);}
    if(!valid){setupReply(400,"PIN cần đủ 6 chữ số và hai lần nhập phải giống nhau.");return;}
    Config next=cfg;next.user=makePin(pin);if(!cfg.admin.valid)next.admin=makePin(admin);
    if(!saveConfig(next)){setupReply(500,"Chưa lưu được PIN. Kiểm tra thiết bị rồi thử lại.");return;}
    setupReply(200,"Đã lưu PIN tại cửa. Tiếp tục hiệu chỉnh cảm ứng và cảm biến trên màn hình sản phẩm.");
  });
  setupWeb.on("/api/setup/finish",HTTP_POST,[]{
    if(!setupAuthorized())return;if(WiFi.status()!=WL_CONNECTED){setupReply(409,"Cửa chưa kết nối Wi-Fi. Kiểm tra lại trước khi hoàn tất.");return;}
    setupApCloseAt=millis()+3000;setupReply(200,"Đã lưu Wi-Fi. Mạng thiết lập sẽ tắt; mở lại Smart Door để hoàn tất nhận cửa.");
  });
  setupWeb.onNotFound([]{if(localHttp()){setupWeb.sendHeader("Location","http://192.168.4.1/",true);setupWeb.send(302,"text/plain","");}else setupReply(403,"Kết nối mạng thiết lập của cửa.");});
  setupWeb.begin();
}
bool privateHost(const String &host) {IPAddress ip;if(!ip.fromString(host))return false;return ip[0]==10||(ip[0]==192&&ip[1]==168)||(ip[0]==172&&ip[1]>=16&&ip[1]<=31);}
bool loadFactoryJson(JsonDocument &doc) {
  String uid=doc["deviceUid"]|"";String mac=doc["factoryMac"]|"";mac.replace(":","");mac.toUpperCase();
  if(mac!=factoryMac() || uid!="ESP32-"+factoryMac() || String(doc["deviceSecret"]|"").length()<24)return false;
  deviceUid=uid;deviceSecret=doc["deviceSecret"].as<String>();brokerHost=doc["mqttHost"]|"";
  brokerUser=doc["mqttUser"]|uid;brokerPassword=doc["mqttPassword"]|"";brokerCa=doc["mqttCa"]|"";
  brokerTls=doc["mqttTls"]|true;benchLan=doc["allowLocalPlaintext"]|false;
  brokerPort=doc["mqttPort"]|(brokerTls?8883:1884);
  activationCode=doc["activationCode"]|"";String key=doc["setupPassword"]|"";if(key.length()>=8&&key.length()<=63)setupPassword=key;
  return true;
}
void finishRemoteEnroll(bool success,const String &message) {
  String uuid=remoteEnrollUuid;remoteStage=0;remoteEnrollUuid="";fingerHeld=true;
  sendAck(uuid,success,message);tell(message);
}
void pollRemoteEnroll() {
  if(!remoteStage || millis()-remotePollAt<200)return;remotePollAt=millis();
  if(millis()-remoteStarted>=45000){finishRemoteEnroll(false,"ENROLL_TIMEOUT");return;}
  uint8_t r=finger.getImage();
  if(r==FINGERPRINT_NOFINGER){if(remoteStage==2){remoteStage=3;tell("Scan SAME finger #2");}return;}
  if(r!=FINGERPRINT_OK || remoteStage==2)return;
  if(finger.image2Tz(remoteStage==1?1:2)!=FINGERPRINT_OK){tell("Lift finger and try again");return;}
  if(remoteStage==1){remoteStage=2;tell("Lift finger completely");return;}
  if(finger.createModel()!=FINGERPRINT_OK){finishRemoteEnroll(false,"FINGER_MISMATCH");return;}
  if(!slotEmpty(remoteSlot)){finishRemoteEnroll(false,"SLOT_OCCUPIED_OR_UNREADABLE");return;}
  if(finger.storeModel(remoteSlot)!=FINGERPRINT_OK){finishRemoteEnroll(false,"SENSOR_STORE_FAILED");return;}
  finishRemoteEnroll(true,"ENROLLED");
}
void executeReset(const String &uuid,uint32_t nextGeneration) {
  resetPending=true;
  if(!fingerReady)probeSensors();
  if(!fingerReady || finger.emptyDatabase()!=FINGERPRINT_OK || finger.getTemplateCount()!=FINGERPRINT_OK || finger.templateCount!=0) {
    sendAck(uuid,false,"FINGERPRINT_ERASE_NOT_VERIFIED");return;
  }
  // Keep only factory identity and reset receipt; no local user credentials survive.
  if(!nvs.clear() || !networkPrefs.clear() || !eventPrefs.clear()) {sendAck(uuid,false,"RESET_STORAGE_FAILED",false);return;}
  queueHead=queueTail=0;
  if(actuatorReady){xSemaphoreTake(motorMutex,portMAX_DELAY);motor.enabled=false;motor.pending=false;servo.detach();xSemaphoreGive(motorMutex);}
  cfg={};cfg.magic=CONFIG_MAGIC;cfg.version=1;cfg.closedLevel=-1;cfg.lockAngle=30;cfg.openAngle=100;
  resetReceipt=uuid;
  if(!factoryPrefs.putString("resetAck",uuid) || !factoryPrefs.putUInt("nextGen",nextGeneration)) {sendAck(uuid,false,"RESET_STORAGE_FAILED",false);return;}
  sendAck(uuid,true,"RESET_EMPTY_VERIFIED",false);
  tell("Reset pending backend confirmation");
}
void handleBroker(char *incoming,uint8_t *bytes,unsigned length) {
  if(length>14000)return;DynamicJsonDocument doc(16384);if(deserializeJson(doc,bytes,length))return;
  String incomingTopic(incoming);
  if(incomingTopic==topic("ack-confirm")) {
    String uuid=doc["commandUuid"]|"";
    if(!resetReceipt.isEmpty()&&uuid==resetReceipt){
      generation=factoryPrefs.getUInt("nextGen",generation+1);factoryPrefs.putUInt("gen",generation);
      factoryPrefs.remove("resetAck");resetReceipt="";claimed=false;factoryPrefs.putBool("claimed",false);
      broker.disconnect();WiFi.disconnect(true);delay(200);ESP.restart();
    }
    for(int i=0;i<16;i++){String key="ack"+String(i);DynamicJsonDocument saved(512);if(!deserializeJson(saved,eventPrefs.getString(key.c_str(),""))&&saved["commandUuid"].as<String>()==uuid)eventPrefs.remove(key.c_str());}
    return;
  }
  if(incomingTopic==topic("access-ack")) {
    if(queueHead!=queueTail){String key="ev"+String(queueHead);DynamicJsonDocument first(512);
      if(!deserializeJson(first,eventPrefs.getString(key.c_str(),""))&&first["eventUuid"].as<String>()==doc["eventUuid"].as<String>()){
        eventPrefs.remove(key.c_str());queueHead=(queueHead+1)%64;eventPrefs.putUShort("head",queueHead);}}
    return;
  }
  if(incomingTopic==topic("config")) {
    if(doc["requestId"].as<String>()!=requestNonce)return;
    if(doc["serverTime"].as<long long>()>1700000000){timeval tv{(time_t)doc["serverTime"].as<long long>(),0};settimeofday(&tv,nullptr);}
    if(doc["generationMismatch"]|false){claimed=false;factoryPrefs.putBool("claimed",false);tell("Generation mismatch - service required");return;}
    if(doc["generation"].as<uint32_t>()!=generation)return;
    if(doc.containsKey("resetCommand")){executeReset(doc["resetCommand"].as<String>(),generation+1);return;}
    claimed=doc["claimed"]|false;factoryPrefs.putBool("claimed",claimed);
    if(!claimed)return;
    Config next=cfg;next.cardCount=0;next.fingerCount=0;
    for(JsonVariant v:doc["rfid"].as<JsonArray>()){
      String uid=v.as<String>();uid.replace(":","");uid.toUpperCase();
      if((uid.length()!=8&&uid.length()!=14&&uid.length()!=20)||next.cardCount>=MAX_CARDS)continue;
      Card card{};card.size=uid.length()/2;bool valid=true;
      for(int i=0;i<card.size;i++){char hex[3]={uid[i*2],uid[i*2+1],0};if(!isxdigit(hex[0])||!isxdigit(hex[1])){valid=false;break;}card.bytes[i]=strtoul(hex,nullptr,16);}
      if(valid)next.cards[next.cardCount++]=card;
    }
    for(JsonVariant v:doc["fingerprints"].as<JsonArray>()){int id=v.as<int>();if(id>0&&id<256&&next.fingerCount<MAX_FINGERS)next.fingers[next.fingerCount++]=id;}
    if(memcmp(next.cards,cfg.cards,sizeof(cfg.cards)) || memcmp(next.fingers,cfg.fingers,sizeof(cfg.fingers)) ||next.cardCount!=cfg.cardCount||next.fingerCount!=cfg.fingerCount)saveConfig(next);
    return;
  }
  if(incomingTopic!=topic("cmd"))return;
  String uuid=doc["commandUuid"]|"",type=doc["commandType"]|"";
  if(uuid.length()!=36||doc["data"]["generation"].as<uint32_t>()!=generation){sendAck(uuid,false,"GENERATION_MISMATCH",false);return;}
  for(int i=0;i<16;i++){DynamicJsonDocument saved(512);if(!deserializeJson(saved,eventPrefs.getString(("ack"+String(i)).c_str(),""))&&saved["commandUuid"].as<String>()==uuid){publishDocument("ack",saved);return;}}
  if(eventPrefs.getString("started","")==uuid){if(remoteEnrollUuid!=uuid && rfidScanUuid!=uuid)sendAck(uuid,false,"INTERRUPTED_COMMAND");return;}
  time_t now=time(nullptr);long long issued=doc["issuedAt"]|0LL;int ttl=doc["ttlSec"]|0;
  if(now<1700000000 || issued>now+5 || ttl<1 || ttl>60 || now-issued>ttl){sendAck(uuid,false,"EXPIRED_OR_CLOCK_INVALID");return;}
  if(!eventPrefs.putString("started",uuid)){sendAck(uuid,false,"STORAGE_ERROR",false);return;}
  if(type=="DEVICE_RESET"){executeReset(uuid,doc["data"]["nextGeneration"]|generation+1);return;}
  if(!claimed || resetPending){sendAck(uuid,false,"NOT_READY");return;}
  if(type=="RFID_SCAN") {
    if(remoteStage || !rfidScanUuid.isEmpty() || !rfidReady || !configured() || screen!=HOME){sendAck(uuid,false,"RFID_BUSY_OR_NOT_READY");return;}
    rfidScanUuid=uuid;rfidScanStarted=millis();tell("Tap card for mobile registration");return;
  }
  if(type=="DOOR_UNLOCK"){sendAck(uuid,requestOpen(),"UNLOCK_COMMAND");return;}
  if(type=="PIN_SET") {
    String pin=doc["data"]["pin"]|"";if(pin.length()!=6){sendAck(uuid,false,"INVALID_PIN");return;}
    for(char c:pin)if(!isdigit(c)){sendAck(uuid,false,"INVALID_PIN");return;}
    Config next=cfg;next.user=makePin(pin);sendAck(uuid,saveConfig(next),"PIN_UPDATED");return;
  }
  if(type=="FP_DELETE") {int slot=doc["data"]["templateId"]|0;bool ok=fingerReady&&slot>0&&slot<256&&finger.deleteModel(slot)==FINGERPRINT_OK;sendAck(uuid,ok,"FINGER_DELETE");return;}
  if(type=="FP_ENROLL") {
    int slot=doc["data"]["templateId"]|0;
    if(remoteStage||!rfidScanUuid.isEmpty()||!fingerReady||slot<1||slot>=min(int(finger.capacity),256)||!slotEmpty(slot)){sendAck(uuid,false,"INVALID_OR_OCCUPIED_SLOT");return;}
    remoteEnrollUuid=uuid;remoteSlot=slot;remoteStage=1;remoteStarted=millis();tell("Scan finger #1 for mobile request");return;
  }
  sendAck(uuid,false,"UNSUPPORTED_COMMAND");
}
void connectedSetup() {
  factoryPrefs.begin("doorfactory",false);networkPrefs.begin("doornetwork",false);eventPrefs.begin("doorevents",false);
  String json=factoryPrefs.getString("config","");DynamicJsonDocument doc(8192);
  if(!json.isEmpty() && !deserializeJson(doc,json))loadFactoryJson(doc);
  generation=factoryPrefs.getUInt("gen",1);claimed=factoryPrefs.getBool("claimed",false);
  resetReceipt=factoryPrefs.getString("resetAck","");resetPending=!resetReceipt.isEmpty();
  queueHead=eventPrefs.getUShort("head",0);queueTail=eventPrefs.getUShort("tail",0);droppedEvents=eventPrefs.getUInt("dropped",0);
  wifiSsid=networkPrefs.getString("ssid","");wifiPassword=networkPrefs.getString("password","");
  broker.setBufferSize(16384);broker.setSocketTimeout(2);broker.setCallback(handleBroker);
  WiFi.onEvent([](WiFiEvent_t event,WiFiEventInfo_t info){if(event==ARDUINO_EVENT_WIFI_SCAN_DONE){setupScanEventStatus=info.wifi_scan_done.status;setupScanEventCount=info.wifi_scan_done.number;}});
  configTime(0,0,"pool.ntp.org","time.cloudflare.com");startSetupWeb();
  if(!wifiSsid.isEmpty())WiFi.begin(wifiSsid.c_str(),wifiPassword.c_str());else connectedNetworkPage();
  Serial.println("CONNECTED_READY factoryMac="+factoryMac());
}
void handleFactorySerial() {
  while(Serial.available()){
    char c=Serial.read();if(c!='\n'){if(serialLine.length()<8000)serialLine+=c;continue;}
    if(serialLine.startsWith("FACTORY ") && deviceSecret.isEmpty()) {
      DynamicJsonDocument doc(8192);String value=serialLine.substring(8);
      if(!deserializeJson(doc,value)&&String(doc["activationCode"]|"").length()>=24&&String(doc["setupPassword"]|"").length()>=8&&loadFactoryJson(doc)){
        if(doc.containsKey("wifiSsid")){networkPrefs.putString("ssid",doc["wifiSsid"].as<String>());networkPrefs.putString("password",doc["wifiPassword"]|"");}
        factoryPrefs.putUInt("gen",doc["generation"]|1);
        doc.remove("wifiSsid");doc.remove("wifiPassword");value="";serializeJson(doc,value);
        if(!factoryPrefs.putString("config",value)){Serial.println("FACTORY_STORAGE_FAILED");serialLine="";return;}
        Serial.println("FACTORY_PROVISIONED "+factoryMac());Serial.flush();delay(200);ESP.restart();
      } else Serial.println("FACTORY_REJECTED");
    } else if(serialLine=="SCAN_WIFI") {setupScanCache="";serialScanPending=true;startSetupScan(true);
    } else if(serialLine=="INFO") {
      while(fpSerial.available())fpSerial.read();
      bool authenticated=finger.verifyPassword();
      int parameterStatus=authenticated?finger.getParameters():-1;
      fingerReady=authenticated&&parameterStatus==FINGERPRINT_OK;
      uint8_t bitmap[32];bool bitmapOk=readFingerBitmap(bitmap);MotorState state=snapshot();
      bool countOk=finger.getTemplateCount()==FINGERPRINT_OK;
      Serial.println("FACTORY_INFO mac="+factoryMac()+" uid="+deviceUid+" gen="+String(generation)+" wifi="+String(WiFi.status())+" mqtt="+String(broker.connected())+
        " fingerReady="+String(fingerReady)+" authenticated="+String(authenticated)+" parameters="+String(parameterStatus)+" capacity="+String(finger.capacity)+" bitmapOK="+String(bitmapOk)+" slot1empty="+String(bitmapOk&&!(bitmap[0]&2))+" templates="+String(countOk?int(finger.templateCount):-1)+
        " motorEnabled="+String(state.enabled)+" motorFault="+String(state.fault)+" released="+String(state.door.released)+" reedVerified="+String(sensorCycleVerified)+" productPrepared="+String(!deviceUid.isEmpty()&&activationCode.length()>=24&&setupPassword.length()>=8));
    }
    serialLine="";
  }
}
bool connectedCaptureCard(const String &uid) {
  if(rfidScanUuid.isEmpty())return false;
  String uuid=rfidScanUuid;rfidScanUuid="";
  if(resetPending || !claimed || millis()-rfidScanStarted>=30000){sendAck(uuid,false,"RFID_SCAN_EXPIRED");return true;}
  sendAck(uuid,true,"RFID_UID:"+uid);tell("Card read - confirm in mobile app");return true;
}
void connectedPoll() {
  if(!rfidScanUuid.isEmpty() && millis()-rfidScanStarted>=30000){String uuid=rfidScanUuid;rfidScanUuid="";sendAck(uuid,false,"RFID_SCAN_TIMEOUT");tell("Card scan timed out");}
  handleFactorySerial();pollSetupScan();if(setupApActive)setupDns.processNextRequest();setupWeb.handleClient();pollRemoteEnroll();
  if(setupApCloseAt && int32_t(millis()-setupApCloseAt)>=0){setupApCloseAt=0;setupDns.stop();WiFi.softAPdisconnect(true);setupApActive=false;networkPage=false;if(!cfg.touch.valid)beginCalibration();else if(!cfg.admin.valid)go(SET_ADMIN);else if(!configured())go(ADMIN_LOGIN);else go(HOME);}
  if(!fingerReady && !remoteStage && !resetPending && serialLine.isEmpty() && millis()-lastSensorRetry>15000){lastSensorRetry=millis();probeSensors();}
  if(WiFi.status()!=WL_CONNECTED){if(!wifiSsid.isEmpty() && millis()-lastWifiAttempt>20000){lastWifiAttempt=millis();WiFi.begin(wifiSsid.c_str(),wifiPassword.c_str());}return;}
  if(!resetPending && WiFi.SSID()==wifiSsid && (networkPrefs.getString("ssid","")!=wifiSsid || networkPrefs.getString("password","")!=wifiPassword)){networkPrefs.putString("ssid",wifiSsid);networkPrefs.putString("password",wifiPassword);}
  if(networkPage && !cfg.touch.valid){networkPage=false;beginCalibration();}
  if(brokerHost.isEmpty()||deviceSecret.isEmpty())return;
  if(!broker.connected() && millis()-lastBrokerAttempt>10000){
    lastBrokerAttempt=millis();
    if(brokerTls){if(brokerCa.isEmpty())return;tlsTransport.setCACert(brokerCa.c_str());tlsTransport.setTimeout(1500);broker.setClient(tlsTransport);}
    else {if(!benchLan||!privateHost(brokerHost))return;broker.setClient(localTransport);}
    broker.setServer(brokerHost.c_str(),brokerPort);
    if(broker.connect(deviceUid.c_str(),brokerUser.c_str(),brokerPassword.c_str()))for(const char *suffix:{"cmd","config","ack-confirm","access-ack"})broker.subscribe(topic(suffix).c_str(),1);
  }
  broker.loop();if(!broker.connected())return;
  if(!resetReceipt.isEmpty()&&millis()-lastStatusAt>3000){lastStatusAt=millis();sendAck(resetReceipt,true,"RESET_EMPTY_VERIFIED",false);return;}
  if(millis()-lastStatusAt>5000){
    lastStatusAt=millis();requestNonce=randomId();MotorState state=snapshot();DynamicJsonDocument status(768);
    status["requestId"]=requestNonce;status["localReady"]=configured();status["hasDoorPin"]=cfg.user.valid;status["fingerReady"]=fingerReady;
    if(sensorCycleVerified)status["doorClosed"]=isClosed(state,millis());else status["doorClosed"]=nullptr;
    status["unlocked"]=state.door.released;status["droppedEvents"]=droppedEvents;
    publishDocument("status",status);
    for(int i=0;i<16;i++){DynamicJsonDocument saved(512);if(!deserializeJson(saved,eventPrefs.getString(("ack"+String(i)).c_str(),"")))publishDocument("ack",saved);}
  }
  if(queueHead!=queueTail&&millis()-lastEventAt>1500){lastEventAt=millis();DynamicJsonDocument event(768);if(!deserializeJson(event,eventPrefs.getString(("ev"+String(queueHead)).c_str(),"")))publishDocument("access",event);}
}
