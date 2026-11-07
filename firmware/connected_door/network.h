#pragma once
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <atomic>
#include <qrcode.h>
#include "../include/credential_cleanup.h"
#include "../include/product_qr.h"
#include "../include/product_activation.h"
#include "../include/door_timing.h"
#include "../include/door_restriction.h"
#include "setup_page.h"
#include "setup_logic.h"
#include <time.h>
#include <sys/time.h>

Preferences factoryPrefs,networkPrefs,eventPrefs;
WiFiClient localTransport;
WiFiClientSecure tlsTransport;
PubSubClient broker(localTransport);
WebServer setupWeb(80);
String deviceUid,deviceSecret,brokerHost,brokerUser,brokerPassword,brokerCa,wifiSsid,wifiPassword;
static const uint8_t MAX_SAVED_WIFI=5;
String savedWifiSsids[MAX_SAVED_WIFI],savedWifiPasswords[MAX_SAVED_WIFI];
uint8_t savedWifiCount=0,wifiRetryIndex=0;
String setupSsid,setupPassword,setupCsrf,serialLine,requestNonce;
String resetReceipt,resetIntent,remoteEnrollUuid,activationCode;
uint32_t lastResetAttempt=0;
String rfidScanUuid;uint32_t rfidScanStarted=0;
DNSServer setupDns;
bool setupApActive=false;
uint32_t setupConnectStarted=0,setupApCloseAt=0,lastConfigAt=0;
uint8_t setupBadPins=0;uint32_t setupBlockedAt=0;
IPAddress setupAuthorizedClient;
String setupScanCache;bool setupScanPending=false,serialScanPending=false;uint32_t setupScanStarted=0,setupScanFinished=0;
std::atomic<int> setupScanEventStatus{-1},setupScanEventCount{-1};
uint32_t generation=1,lastBrokerAttempt=0,lastStatusAt=0,lastEventAt=0,lastWifiAttempt=0;
bool brokerTls=true,benchLan=false,claimed=false,networkPage=false,resetPending=false;
uint16_t brokerPort=8883;
uint16_t remoteSlot=0;uint8_t remoteStage=0;uint32_t remoteStarted=0,remotePollAt=0;
uint16_t queueHead=0,queueTail=0;uint32_t droppedEvents=0;
uint32_t lastSensorRetry=0;
bool appPinsReady=false;
uint32_t wifiPermitUntil=0,wifiOfflineSince=0,lastSetupDraw=0;
uint32_t lastStatusBarDraw=0;
String setupError;
// Thu hồi / admin tạm ngưng / chủ cửa tạm khóa. Cờ thu hồi nằm ở namespace riêng mà không hàm reset nào xóa.
Preferences retirePrefs;bool retirePrefsOpen=false;
DoorRestriction::Mode restriction=DoorRestriction::NORMAL;
String ownerCards=",",ownerFingers=",";

String randomId() {
  uint8_t b[16];esp_fill_random(b,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  char out[37];snprintf(out,sizeof(out),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);return out;
}
String factoryMac() {uint8_t bytes[6];esp_efuse_mac_get_default(bytes);char out[13];for(int i=0;i<6;i++)snprintf(out+i*2,3,"%02X",bytes[i]);return out;}
String savedWifiNameKey(uint8_t index){return "net"+String(index);}
String savedWifiPasswordKey(uint8_t index){return "key"+String(index);}
void persistSavedWifiNetworks() {
  bool ok=networkPrefs.putUChar("netCount",savedWifiCount)>0;
  for(uint8_t i=0;i<savedWifiCount;i++){
    ok=networkPrefs.putString(savedWifiNameKey(i).c_str(),savedWifiSsids[i])>0 && ok;
    ok=networkPrefs.putString(savedWifiPasswordKey(i).c_str(),savedWifiPasswords[i])>0 && ok;
  }
  if(savedWifiCount){
    ok=networkPrefs.putString("ssid",savedWifiSsids[0])>0 && ok;
    if(savedWifiPasswords[0].isEmpty())networkPrefs.remove("password");
    else ok=networkPrefs.putString("password",savedWifiPasswords[0])>0 && ok;
  }
  if(!ok)storageFault=true;
}
void loadSavedWifiNetworks() {
  savedWifiCount=0;uint8_t count=min(uint8_t(MAX_SAVED_WIFI),networkPrefs.getUChar("netCount",0));
  for(uint8_t i=0;i<count;i++){
    String ssid=networkPrefs.getString(savedWifiNameKey(i).c_str(),"");
    if(ssid.isEmpty())continue;
    savedWifiSsids[savedWifiCount]=ssid;
    savedWifiPasswords[savedWifiCount]=networkPrefs.getString(savedWifiPasswordKey(i).c_str(),"");
    savedWifiCount++;
  }
  if(!savedWifiCount){
    String legacySsid=networkPrefs.getString("ssid","");
    if(!legacySsid.isEmpty()){
      savedWifiSsids[0]=legacySsid;savedWifiPasswords[0]=networkPrefs.getString("password","");savedWifiCount=1;
      persistSavedWifiNetworks();
    }
  }
  if(savedWifiCount){wifiRetryIndex=0;wifiSsid=savedWifiSsids[0];wifiPassword=savedWifiPasswords[0];}
  else {wifiSsid="";wifiPassword="";wifiRetryIndex=0;}
}
void rememberSavedWifi(const String &ssid,const String &password) {
  if(ssid.isEmpty())return;
  int found=-1;for(uint8_t i=0;i<savedWifiCount;i++)if(savedWifiSsids[i]==ssid){found=i;break;}
  if(found==0 && savedWifiPasswords[0]==password){wifiSsid=ssid;wifiPassword=password;return;}
  uint8_t last=found>=0?uint8_t(found):min(uint8_t(savedWifiCount),uint8_t(MAX_SAVED_WIFI-1));
  for(uint8_t i=last;i>0;i--){savedWifiSsids[i]=savedWifiSsids[i-1];savedWifiPasswords[i]=savedWifiPasswords[i-1];}
  savedWifiSsids[0]=ssid;savedWifiPasswords[0]=password;
  if(found<0 && savedWifiCount<MAX_SAVED_WIFI)savedWifiCount++;
  wifiRetryIndex=0;wifiSsid=ssid;wifiPassword=password;persistSavedWifiNetworks();
}
void attemptSavedWifi(uint8_t index) {
  if(!savedWifiCount)return;
  wifiRetryIndex=index%savedWifiCount;wifiSsid=savedWifiSsids[wifiRetryIndex];wifiPassword=savedWifiPasswords[wifiRetryIndex];
  lastWifiAttempt=millis();WiFi.disconnect(false);WiFi.begin(wifiSsid.c_str(),wifiPassword.c_str());
}
String topic(const char *suffix){return "smartdoor-iot/"+deviceUid+"/"+suffix;}
bool connectedManaged(){return claimed;}
bool connectedAccessReady(){return !storageFault && SetupLogic::localAccessAllowed(claimed,appPinsReady,configured(),resetPending);}
bool connectedCredentialsReady(){return appPinsReady;}
void connectedDrawStatusBar(bool force) {
  if(!force && millis()-lastStatusBarDraw<1000)return;lastStatusBarDraw=millis();
  bool wifi=WiFi.status()==WL_CONNECTED,service=wifi && broker.connected(),local=connectedAccessReady();
  int rssi=wifi?WiFi.RSSI():-127,bars=wifi?SetupLogic::signalBars(rssi):0;
  tft.fillRect(0,0,240,14,BLACK);
  for(int i=0;i<4;i++){
    int height=3+i*3;uint16_t color=i<bars?(bars>1?GREEN:YELLOW):GRAY;
    tft.fillRect(4+i*5,13-height,3,height,color);
  }
  text(30,3,wifi?String(rssi)+"dBm":"WiFi OFF",wifi?WHITE:YELLOW);
  text(103,3,service?"NET":"NO SERVER",service?GREEN:YELLOW);
  if(restriction!=DoorRestriction::NORMAL){bool locked=restriction==DoorRestriction::LOCKDOWN;text(187,3,locked?"LOCKED":"SUSPEND",locked?YELLOW:RED);return;}
  text(187,3,local?(wifi&&service?"ONLINE":"OFFLINE"):"SETUP",local?GREEN:YELLOW);
}
bool connectedIsEnrolling(){return remoteStage!=0 || !rfidScanUuid.isEmpty();}
bool publishDocument(const char *suffix,JsonDocument &doc) {
  doc["deviceSecret"]=deviceSecret;doc["generation"]=generation;
  String payload;serializeJson(doc,payload);return broker.publish(topic(suffix).c_str(),payload.c_str(),false);
}
void sendAck(const String &uuid,bool success,const String &message,bool remember=true,int templateId=0) {
  DynamicJsonDocument doc(512);doc["commandUuid"]=uuid;doc["success"]=success;doc["message"]=message;
  if(templateId>0)doc["templateId"]=templateId; // Ô thực tế đã lưu vân tay (có thể khác ô backend đề nghị).
  if(remember){String value;serializeJson(doc,value);unsigned n=eventPrefs.getUInt("ackpos",0)%16;
    if(!eventPrefs.putString(("ack"+String(n)).c_str(),value))storageFault=true;
    eventPrefs.putUInt("ackpos",n+1);eventPrefs.remove("started");}
  publishDocument("ack",doc);
}
void connectedRecord(const char *method,bool granted,const char *uid,int fingerId,const char *reason) {
  if(!claimed || resetPending || deviceUid.isEmpty())return;
  DynamicJsonDocument doc(512);doc["eventUuid"]=randomId();doc["method"]=method;
  doc["result"]=granted?"GRANTED":"DENIED";time_t now=time(nullptr);doc["occurredAt"]=now>1700000000?now:0;
  if(uid && *uid)doc["rfidUid"]=uid;if(fingerId>=0)doc["templateId"]=fingerId;
  if(reason && *reason)doc["reason"]=reason; // LOCKDOWN: thẻ/vân tay hợp lệ bị chặn, không tính là xác thực sai
  uint16_t next=(queueTail+1)%64;
  if(next==queueHead){eventPrefs.remove(("ev"+String(queueHead)).c_str());queueHead=(queueHead+1)%64;eventPrefs.putUShort("head",queueHead);droppedEvents++;eventPrefs.putUInt("dropped",droppedEvents);}
  String value;serializeJson(doc,value);
  if(!eventPrefs.putString(("ev"+String(queueTail)).c_str(),value)){storageFault=true;return;}
  queueTail=next;eventPrefs.putUShort("tail",queueTail);
}
bool openRetirePrefs(){if(!retirePrefsOpen)retirePrefsOpen=retirePrefs.begin("doorretire",false);return retirePrefsOpen;}
bool connectedRetired(){return openRetirePrefs() && retirePrefs.getBool("retired",false);}
const char *connectedRestrictionNotice(){
  if(restriction==DoorRestriction::LOCKDOWN)return "Door locked by owner";
  if(restriction==DoorRestriction::SUSPENDED)return "Device suspended by admin";
  if(restriction==DoorRestriction::RETIRED)return "Device retired";
  return nullptr;
}
void setRestriction(DoorRestriction::Mode next){
  if(next==restriction)return;
  restriction=next;
  if(next!=DoorRestriction::RETIRED && !nvs.putUChar("restrict",uint8_t(next)))storageFault=true;
  lastStatusBarDraw=0;
  if(screen==HOME)tell(connectedRestrictionNotice()?connectedRestrictionNotice():"PIN / card / fingerprint");
}
bool connectedAllowsCard(const String &uid){return DoorRestriction::allowLocal(restriction,ownerCards.indexOf(","+uid+",")>=0);}
bool connectedAllowsFinger(int id){return DoorRestriction::allowLocal(restriction,ownerFingers.indexOf(","+String(id)+",")>=0);}
bool connectedAllowsPin(){return DoorRestriction::allowLocal(restriction,false);}
// Chặn cả lệnh mở từ menu quản trị khi admin tạm ngưng hoặc đã thu hồi; tạm khóa của chủ cửa không chặn ở đây.
bool connectedOpenBlocked(){return restriction==DoorRestriction::SUSPENDED || restriction==DoorRestriction::RETIRED;}
void saveOwners(JsonArrayConst cards,JsonArrayConst fingers){
  String c=",",f=",";
  for(JsonVariantConst v:cards){String uid=v.as<String>();uid.replace(":","");uid.toUpperCase();if(uid.length()>=8&&uid.length()<=20)c+=uid+",";}
  for(JsonVariantConst v:fingers){int id=v.as<int>();if(id>0&&id<256)f+=String(id)+",";}
  if(c!=ownerCards){ownerCards=c;if(!nvs.putString("ownerCards",c))storageFault=true;}
  if(f!=ownerFingers){ownerFingers=f;if(!nvs.putString("ownerFingers",f))storageFault=true;}
}
// Xóa PIN, thẻ, vân tay, Wi-Fi, secret. Gọi lại được: lần khởi động sau tiếp tục nếu mất điện giữa chừng.
bool retireWipe(){
  if(!fingerReady)probeSensors();
  bool ok=fingerReady && finger.emptyDatabase()==FINGERPRINT_OK;
  ok=nvs.clear() && ok;ok=eventPrefs.clear() && ok;ok=networkPrefs.clear() && ok;ok=factoryPrefs.clear() && ok;
  return ok;
}
void retireDevice(const String &uuid){
  // Ghi cờ trước mọi thao tác phá hủy.
  if(!openRetirePrefs() || !retirePrefs.putBool("retired",true))storageFault=true;
  restriction=DoorRestriction::RETIRED;adminSession=false;remoteStage=0;rfidScanUuid="";networkPage=false;
  if(actuatorReady){
    xSemaphoreTake(motorMutex,portMAX_DELAY);
    motor.door.released=false;motor.door.lockPending=false;motor.calibrating=false;
    if(motor.enabled && !motor.fault){motor.target=motor.lockAngle;motor.pending=true;}
    xSemaphoreGive(motorMutex);
    uint32_t started=millis();
    while(millis()-started<1500){MotorState m=snapshot();if(!m.pending && !m.pulsing)break;delay(20);}
    xSemaphoreTake(motorMutex,portMAX_DELAY);motor.enabled=false;motor.pending=false;servo.detach();xSemaphoreGive(motorMutex);
  }
  // Đang ở trong callback MQTT: không gọi broker.loop() lồng nhau; publish ghi thẳng ra socket.
  if(uuid.length()==36){sendAck(uuid,true,"DEVICE_RETIRED",false);delay(200);}
  retireWipe();
  broker.disconnect();WiFi.disconnect(true,true);delay(200);ESP.restart();
}
// Gọi đầu setup() khi cờ thu hồi đã bật: không Wi-Fi, không cảm biến mở cửa, không bao giờ trả về.
void connectedRetiredBoot(){
  restriction=DoorRestriction::RETIRED;
  nvs.begin("offlinedoor",false);factoryPrefs.begin("doorfactory",false);
  networkPrefs.begin("doornetwork",false);eventPrefs.begin("doorevents",false);
  bool wiped=retireWipe();
  tft.fillScreen(BLACK);
  text(10,120,"DEVICE RETIRED",RED,2);
  text(10,150,"Thiet bi da thu hoi",WHITE);
  text(10,170,"Access disabled permanently",WHITE);
  Serial.println(wiped?"DEVICE_RETIRED":"DEVICE_RETIRED wipe incomplete; retrying");
  for(;;){
    delay(5000);
    if(!wiped && (wiped=retireWipe()))Serial.println("DEVICE_RETIRED wipe complete");
  }
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
  if(setupPassword.isEmpty())return "";
  String ssid=setupSsid.isEmpty()?"SmartDoor-"+factoryMac().substring(6):setupSsid;
  return ProductQr::build<String>(claimed?String(""):activationCode,deviceUid,ssid,setupPassword,"Smart Door "+factoryMac().substring(6));
}
void drawSetupQrAndWifi() {
  title("SMART DOOR SETUP");
  String value=productQr();
  if(!value.isEmpty()){
    QRCode qr;uint8_t data[qrcode_getBufferSize(8)];
    if(qrcode_initText(&qr,data,8,ECC_LOW,value.c_str())==0){
      const int scale=3,x=34,y=42;tft.fillRect(x,y,171,171,WHITE);
      for(int r=0;r<qr.size;r++)for(int c=0;c<qr.size;c++)if(qrcode_getModule(&qr,c,r))tft.fillRect(x+(c+4)*scale,y+(r+4)*scale,scale,scale,BLACK);
    }else row(85,"Use the QR label on product",YELLOW);
  }else row(75,claimed?"Door already activated":"Factory setup not completed",YELLOW);
  row(226,"Wi-Fi: "+setupSsid,CYAN);row(246,"Key: "+setupPassword,YELLOW);
}
void connectedNetworkPage() {
  wifiPermitUntil=0;
  setupApCloseAt=WiFi.status()==WL_CONNECTED?millis()+600000:0;
  enableSetupAp();networkPage=true;screen=DEVICE_STATUS;drawSetupQrAndWifi();
  if(claimed)button(5,295,230,22,configured()?"BACK TO PIN / OFFLINE":cfg.touch.valid?"BACK":"SET WIFI, THEN USE MOBILE APP");
}
String setupStage() {
  return SetupLogic::stage(resetPending,WiFi.status()==WL_CONNECTED,broker.connected(),claimed,appPinsReady,
    cfg.touch.valid,sensorCycleVerified && cfg.closedLevel>=0,calStep,doorCalClosedSample>=0,networkPage,servoCycleVerified,servoSetup.step>0);
}
bool connectedContinueSetup() {
  if(resetPending){
    adminSession=false;networkPage=false;screen=APP_SETUP;title("FACTORY RESET");
    row(65,"Reset in progress",YELLOW);row(100,"Keep power and Wi-Fi connected");
    row(135,"Waiting for erase confirmation");row(180,"Setup restarts after reset");return true;
  }
  if(configured())return false;
  if(!claimed) {
    networkPage=false;
    if(screen!=APP_SETUP){screen=APP_SETUP;drawSetupQrAndWifi();}
    return true;
  }
  if(!appPinsReady) {
    if(adminSession && screen==ADMIN_LOGIN){connectedNetworkPage();return true;}
    screen=APP_SETUP;networkPage=false;title("SETUP IN MOBILE APP");
    row(60,WiFi.status()==WL_CONNECTED?"Wi-Fi connected":"Connect to SmartDoor Wi-Fi",YELLOW);
    row(90,broker.connected()?"Service connected":"Waiting for service connection");
    row(125,!claimed?"Claim this door in the app":"Set both PINs in the owner app");
    row(160,"Calibration starts after app setup");
    row(195,"Wi-Fi portal: 192.168.4.1");
    if(cfg.touch.valid && cfg.admin.valid)button(8,260,224,40,"ADMIN / CHANGE WI-FI");
    return true;
  }
  networkPage=false;adminSession=true;adminStarted=adminActivity=millis();
  if(!cfg.touch.valid)beginCalibration();
  else if(!sensorCycleVerified || cfg.closedLevel<0)go(DOOR_CAL);
  else if(!servoCycleVerified && screen!=SERVO_CAL)beginServoCalibration();
  return true;
}
bool connectedSetupTouch(int x,int y) {
  if(resetPending)return true;
  if(screen==APP_SETUP){if(cfg.touch.valid && cfg.admin.valid && y>=260)go(ADMIN_LOGIN);return true;}
  if(!networkPage || screen!=DEVICE_STATUS)return false;
  if(claimed && cfg.touch.valid && y>=290){networkPage=false;if(!connectedContinueSetup())go(HOME);}
  return true;
}
bool localHttp(){return setupApActive && setupWeb.client().localIP()==WiFi.softAPIP();}
void setupReply(int code,const String &message){DynamicJsonDocument doc(384);doc["message"]=message;String body;serializeJson(doc,body);setupWeb.sendHeader("Cache-Control","no-store");setupWeb.send(code,"application/json",body);}
bool setupPinAuthorized(){return !cfg.admin.valid || (wifiPermitUntil && int32_t(wifiPermitUntil-millis())>0 && setupWeb.client().remoteIP()==setupAuthorizedClient);}
bool setupAuthorized() {
  if(!localHttp() || resetPending || storageFault || setupWeb.arg("csrf")!=setupCsrf){setupReply(403,"Phiên thiết lập không hợp lệ. Mở lại trang tại cửa.");return false;}
  if(setupPinAuthorized())return true;
  setupReply(403,"Nhập đúng PIN admin trên trang này trước khi đổi mạng.");return false;
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
  auto captiveRedirect=[](){
    if(!localHttp()){setupReply(403,"Kết nối mạng thiết lập của cửa để tiếp tục.");return;}
    setupWeb.sendHeader("Cache-Control","no-store");setupWeb.sendHeader("Location","http://192.168.4.1/",true);setupWeb.send(302,"text/plain","");
  };
  setupWeb.on("/generate_204",HTTP_GET,captiveRedirect);setupWeb.on("/gen_204",HTTP_GET,captiveRedirect);
  setupWeb.on("/hotspot-detect.html",HTTP_GET,captiveRedirect);setupWeb.on("/library/test/success.html",HTTP_GET,captiveRedirect);
  setupWeb.on("/connecttest.txt",HTTP_GET,captiveRedirect);setupWeb.on("/ncsi.txt",HTTP_GET,captiveRedirect);
  setupWeb.on("/canonical.html",HTTP_GET,captiveRedirect);setupWeb.on("/success.txt",HTTP_GET,captiveRedirect);
  setupWeb.on("/api/setup/status",HTTP_GET,[]{
    if(!localHttp()){setupReply(403,"Kết nối mạng thiết lập của cửa.");return;}
    DynamicJsonDocument doc(1536);doc["deviceUid"]=deviceUid;doc["csrf"]=setupCsrf;
    doc["authorized"]=setupPinAuthorized();
    bool connected=WiFi.status()==WL_CONNECTED && WiFi.SSID()==wifiSsid;
    doc["wifiConnected"]=connected;doc["ssid"]=wifiSsid;doc["connecting"]=!connected&&setupConnectStarted&&millis()-setupConnectStarted<35000;
    doc["serviceConnected"]=broker.connected();doc["message"]=setupError;JsonArray saved=doc.createNestedArray("savedNetworks");
    for(uint8_t i=0;i<savedWifiCount;i++)saved.add(savedWifiSsids[i]);
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
    wifiSsid=ssid;wifiPassword=password;setupConnectStarted=millis();lastWifiAttempt=setupConnectStarted;setupError="";WiFi.disconnect(false);WiFi.begin(ssid.c_str(),password.c_str());
    if(claimed)wifiPermitUntil=0;
    setupReply(200,"Đang kết nối Wi-Fi. Chỉ lưu khi kết nối thành công.");
  });
  setupWeb.on("/api/wifi/authorize",HTTP_POST,[]{
    if(!localHttp() || resetPending || setupWeb.arg("csrf")!=setupCsrf){setupReply(403,"Phiên thiết lập không hợp lệ.");return;}
    if(setupBadPins>=5 && millis()-setupBlockedAt<30000){setupReply(429,"Nhập sai nhiều lần. Chờ 30 giây.");return;}
    if(!cfg.admin.valid || !pinMatches(cfg.admin,setupWeb.arg("adminAuth"))){setupBadPins++;setupBlockedAt=millis();setupReply(403,"PIN quản trị chưa đúng.");return;}
    setupBadPins=0;setupAuthorizedClient=setupWeb.client().remoteIP();wifiPermitUntil=millis()+600000;setupReply(200,"PIN đúng. Bạn có thể thực hiện một lần đổi mạng.");
  });
  setupWeb.on("/api/setup/pin",HTTP_POST,[]{
    setupReply(410,"PIN chỉ được thiết lập trong ứng dụng của chủ cửa sau khi cửa đã online.");
  });
  setupWeb.on("/api/setup/finish",HTTP_POST,[]{
    if(!localHttp() || resetPending || setupWeb.arg("csrf")!=setupCsrf){setupReply(403,"Phiên thiết lập không hợp lệ.");return;}
    if(WiFi.status()!=WL_CONNECTED || WiFi.SSID()!=wifiSsid){setupReply(409,"Cửa chưa kết nối Wi-Fi đã chọn. Kiểm tra lại trước khi hoàn tất.");return;}
    setupApCloseAt=millis()+3000;setupReply(200,"Đã lưu Wi-Fi. Mạng thiết lập sẽ tắt; mở lại Smart Door để hoàn tất nhận cửa.");
  });
  setupWeb.onNotFound(captiveRedirect);
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
  sendAck(uuid,success,message,true,success?remoteSlot:0);tell(message);
}
// Dây UART cảm biến hay chập chờn: đọc bảng ô nhớ tối đa 3 lần trước khi kết luận lỗi.
bool readFingerBitmapRetry(uint8_t *bitmap) {
  for(int attempt=0;attempt<3;attempt++){if(readFingerBitmap(bitmap))return true;delay(80);}
  return false;
}
// Chọn ô lưu vân tay: ưu tiên ô backend đề nghị; nếu cảm biến còn mẫu cũ ở ô đó thì lấy ô trống đầu tiên
// không nằm trong danh sách ô backend đang dùng. Trả 0 nếu hết chỗ, -1 nếu không đọc được cảm biến.
int chooseEnrollSlot(int requested,JsonArrayConst used) {
  uint8_t bitmap[32];if(!readFingerBitmapRetry(bitmap))return -1;
  int limit=min(int(finger.capacity),256);
  auto empty=[&](int s){return s>0&&s<limit&&!(bitmap[s/8]&(1<<(s%8)));};
  auto taken=[&](int s){for(JsonVariantConst v:used)if((v|0)==s)return true;return false;};
  if(empty(requested)&&!taken(requested))return requested;
  for(int s=1;s<limit;s++)if(empty(s)&&!taken(s))return s;
  return 0;
}
void pollRemoteEnroll() {
  if(!remoteStage || millis()-remotePollAt<200)return;remotePollAt=millis();
  if(millis()-remoteStarted>=45000){finishRemoteEnroll(false,"ENROLL_TIMEOUT");return;}
  uint8_t r=finger.getImage();
  if(r==FINGERPRINT_NOFINGER){if(remoteStage==2){remoteStage=3;tell("Scan SAME finger #2");}return;}
  if(r==FINGERPRINT_PACKETRECIEVEERR || r==FINGERPRINT_TIMEOUT){fingerReady=false;finishRemoteEnroll(false,"SENSOR_COMMUNICATION_FAILED");return;}
  if(r!=FINGERPRINT_OK || remoteStage==2)return;
  if(finger.image2Tz(remoteStage==1?1:2)!=FINGERPRINT_OK){tell("Lift finger and try again");return;}
  if(remoteStage==1){
    uint8_t search=finger.fingerFastSearch();
    if(search==FINGERPRINT_OK){finishRemoteEnroll(false,"FINGER_ALREADY_ENROLLED");return;}
    if(search!=FINGERPRINT_NOTFOUND){finishRemoteEnroll(false,"SENSOR_SEARCH_FAILED");return;}
    remoteStage=2;tell("Lift finger completely");return;
  }
  if(finger.createModel()!=FINGERPRINT_OK){finishRemoteEnroll(false,"FINGER_MISMATCH");return;}
  uint8_t bitmap[32];
  if(!readFingerBitmapRetry(bitmap)){finishRemoteEnroll(false,"SENSOR_READ_FAILED");return;}
  if(bitmap[remoteSlot/8]&(1<<(remoteSlot%8))){finishRemoteEnroll(false,"SLOT_OCCUPIED");return;}
  if(finger.storeModel(remoteSlot)!=FINGERPRINT_OK){finishRemoteEnroll(false,"SENSOR_STORE_FAILED");return;}
  finishRemoteEnroll(true,"ENROLLED");
}
void executeMemberRemoval(const String &uuid,JsonObjectConst data) {
  uint64_t sequence=data["removalSequence"]|uint64_t(0);
  if(uuid.length()!=36 || !sequence || !data["fingerprints"].is<JsonArrayConst>() || !data["rfid"].is<JsonArrayConst>() || !data["preserveFingerprints"].is<JsonArrayConst>()) {
    sendAck(uuid,false,"INVALID_MEMBER_REMOVAL",false);return;
  }
  // Commands are serialized per controller. Keep a durable watermark even after ACK confirmation,
  // so an old configuration cannot erase a slot later reused by another member.
  if(sequence<=eventPrefs.getULong64("memberSeq",0)) {sendAck(uuid,true,"MEMBER_CREDENTIALS_REMOVED",false);return;}
  if(resetPending || remoteStage || rfidScanUuid.length()){sendAck(uuid,false,"DEVICE_BUSY",false);return;}
  JsonArrayConst slots=data["fingerprints"].as<JsonArrayConst>(),cards=data["rfid"].as<JsonArrayConst>();
  uint16_t requested[255];size_t count=0;
  for(JsonVariantConst v:slots){int slot=v|0;if(slot<1||slot>255||count>=255){sendAck(uuid,false,"INVALID_MEMBER_REMOVAL",false);return;}requested[count++]=slot;}
  bool preserve[256]={};
  for(JsonVariantConst v:data["preserveFingerprints"].as<JsonArrayConst>()){
    int slot=v|0;if(slot<1||slot>255){sendAck(uuid,false,"INVALID_MEMBER_REMOVAL",false);return;}preserve[slot]=true;
  }
  bool purge=data["purgeFingerprints"]|(count>0);
  Config next=cfg;next.cardCount=0;next.fingerCount=0;
  for(int i=0;i<cfg.cardCount;i++){
    String uid=cardName(cfg.cards[i]);bool removed=false;
    for(JsonVariantConst v:cards)if(v.as<String>()==uid){removed=true;break;}
    if(!removed)next.cards[next.cardCount++]=cfg.cards[i];
  }
  for(int i=0;i<cfg.fingerCount;i++){
    if(cfg.fingers[i]<256 && preserve[cfg.fingers[i]])next.fingers[next.fingerCount++]=cfg.fingers[i];
  }
  memset(next.cards+next.cardCount,0,sizeof(next.cards)-next.cardCount*sizeof(Card));
  memset(next.fingers+next.fingerCount,0,sizeof(next.fingers)-next.fingerCount*sizeof(uint16_t));
  if(!saveConfig(next)){sendAck(uuid,false,"CREDENTIAL_STORAGE_FAILED",false);return;}
  if(purge && !fingerReady)probeSensors();
  if(purge){
    uint8_t bitmap[32];
    if(!fingerReady || !readFingerBitmapRetry(bitmap)){sendAck(uuid,false,"FINGERPRINT_ERASE_NOT_VERIFIED",false);return;}
    count=0;for(int slot=1;slot<256;slot++)if(!preserve[slot] && (bitmap[slot/8]&(1u<<(slot%8))))requested[count++]=slot;
  }else count=0;
  if(!CredentialCleanup::eraseFingerprints(requested,count,
      [](uint8_t *bitmap){return readFingerBitmapRetry(bitmap);},
      [](uint16_t slot){return finger.deleteModel(slot)==FINGERPRINT_OK;})) {
    sendAck(uuid,false,"FINGERPRINT_ERASE_NOT_VERIFIED",false);return;
  }
  if(!eventPrefs.putULong64("memberSeq",sequence)){sendAck(uuid,false,"CREDENTIAL_STORAGE_FAILED",false);return;}
  sendAck(uuid,true,"MEMBER_CREDENTIALS_REMOVED",false);
}
void executeReset(const String &uuid,uint32_t nextGeneration) {
  if(uuid.length()!=36 || nextGeneration!=generation+1){sendAck(uuid,false,"RESET_INVALID_GENERATION",false);return;}
  if(resetIntent.length() && resetIntent!=uuid){sendAck(uuid,false,"RESET_ALREADY_RUNNING",false);return;}
  resetPending=true;
  lastResetAttempt=millis();adminSession=false;remoteStage=0;rfidScanUuid="";networkPage=false;
  if(actuatorReady){xSemaphoreTake(motorMutex,portMAX_DELAY);motor.enabled=false;motor.pending=false;motor.calibrating=false;motor.pulsing=false;servo.detach();xSemaphoreGive(motorMutex);}
  // Persist intent before destructive work. Boot/poll resumes it after a power loss.
  if(!factoryPrefs.putUInt("nextGen",nextGeneration) || !factoryPrefs.putString("resetIntent",uuid)) {
    storageFault=true;sendAck(uuid,false,"RESET_STORAGE_FAILED",false);return;
  }
  resetIntent=uuid;
  if(!fingerReady)probeSensors();
  if(!fingerReady || finger.emptyDatabase()!=FINGERPRINT_OK || finger.getTemplateCount()!=FINGERPRINT_OK || finger.templateCount!=0) {
    sendAck(uuid,false,"FINGERPRINT_ERASE_NOT_VERIFIED",false);return;
  }
  // Keep the network only until the server commits the reset, so a reboot can
  // reconnect and resend the erase receipt. Commit then wipes Wi-Fi as well.
  if(!nvs.clear() || !eventPrefs.clear()) {sendAck(uuid,false,"RESET_STORAGE_FAILED",false);return;}
  queueHead=queueTail=0;droppedEvents=0;
  cfg={};cfg.magic=CONFIG_MAGIC;cfg.version=3;cfg.servoRange=180;cfg.closedLevel=-1;cfg.lockAngle=100;cfg.openAngle=30;
  appPinsReady=false;sensorCycleVerified=false;servoCycleVerified=false;
  digits="";firstPin="";notice="";enrollStage=0;enrollSlot=0;
  selectedCard=Card{};selectedFinger=0;pendingCal=Calibration{};
  doorCalClosedSample=-1;servoSetup=ServoSetup::State{};
  if(!factoryPrefs.putString("resetAck",uuid)) {sendAck(uuid,false,"RESET_STORAGE_FAILED",false);return;}
  resetReceipt=uuid;go(APP_SETUP);
  sendAck(uuid,true,"RESET_EMPTY_VERIFIED",false);
  tell("Reset pending backend confirmation");
}
bool finishResetCommit() {
  if(!factoryPrefs.getBool("resetCommit",false))return false;
  uint32_t next=factoryPrefs.getUInt("nextGen",generation);
  if(!factoryPrefs.putUInt("gen",next) || !factoryPrefs.putBool("claimed",false) ||
     !nvs.clear() || !eventPrefs.clear() || !networkPrefs.clear())return false;
  generation=next;claimed=false;wifiSsid="";wifiPassword="";
  factoryPrefs.remove("resetAck");factoryPrefs.remove("resetIntent");
  factoryPrefs.remove("resetCommit");factoryPrefs.remove("nextGen");
  resetReceipt="";resetIntent="";return true;
}
void handleBroker(char *incoming,uint8_t *bytes,unsigned length) {
  if(length>14000)return;DynamicJsonDocument doc(16384);if(deserializeJson(doc,bytes,length))return;
  String incomingTopic(incoming);
  if(incomingTopic==topic("ack-confirm")) {
    String uuid=doc["commandUuid"]|"";
    if(!resetReceipt.isEmpty()&&uuid==resetReceipt){
      if(!factoryPrefs.putBool("resetCommit",true) || !finishResetCommit()){tell("Reset storage retry pending");return;}
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
    const char *lifecycle=doc["lifecycle"]|(const char *)nullptr;
    // Admin tạm ngưng: bản tin rút gọn, không có quyền. Chặn mọi lượt mở nhưng giữ dữ liệu.
    if(lifecycle && strcmp(lifecycle,"SUSPENDED")==0){setRestriction(DoorRestriction::fromServer(restriction,lifecycle,false));return;}
    if(doc["generationMismatch"]|false){claimed=false;factoryPrefs.putBool("claimed",false);tell("Generation mismatch - service required");return;}
    if(doc["generation"].as<uint32_t>()!=generation)return;
    if(doc.containsKey("resetCommand")){executeReset(doc["resetCommand"].as<String>(),generation+1);return;}
    claimed=doc["claimed"]|false;factoryPrefs.putBool("claimed",claimed);
    if(!claimed)return;
    saveOwners(doc["ownerRfid"].as<JsonArrayConst>(),doc["ownerFingerprints"].as<JsonArrayConst>());
    setRestriction(DoorRestriction::fromServer(restriction,lifecycle,doc["lockdown"]|false));
    if(doc["unlockDurationSec"].is<int>() && doc["doorOpenTimeoutSec"].is<int>()) {
      int seconds=doc["unlockDurationSec"].as<int>(),openSeconds=doc["doorOpenTimeoutSec"].as<int>();
      bool wait=doc["autoLockWaitForClose"]|true;
      if(DoorTiming::save(nvs,seconds,openSeconds,wait) && actuatorReady) {
        xSemaphoreTake(motorMutex,portMAX_DELAY);motor.unlockMs=uint32_t(seconds)*1000;motor.heldOpenMs=uint32_t(openSeconds)*1000;motor.waitForClose=wait;xSemaphoreGive(motorMutex);
      }
    }
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
    for(JsonObjectConst removal:doc["memberRemovals"].as<JsonArrayConst>())
      executeMemberRemoval(removal["commandUuid"]|"",removal);
    if(!appPinsReady && !networkPage)connectedContinueSetup();
    return;
  }
  if(incomingTopic!=topic("cmd"))return;
  String uuid=doc["commandUuid"]|"",type=doc["commandType"]|"";
  // Thu hồi: chỉ backend ghi được topic cmd (ACL) và chỉ gửi cho thiết bị đã thu hồi. Bỏ qua generation/TTL
  // vì chip cắm lại sau nhiều ngày có thể chưa có giờ hoặc lệch generation.
  if(type=="DEVICE_DECOMMISSION"){retireDevice(uuid);return;}
  if(uuid.length()!=36||doc["data"]["generation"].as<uint32_t>()!=generation){sendAck(uuid,false,"GENERATION_MISMATCH",false);return;}
  if(type=="MEMBER_REMOVE") {
    time_t now=time(nullptr);long long issued=doc["issuedAt"]|0LL;int ttl=doc["ttlSec"]|0;
    if(now<1700000000 || issued>now+5 || ttl<1 || ttl>60 || now-issued>ttl){sendAck(uuid,false,"EXPIRED_OR_CLOCK_INVALID",false);return;}
    executeMemberRemoval(uuid,doc["data"].as<JsonObjectConst>());return;
  }
  for(int i=0;i<16;i++){DynamicJsonDocument saved(512);if(!deserializeJson(saved,eventPrefs.getString(("ack"+String(i)).c_str(),""))&&saved["commandUuid"].as<String>()==uuid){publishDocument("ack",saved);return;}}
  if(eventPrefs.getString("started","")==uuid){if(remoteEnrollUuid!=uuid && rfidScanUuid!=uuid)sendAck(uuid,false,"INTERRUPTED_COMMAND");return;}
  time_t now=time(nullptr);long long issued=doc["issuedAt"]|0LL;int ttl=doc["ttlSec"]|0;
  if(now<1700000000 || issued>now+5 || ttl<1 || ttl>60 || now-issued>ttl){sendAck(uuid,false,"EXPIRED_OR_CLOCK_INVALID");return;}
  if(!eventPrefs.putString("started",uuid)){sendAck(uuid,false,"STORAGE_ERROR",false);return;}
  if(type=="DEVICE_RESET"){executeReset(uuid,doc["data"]["nextGeneration"]|generation+1);return;}
  if(type=="ACTIVATION_CODE_SET") {
    if(claimed || resetPending){sendAck(uuid,false,"NOT_IN_INVENTORY");return;}
    String code=doc["data"]["activationCode"]|"";
    auto result=ProductActivation::save(factoryPrefs,code,doc["data"]["activationSequence"]|uint64_t(0),generation);
    bool saved=result==ProductActivation::SAVED;
    if(saved){activationCode=code;if(screen==APP_SETUP || networkPage)drawSetupQrAndWifi();}
    sendAck(uuid,saved,saved?"ACTIVATION_QR_SAVED":result==ProductActivation::STALE?"STALE_ACTIVATION_CODE":result==ProductActivation::INVALID?"INVALID_ACTIVATION_CODE":"ACTIVATION_QR_STORAGE_FAILED");return;
  }
  if(!claimed || resetPending){sendAck(uuid,false,"NOT_READY");return;}
  if(type=="DOOR_LOCKDOWN" || type=="DOOR_RELEASE") {
    if(restriction==DoorRestriction::SUSPENDED){sendAck(uuid,false,"DEVICE_SUSPENDED");return;}
    bool on=type=="DOOR_LOCKDOWN";setRestriction(on?DoorRestriction::LOCKDOWN:DoorRestriction::NORMAL);
    lastStatusAt=millis()-5001;sendAck(uuid,!storageFault,on?"LOCKDOWN_ON":"LOCKDOWN_OFF");return;
  }
  if(type=="WIFI_SETUP") {
    if(screen==SERVO_CAL || snapshot().calibrating){sendAck(uuid,false,"DEVICE_BUSY");return;}
    wifiPermitUntil=0;connectedNetworkPage();sendAck(uuid,true,"WIFI_SETUP_ENABLED");return;
  }
  if(type=="SETUP_CREDENTIALS") {
    MotorState active=snapshot();
    if(remoteStage || !rfidScanUuid.isEmpty() || active.door.released || active.pending || active.pulsing || active.calibrating || screen==SERVO_CAL){sendAck(uuid,false,"DEVICE_BUSY");return;}
    String pin=doc["data"]["pin"]|"",admin=doc["data"]["adminPin"]|"";
    bool valid=pin.length()==6 && admin.length()==6 && pin!=admin;
    for(char c:pin)valid=valid&&isdigit(c);for(char c:admin)valid=valid&&isdigit(c);
    if(!valid){sendAck(uuid,false,"INVALID_PINS");return;}
    Config next=cfg;next.user=makePin(pin);next.admin=makePin(admin);
    if(!appPinsReady){next.touch.valid=0;next.closedLevel=-1;sensorCycleVerified=false;servoCycleVerified=false;
      if(!nvs.putBool("reedVerified",false) || !nvs.putBool("servoVerified",false)){sendAck(uuid,false,"STORAGE_ERROR");return;}}
    if(!saveConfig(next) || !nvs.putBool("appPins",true)){storageFault=true;sendAck(uuid,false,"STORAGE_ERROR");return;}
    appPinsReady=true;applyMotorConfig();sendAck(uuid,true,"PINS_CONFIGURED");
    if(!connectedContinueSetup())go(HOME);return;
  }
  if(type=="SETUP_CALIBRATE") {
    MotorState active=snapshot();
    if(!appPinsReady || remoteStage || !rfidScanUuid.isEmpty() || active.door.released || active.pending || active.pulsing || active.calibrating || screen==SERVO_CAL){sendAck(uuid,false,"DEVICE_BUSY_OR_PINS_REQUIRED");return;}
    Config next=cfg;next.touch.valid=0;next.closedLevel=-1;sensorCycleVerified=false;servoCycleVerified=false;
    if(!nvs.putBool("reedVerified",false) || !nvs.putBool("servoVerified",false) || !saveConfig(next)){sendAck(uuid,false,"STORAGE_ERROR");return;}
    sendAck(uuid,true,"CALIBRATION_STARTED");connectedContinueSetup();return;
  }
  if(type.startsWith("SERVO_")) {
    static uint64_t lastServoSeq=0;
    uint64_t sequence=doc["data"]["servoSeq"]|0ULL;
    if(!sequence || sequence<=lastServoSeq){sendAck(uuid,false,"STALE_SERVO_COMMAND");return;}
    lastServoSeq=sequence;
  }
  if(type=="SERVO_PREVIEW_STOP") {stopServoPreview();sendAck(uuid,true,"SERVO_PREVIEW_STOPPED");return;}
  if(type=="SERVO_PREVIEW") {
    if((screen!=HOME && screen!=MOTOR) || remoteStage || !rfidScanUuid.isEmpty()){sendAck(uuid,false,"DEVICE_BUSY");return;}
    String target=doc["data"]["target"]|"";
    if((doc["data"]["servoRange"]|180)!=cfg.servoRange){sendAck(uuid,false,"SERVO_RANGE_MISMATCH");return;}
    if((target!="LOCK" && target!="OPEN") || !doc["data"]["angle"].is<int>()) {sendAck(uuid,false,"INVALID_SERVO_ANGLES");return;}
    bool ok=requestServoPreview(doc["data"]["angle"].as<int>(),target=="LOCK");
    sendAck(uuid,ok,ok?"SERVO_PREVIEW_ACCEPTED":"SERVO_BUSY_OR_DOOR_OPEN");return;
  }
  if(type=="SERVO_SET") {
    MotorState state=snapshot();
    if(state.door.released || (!state.previewing && (state.pending || state.pulsing || state.calibrating)) || screen==SERVO_CAL || remoteStage || !rfidScanUuid.isEmpty()){sendAck(uuid,false,"DEVICE_BUSY");return;}
    if(!doc["data"]["lockAngle"].is<int>() || !doc["data"]["openAngle"].is<int>()) {sendAck(uuid,false,"INVALID_SERVO_ANGLES");return;}
    int lockAngle=doc["data"]["lockAngle"].as<int>(),openAngle=doc["data"]["openAngle"].as<int>();
    int range=doc["data"]["servoRange"]|cfg.servoRange;
    if(!validServoAngles(lockAngle,openAngle,range)){sendAck(uuid,false,"INVALID_SERVO_ANGLES");return;}
    Config next=cfg;next.lockAngle=lockAngle;next.openAngle=openAngle;next.servoRange=range;
    stopServoPreview();
    // Saving changes the next command's angles; it never requests a servo move.
    bool saved=saveConfig(next);lastStatusAt=millis()-5001;sendAck(uuid,saved,saved?"SERVO_ANGLES_SAVED":"SERVO_STORAGE_FAILED");return;
  }
  if(type=="RFID_SCAN") {
    if(remoteStage || !rfidScanUuid.isEmpty() || snapshot().calibrating || !rfidReady || !configured() || screen!=HOME){sendAck(uuid,false,"RFID_BUSY_OR_NOT_READY");return;}
    rfidScanUuid=uuid;rfidScanStarted=millis();tell("Tap card for mobile registration");return;
  }
  if(type=="DOOR_UNLOCK"){
    if(!DoorRestriction::allowRemote(restriction)){sendAck(uuid,false,"DEVICE_SUSPENDED");return;}
    int seconds=doc["data"]["durationSec"]|int(snapshot().unlockMs/1000);
    if(!DoorTiming::valid(seconds)){sendAck(uuid,false,"INVALID_UNLOCK_DURATION");return;}
    bool accepted=requestOpen(uint32_t(seconds)*1000);
    lastStatusAt=millis()-5001;sendAck(uuid,accepted,accepted?"UNLOCK_COMMAND":"DEVICE_BUSY_OR_NOT_READY");return;
  }
  if(type=="DOOR_LOCK"){
    bool accepted=requestLock();lastStatusAt=millis()-5001;
    sendAck(uuid,accepted,!accepted?"DEVICE_BUSY_OR_NOT_READY":snapshot().door.lockPending?"LOCK_WAITING_FOR_DOOR":"LOCK_COMMAND");return;
  }
  if(type=="PIN_SET") {
    String pin=doc["data"]["pin"]|"";if(pin.length()!=6){sendAck(uuid,false,"INVALID_PIN");return;}
    for(char c:pin)if(!isdigit(c)){sendAck(uuid,false,"INVALID_PIN");return;}
    Config next=cfg;next.user=makePin(pin);sendAck(uuid,saveConfig(next),"PIN_UPDATED");return;
  }
  if(type=="FP_DELETE") {int slot=doc["data"]["templateId"]|0;bool ok=fingerReady&&slot>0&&slot<256&&finger.deleteModel(slot)==FINGERPRINT_OK;sendAck(uuid,ok,"FINGER_DELETE");return;}
  if(type=="FP_ENROLL") {
    int requested=doc["data"]["templateId"]|0;
    // Mã lỗi tách riêng để app hiển thị đúng nguyên nhân.
    if(remoteStage||!rfidScanUuid.isEmpty()||snapshot().calibrating){sendAck(uuid,false,"DEVICE_BUSY");return;}
    if(!fingerReady)probeSensors();
    if(!fingerReady){sendAck(uuid,false,"SENSOR_NOT_READY");return;}
    if(requested<1||requested>=256){sendAck(uuid,false,"INVALID_SLOT");return;}
    int slot=chooseEnrollSlot(requested,doc["data"]["usedSlots"].as<JsonArrayConst>());
    if(slot<0){sendAck(uuid,false,"SENSOR_READ_FAILED");return;}
    if(slot==0){sendAck(uuid,false,"SENSOR_FULL");return;}
    remoteEnrollUuid=uuid;remoteSlot=slot;remoteStage=1;remoteStarted=millis();tell("Scan finger #1 for mobile request");return;
  }
  sendAck(uuid,false,"UNSUPPORTED_COMMAND");
}
void connectedSetup() {
  factoryPrefs.begin("doorfactory",false);networkPrefs.begin("doornetwork",false);eventPrefs.begin("doorevents",false);
  String json=factoryPrefs.getString("config","");DynamicJsonDocument doc(8192);
  if(!json.isEmpty() && !deserializeJson(doc,json))loadFactoryJson(doc);
  generation=factoryPrefs.getUInt("gen",1);claimed=factoryPrefs.getBool("claimed",false);
  appPinsReady=nvs.getBool("appPins",false);applyMotorConfig();
  restriction=DoorRestriction::decode(nvs.getUChar("restrict",0));
  ownerCards=nvs.getString("ownerCards",",");ownerFingers=nvs.getString("ownerFingers",",");
  uint32_t timing=DoorTiming::load(nvs);
  if(actuatorReady){xSemaphoreTake(motorMutex,portMAX_DELAY);motor.unlockMs=(timing&255)*1000;motor.heldOpenMs=DoorTiming::openSeconds(timing)*1000;motor.waitForClose=DoorTiming::waitForClose(timing);xSemaphoreGive(motorMutex);}
  resetReceipt=factoryPrefs.getString("resetAck","");resetIntent=factoryPrefs.getString("resetIntent","");
  resetPending=resetReceipt.length() || resetIntent.length() || factoryPrefs.getBool("resetCommit",false);
  if(factoryPrefs.getBool("resetCommit",false) && finishResetCommit()){ESP.restart();return;}
  if(resetPending){adminSession=false;if(actuatorReady){xSemaphoreTake(motorMutex,portMAX_DELAY);motor.enabled=false;motor.pending=false;motor.calibrating=false;servo.detach();xSemaphoreGive(motorMutex);}}
  queueHead=eventPrefs.getUShort("head",0);queueTail=eventPrefs.getUShort("tail",0);droppedEvents=eventPrefs.getUInt("dropped",0);
  loadSavedWifiNetworks();
  broker.setBufferSize(16384);broker.setSocketTimeout(2);broker.setCallback(handleBroker);
  WiFi.onEvent([](WiFiEvent_t event,WiFiEventInfo_t info){if(event==ARDUINO_EVENT_WIFI_SCAN_DONE){setupScanEventStatus=info.wifi_scan_done.status;setupScanEventCount=info.wifi_scan_done.number;}});
  configTime(0,0,"pool.ntp.org","time.cloudflare.com");startSetupWeb();
  WiFi.persistent(false);WiFi.setAutoReconnect(true);
  if(savedWifiCount)attemptSavedWifi(0);
  if(connectedAccessReady()){if(wifiSsid.isEmpty())enableSetupAp();go(HOME);}
  else if(!claimed || wifiSsid.isEmpty())connectedNetworkPage();
  else if(!connectedContinueSetup())go(HOME);
  Serial.println("CONNECTED_READY factoryMac="+factoryMac());
}
const char *forgetUnclaimedWifi(const String &confirmation) {
  // USB preparation only: an owned or partially configured door must use the authenticated reset flow.
  if(!deviceUid.length() || confirmation!=deviceUid || activationCode.length()<24 || setupPassword.length()<8 ||
     claimed || resetPending || storageFault || appPinsReady || cfg.admin.valid || cfg.user.valid ||
     cfg.cardCount || cfg.fingerCount || cfg.touch.valid || sensorCycleVerified || servoCycleVerified ||
     nvs.getBytesLength("config"))return "WIFI_RESET_REJECTED";
  broker.disconnect();
  // Clear both the Arduino/ESP-IDF station credentials and our saved-network namespace.
  if(!WiFi.disconnect(false,true) || !networkPrefs.clear())return "WIFI_RESET_FAILED";
  loadSavedWifiNetworks();
  if(savedWifiCount || wifiSsid.length() || wifiPassword.length())return "WIFI_RESET_FAILED";
  return "WIFI_RESET_COMPLETE";
}
void handleFactorySerial() {
  while(Serial.available()){
    char c=Serial.read();if(c!='\n'){if(serialLine.length()<8000)serialLine+=c;continue;}
    if(serialLine.startsWith("FACTORY ") && deviceSecret.isEmpty()) {
      DynamicJsonDocument doc(8192);String value=serialLine.substring(8);
      if(!deserializeJson(doc,value)&&String(doc["activationCode"]|"").length()>=24&&String(doc["setupPassword"]|"").length()>=8&&loadFactoryJson(doc)){
        if(doc.containsKey("wifiSsid"))rememberSavedWifi(doc["wifiSsid"].as<String>(),doc["wifiPassword"]|"");
        factoryPrefs.putUInt("gen",doc["generation"]|1);
        doc.remove("wifiSsid");doc.remove("wifiPassword");value="";serializeJson(doc,value);
        if(!factoryPrefs.putString("config",value)){Serial.println("FACTORY_STORAGE_FAILED");serialLine="";return;}
        Serial.println("FACTORY_PROVISIONED "+factoryMac());Serial.flush();delay(200);ESP.restart();
      } else Serial.println("FACTORY_REJECTED");
    } else if(serialLine.startsWith("FORGET_WIFI ")) {
      const char *result=forgetUnclaimedWifi(serialLine.substring(12));
      Serial.println(result);
      if(strcmp(result,"WIFI_RESET_COMPLETE")==0){Serial.flush();delay(200);ESP.restart();}
    } else if(serialLine=="SCAN_WIFI") {setupScanCache="";serialScanPending=true;startSetupScan(true);
    } else if(serialLine=="INFO") {
      while(fpSerial.available())fpSerial.read();
      bool authenticated=finger.verifyPassword();
      int parameterStatus=authenticated?finger.getParameters():-1;
      fingerReady=authenticated&&parameterStatus==FINGERPRINT_OK;
      uint8_t bitmap[32];bool bitmapOk=readFingerBitmap(bitmap);MotorState state=snapshot();
      bool countOk=finger.getTemplateCount()==FINGERPRINT_OK;
      Serial.println("FACTORY_INFO mac="+factoryMac()+" uid="+deviceUid+" firmware="+String(FIRMWARE_VERSION)+" gen="+String(generation)+" wifi="+String(WiFi.status())+" mqtt="+String(broker.connected())+
        " fingerReady="+String(fingerReady)+" authenticated="+String(authenticated)+" parameters="+String(parameterStatus)+" capacity="+String(finger.capacity)+" bitmapOK="+String(bitmapOk)+" slot1empty="+String(bitmapOk&&!(bitmap[0]&2))+" templates="+String(countOk?int(finger.templateCount):-1)+
        " storageFault="+String(storageFault)+" configBytes="+String(nvs.getBytesLength("config"))+" freeEntries="+String(nvs.freeEntries())+" savedWifi="+String(savedWifiCount)+" claimed="+String(claimed)+" cards="+String(cfg.cardCount)+" fingers="+String(cfg.fingerCount)+
        " motorEnabled="+String(state.enabled)+" motorFault="+String(state.fault)+" motorCommanded="+String(state.commanded)+" lockAngle="+String(cfg.lockAngle)+" openAngle="+String(cfg.openAngle)+" lastServoAngle="+String(state.lastAngle)+" servoReady="+String(servoCycleVerified)+" released="+String(state.door.released)+" lockPending="+String(state.door.lockPending)+" unlockSec="+String(state.unlockMs/1000)+" reedVerified="+String(sensorCycleVerified)+" appPins="+String(appPinsReady)+" offlineReady="+String(connectedAccessReady())+" ui="+String(screen==HOME?"KEYPAD":screen==SERVO_CAL?"SERVO_GUIDE":networkPage?"WIFI_SETUP":"SETUP")+" wifiBars="+String(WiFi.status()==WL_CONNECTED?SetupLogic::signalBars(WiFi.RSSI()):0)+" setupStage="+setupStage()+" productPrepared="+String(!deviceUid.isEmpty()&&activationCode.length()>=24&&setupPassword.length()>=8));
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
  if(factoryPrefs.getBool("resetCommit",false) && finishResetCommit()){broker.disconnect();WiFi.disconnect(true);delay(200);ESP.restart();return;}
  if(resetIntent.length() && resetReceipt.isEmpty() && millis()-lastResetAttempt>15000)
    executeReset(resetIntent,factoryPrefs.getUInt("nextGen",generation+1));
  // AP recovery runs in the background; a configured door keeps its offline keypad.
  if(connectedAccessReady() && screen==APP_SETUP && !networkPage)go(HOME);
  if(!rfidScanUuid.isEmpty() && millis()-rfidScanStarted>=30000){String uuid=rfidScanUuid;rfidScanUuid="";sendAck(uuid,false,"RFID_SCAN_TIMEOUT");tell("Card scan timed out");}
  handleFactorySerial();pollSetupScan();if(setupApActive)setupDns.processNextRequest();setupWeb.handleClient();pollRemoteEnroll();
  if(setupApCloseAt && WiFi.status()==WL_CONNECTED && int32_t(millis()-setupApCloseAt)>=0){setupApCloseAt=0;setupDns.stop();WiFi.softAPdisconnect(true);setupApActive=false;networkPage=false;wifiPermitUntil=0;if(!connectedContinueSetup())go(HOME);}
  if(!fingerReady && !remoteStage && !resetPending && serialLine.isEmpty() && millis()-lastSensorRetry>15000){lastSensorRetry=millis();probeSensors();}
  if(SetupLogic::wifiAttemptExpired(setupConnectStarted,millis(),WiFi.status()==WL_CONNECTED && WiFi.SSID()==wifiSsid)) {
    setupConnectStarted=0;setupError="Không kết nối được mạng mới. Đã giữ cấu hình Wi-Fi trước đó; hãy chọn lại mạng/mật khẩu.";
    if(savedWifiCount)attemptSavedWifi(0);else {wifiSsid="";wifiPassword="";}
  }
  if(WiFi.status()!=WL_CONNECTED){
    if(!wifiOfflineSince){wifiOfflineSince=millis();if(!setupConnectStarted && savedWifiCount)attemptSavedWifi(0);}
    if(millis()-wifiOfflineSince>30000)enableSetupAp();
    if(!setupConnectStarted && savedWifiCount && millis()-lastWifiAttempt>20000)attemptSavedWifi((wifiRetryIndex+1)%savedWifiCount);
    return;
  }
  wifiOfflineSince=0;
  if(!resetPending && WiFi.SSID()==wifiSsid){
    rememberSavedWifi(wifiSsid,wifiPassword);
    setupConnectStarted=0;
    if(setupApActive && !setupApCloseAt)setupApCloseAt=millis()+600000;
  }
  if(brokerHost.isEmpty()||deviceSecret.isEmpty())return;
  if(!broker.connected() && millis()-lastBrokerAttempt>10000){
    lastBrokerAttempt=millis();
    if(brokerTls){if(brokerCa.isEmpty())return;tlsTransport.setCACert(brokerCa.c_str());tlsTransport.setTimeout(1500);broker.setClient(tlsTransport);}
    else {if(!benchLan||!privateHost(brokerHost))return;broker.setClient(localTransport);}
    broker.setServer(brokerHost.c_str(),brokerPort);
    if(broker.connect(deviceUid.c_str(),brokerUser.c_str(),brokerPassword.c_str()))for(const char *suffix:{"cmd","config","ack-confirm","access-ack"})broker.subscribe(topic(suffix).c_str(),1);
  }
  broker.loop();if(!broker.connected())return;
  if(screen==APP_SETUP && millis()-lastSetupDraw>1000){lastSetupDraw=millis();if(!connectedContinueSetup())go(HOME);}
  if(wifiPermitUntil && int32_t(wifiPermitUntil-millis())<=0)wifiPermitUntil=0;
  if(!resetReceipt.isEmpty()&&millis()-lastStatusAt>3000){lastStatusAt=millis();sendAck(resetReceipt,true,"RESET_EMPTY_VERIFIED",false);return;}
  // Publish state transitions promptly so a short unlock is visible between heartbeats.
  static int previousLeaf=-2,previousLatch=-2,previousLock=-1,previousOpen=-1,previousRange=0;
  static bool previousLockPending=false,previousWaitForClose=true;
  static uint32_t previousTiming=0,previousSequence=0;
  MotorState current=snapshot();
  int leaf=sensorCycleVerified?int(isClosed(current,millis())):-1;
  int currentLatch=DoorLogic::reportedLatch(current.commanded&&!current.pending&&!current.pulsing&&!current.calibrating&&!current.fault,
      current.lastAngle,current.lockAngle,current.openAngle,current.door);
  bool changed=leaf!=previousLeaf || currentLatch!=previousLatch || current.door.lockPending!=previousLockPending ||
    cfg.lockAngle!=previousLock || cfg.openAngle!=previousOpen || cfg.servoRange!=previousRange ||
    current.unlockMs!=previousTiming || current.commandSequence!=previousSequence || current.waitForClose!=previousWaitForClose;
  if(millis()-lastStatusAt>5000 || (changed && millis()-lastStatusAt>=100)){
    lastStatusAt=millis();requestNonce=randomId();MotorState state=current;DynamicJsonDocument status(2048);
    status["requestId"]=requestNonce;status["localReady"]=configured();status["hasDoorPin"]=appPinsReady && cfg.user.valid;status["fingerReady"]=fingerReady;
    status["adminPinSet"]=appPinsReady && cfg.admin.valid;status["touchCalibrated"]=bool(cfg.touch.valid);
    status["doorCalibrated"]=sensorCycleVerified;status["setupStage"]=setupStage();status["wifiSsid"]=wifiSsid;
    status["lockAngle"]=cfg.lockAngle;status["openAngle"]=cfg.openAngle;status["servoRange"]=cfg.servoRange;
    status["lockPending"]=state.door.lockPending;status["unlockDurationSec"]=state.unlockMs/1000;
    status["doorOpenTimeoutSec"]=state.heldOpenMs/1000;
    status["autoLockWaitForClose"]=state.waitForClose;
    status["servoCalibrated"]=servoCycleVerified;
    if(state.lastAngle>=0)status["servoCommandAngle"]=state.lastAngle;else status["servoCommandAngle"]=nullptr;
    status["servoDirection"]=ServoSetup::direction(state.previousAngle,state.lastAngle);
    if(sensorCycleVerified)status["doorClosed"]=isClosed(state,millis());else status["doorClosed"]=nullptr;
    int latch=DoorLogic::reportedLatch(state.commanded&&!state.pending&&!state.pulsing&&!state.calibrating&&!state.fault,
      state.lastAngle,state.lockAngle,state.openAngle,state.door);
    if(latch>=0)status["unlocked"]=bool(latch);else status["unlocked"]=nullptr;
    status["droppedEvents"]=droppedEvents;
    // Telemetry chẩn đoán: cường độ Wi-Fi (dBm), RAM trống (bytes), thời gian chạy (s), phiên bản.
    status["rssi"]=WiFi.RSSI();status["freeHeap"]=ESP.getFreeHeap();status["uptime"]=millis()/1000;
    status["fw"]=FIRMWARE_VERSION;status["hw"]=HARDWARE_VERSION;
    if(publishDocument("status",status)) {
      previousLeaf=leaf;previousLatch=currentLatch;previousLockPending=state.door.lockPending;
      previousLock=cfg.lockAngle;previousOpen=cfg.openAngle;previousRange=cfg.servoRange;
      previousTiming=state.unlockMs;previousSequence=state.commandSequence;previousWaitForClose=state.waitForClose;
    }
    for(int i=0;i<16;i++){DynamicJsonDocument saved(512);if(!deserializeJson(saved,eventPrefs.getString(("ack"+String(i)).c_str(),"")))publishDocument("ack",saved);}
  }
  if(queueHead!=queueTail&&millis()-lastEventAt>1500){lastEventAt=millis();DynamicJsonDocument event(768);if(!deserializeJson(event,eventPrefs.getString(("ev"+String(queueHead)).c_str(),"")))publishDocument("access",event);}
}
