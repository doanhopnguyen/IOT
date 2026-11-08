#pragma once
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <mbedtls/sha256.h>
#include <algorithm>
#include "../include/ota_policy.h"

bool privateHost(const String &host);
struct OtaJob {String uuid,url,version,sha256;size_t size=0;};
OtaJob otaJob;
std::atomic<bool> otaBusy{false};
std::atomic<int> otaProgress{0},otaResult{0};
const char *otaFailure="OTA_FAILED";
uint32_t lastOtaDraw=0,lastOtaReceiptAt=0;
bool connectedUpdating(){return otaBusy.load();}

void otaWorker(void *) {
  const char *failure=nullptr;
  HTTPClient http;WiFiClient plain;WiFiClientSecure secure;
  bool https=otaJob.url.startsWith("https://");
  String authority=otaJob.url.substring(https?8:7);authority=authority.substring(0,authority.indexOf('/'));
  String host=authority;int colon=host.indexOf(':');if(colon>=0)host=host.substring(0,colon);
  if((!https && !privateHost(host)) || authority.indexOf('@')>=0)failure="OTA_DOWNLOAD_HOST_REJECTED";
  else if(https && brokerCa.isEmpty())failure="OTA_TLS_CA_REQUIRED";
  else {
    if(https){secure.setCACert(brokerCa.c_str());secure.setTimeout(5000);}
    bool begun=https?http.begin(secure,otaJob.url):http.begin(plain,otaJob.url);
    http.setConnectTimeout(5000);http.setTimeout(8000);http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    http.addHeader("X-Device-Uid",deviceUid);http.addHeader("X-Device-Secret",deviceSecret);
    if(!begun || http.GET()!=HTTP_CODE_OK)failure="OTA_DOWNLOAD_FAILED";
    else if(http.getSize()!=int(otaJob.size))failure="OTA_SIZE_MISMATCH";
    else if(!Update.begin(otaJob.size,U_FLASH))failure="OTA_PARTITION_UNAVAILABLE";
    else {
      mbedtls_sha256_context hash;mbedtls_sha256_init(&hash);mbedtls_sha256_starts_ret(&hash,0);
      WiFiClient *stream=http.getStreamPtr();uint8_t buffer[4096];size_t received=0;uint32_t lastBytes=millis(),started=millis();
      while(received<otaJob.size && millis()-started<180000 && millis()-lastBytes<15000) {
        int available=stream->available();
        if(available<=0){if(!http.connected())break;vTaskDelay(pdMS_TO_TICKS(5));continue;}
        size_t wanted=std::min(size_t(available),std::min(sizeof(buffer),otaJob.size-received));
        int count=stream->readBytes(buffer,wanted);
        if(count<=0)continue;
        if(Update.write(buffer,count)!=size_t(count)){failure="OTA_FLASH_WRITE_FAILED";break;}
        mbedtls_sha256_update_ret(&hash,buffer,count);received+=count;lastBytes=millis();
        otaProgress=int(received*100/otaJob.size);
      }
      unsigned char digest[32];mbedtls_sha256_finish_ret(&hash,digest);mbedtls_sha256_free(&hash);
      char actual[65];for(int i=0;i<32;i++)snprintf(actual+i*2,3,"%02x",digest[i]);
      if(!failure && received!=otaJob.size)failure="OTA_DOWNLOAD_INTERRUPTED";
      if(!failure && !OtaPolicy::digest(otaJob.sha256.c_str(),actual,received,otaJob.size))failure="OTA_SHA256_MISMATCH";
      // Persist the boot receipt before switching partitions. A power loss before
      // Update.end boots the original image and reports a version mismatch safely.
      if(!failure && (!factoryPrefs.putString("otaVersion",otaJob.version) ||
         !factoryPrefs.putString("otaAck",otaJob.uuid) ||
         factoryPrefs.getString("otaVersion","")!=otaJob.version || factoryPrefs.getString("otaAck","")!=otaJob.uuid))failure="OTA_RECEIPT_STORAGE_FAILED";
      if(!failure && !Update.end())failure="OTA_IMAGE_REJECTED";
      if(failure){Update.abort();factoryPrefs.remove("otaAck");factoryPrefs.remove("otaVersion");}
    }
  }
  http.end();
  if(failure){otaFailure=failure;otaResult=-1;}else otaResult=1;
  vTaskDelete(nullptr);
}

void startOtaUpdate(const String &uuid,JsonObjectConst data) {
  if(otaBusy || !factoryPrefs.getString("otaAck","").isEmpty()){sendAck(uuid,false,"OTA_ALREADY_RUNNING");return;}
  MotorState m=snapshot();
  if(!OtaPolicy::canStart(connectedAccessReady(),resetPending,connectedIsEnrolling(),screen==SERVO_CAL,
     m.fault,m.door.released,m.pending,m.pulsing,m.calibrating,m.previewing,isClosed(m,millis()))) {
    sendAck(uuid,false,"OTA_CLOSE_AND_LOCK_DOOR");return;
  }
  String version=data["version"]|"",sha=data["sha256"]|"",url=data["url"]|"";
  size_t size=data["size"]|0;
  const esp_partition_t *partition=esp_ota_get_next_update_partition(nullptr);
  bool valid=partition && OtaPolicy::manifest(FIRMWARE_VERSION,version.c_str(),sha.c_str(),size,partition->size) &&
      (url.startsWith("http://") || url.startsWith("https://")) && url.length()<256;
  if(!valid){sendAck(uuid,false,"OTA_INVALID_MANIFEST");return;}
  otaJob.uuid=uuid;otaJob.url=url;otaJob.version=version;otaJob.sha256=sha;otaJob.size=size;
  otaProgress=0;otaResult=0;otaBusy=true;
  if(xTaskCreatePinnedToCore(otaWorker,"door-ota",12288,nullptr,1,nullptr,0)!=pdPASS){otaBusy=false;sendAck(uuid,false,"OTA_TASK_FAILED");}
}

void pollOtaUpdate() {
  if(otaBusy && millis()-lastOtaDraw>500) {
    lastOtaDraw=millis();screen=APP_SETUP;title("UPDATING FIRMWARE");
    row(65,"Version: "+otaJob.version,WHITE);row(105,"Downloading: "+String(otaProgress.load())+"%",CYAN);
    row(150,"Keep power and Wi-Fi on",YELLOW);row(190,"Door controls paused");
  }
  if(otaResult==1){otaResult=0;delay(100);ESP.restart();return;}
  if(otaResult==-1){otaResult=0;otaBusy=false;sendAck(otaJob.uuid,false,otaFailure);go(HOME);tell("Update failed - try again");}
  if(!otaBusy && broker.connected() && millis()-lastOtaReceiptAt>3000) {
    lastOtaReceiptAt=millis();String receipt=factoryPrefs.getString("otaAck","");
    if(!receipt.isEmpty()) {
      bool correct=factoryPrefs.getString("otaVersion","")==FIRMWARE_VERSION;
      sendAck(receipt,correct,correct?String("FIRMWARE_UPDATED:")+FIRMWARE_VERSION:String("OTA_BOOT_VERSION_MISMATCH"),false);
    }
  }
}
