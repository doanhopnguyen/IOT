"""Run the real OTA worker against failed HTTP/flash/NVS operations on the host.

Cryptography is supplied by mbedTLS on the ESP32; the fake hash here only records
stream consumption. The production policy tests cover digest comparison.
"""
from pathlib import Path
import shutil,subprocess,tempfile

ROOT=Path(__file__).resolve().parents[1]
text=(ROOT/'connected_door/ota_update.h').read_text(encoding='utf-8')
worker='void otaWorker(void *) {'+text.split('void otaWorker(void *) {',1)[1].split('\nvoid startOtaUpdate(',1)[0]
harness=r'''
#include <cassert>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <map>
#include "ota_policy.h"
struct String:std::string {
 using std::string::string;
 String(const std::string &s):std::string(s){}
 bool startsWith(const char *s)const{return rfind(s,0)==0;}
 bool isEmpty()const{return empty();}
 String substring(size_t start,size_t end=std::string::npos)const{return substr(start,end==std::string::npos?end:end-start);}
 int indexOf(char c)const{auto p=find(c);return p==npos?-1:int(p);}
};
struct Scenario {
 int http=200,declared=1024,available=1024,read=0,hashBytes=0;
 bool begin=true,write=true,end=true,receipt=true,flashBegun=false,selected=false,aborted=false,ended=false,tls=false;
 int versionPut=0,ackPut=0;unsigned now=0;
} scenario;
struct Preferences {
 std::map<std::string,String> values;
 size_t putString(const char *k,const String &v){if(!scenario.receipt)return 0;values[k]=v;
  if(!strcmp(k,"otaVersion"))scenario.versionPut=++order;else scenario.ackPut=++order;return v.size();}
 String getString(const char *k,const char *fallback){auto p=values.find(k);return p==values.end()?String(fallback):p->second;}
 void remove(const char *k){values.erase(k);}int order=0;
} factoryPrefs;
struct Job{String uuid,url,version,sha256;size_t size;} otaJob;
String brokerCa,deviceUid="ESP32-TEST",deviceSecret="test-only";
int otaProgress=0,otaResult=0;const char *otaFailure="";
bool privateHost(const String &h){return h.startsWith("192.168.");}
struct WiFiClient {
 int available(){return scenario.available-scenario.read;}
 int readBytes(uint8_t *buffer,size_t size){int n=std::min(int(size),available());memset(buffer,0x42,n);scenario.read+=n;return n;}
};
struct WiFiClientSecure:WiFiClient{void setCACert(const char *){scenario.tls=true;}void setTimeout(int){}};
constexpr int HTTP_CODE_OK=200,HTTPC_DISABLE_FOLLOW_REDIRECTS=0,U_FLASH=0;
struct HTTPClient {
 bool begin(WiFiClient &,const String &){return true;}
 void setConnectTimeout(int){}void setTimeout(int){}void setFollowRedirects(int){}
 void addHeader(const char *k,const String &v){if(!strcmp(k,"X-Device-Secret"))assert(v==deviceSecret);}
 int GET(){return scenario.http;}int getSize(){return scenario.declared;}
 WiFiClient stream;WiFiClient *getStreamPtr(){return &stream;}
 bool connected(){return scenario.read<scenario.available;}void end(){scenario.ended=true;}
};
struct Updater {
 bool begin(size_t,int){scenario.flashBegun=scenario.begin;return scenario.begin;}
 size_t write(uint8_t *,int n){return scenario.write?size_t(n):0;}
 bool end(){assert(scenario.versionPut>0 && scenario.ackPut>scenario.versionPut);scenario.selected=scenario.end;return scenario.end;}
 void abort(){scenario.aborted=true;}
} Update;
struct mbedtls_sha256_context{};
void mbedtls_sha256_init(mbedtls_sha256_context *){}
int mbedtls_sha256_starts_ret(mbedtls_sha256_context *,int){return 0;}
int mbedtls_sha256_update_ret(mbedtls_sha256_context *,uint8_t *,int n){scenario.hashBytes+=n;return 0;}
int mbedtls_sha256_finish_ret(mbedtls_sha256_context *,unsigned char *digest){memset(digest,0xaa,32);return 0;}
void mbedtls_sha256_free(mbedtls_sha256_context *){}
unsigned millis(){return scenario.now;}
unsigned pdMS_TO_TICKS(unsigned ms){return ms;}
void vTaskDelay(unsigned ms){scenario.now+=ms;}
void vTaskDelete(void *){}
''' + worker + r'''
void seed(){scenario=Scenario{};factoryPrefs=Preferences{};brokerCa="";otaProgress=otaResult=0;otaFailure="";
 otaJob={"command-uuid","http://192.168.1.10:8080/update","2.0.0-demo",std::string(64,'a'),1024};}
void failed(const char *reason){otaWorker(nullptr);assert(otaResult==-1 && !strcmp(otaFailure,reason));assert(!scenario.selected && scenario.ended);
 assert(factoryPrefs.values.empty());}
int main(){
 seed();otaWorker(nullptr);assert(otaResult==1 && scenario.selected && !scenario.aborted && scenario.hashBytes==1024 && otaProgress==100);
 assert(factoryPrefs.getString("otaAck","")=="command-uuid");
 assert(factoryPrefs.getString("otaVersion","")=="2.0.0-demo");
 seed();scenario.http=401;failed("OTA_DOWNLOAD_FAILED");assert(!scenario.flashBegun);
 seed();scenario.declared=999;failed("OTA_SIZE_MISMATCH");assert(!scenario.flashBegun);
 seed();scenario.begin=false;failed("OTA_PARTITION_UNAVAILABLE");
 seed();scenario.write=false;failed("OTA_FLASH_WRITE_FAILED");assert(scenario.aborted);
 seed();scenario.available=400;failed("OTA_DOWNLOAD_INTERRUPTED");assert(scenario.aborted && scenario.hashBytes==400);
 seed();otaJob.sha256=std::string(64,'b');failed("OTA_SHA256_MISMATCH");assert(scenario.aborted);
 seed();scenario.receipt=false;failed("OTA_RECEIPT_STORAGE_FAILED");assert(scenario.aborted);
 seed();scenario.end=false;failed("OTA_IMAGE_REJECTED");assert(scenario.aborted);
 seed();otaJob.url="http://public.example/update";failed("OTA_DOWNLOAD_HOST_REJECTED");
 seed();otaJob.url="http://user@192.168.1.10/update";failed("OTA_DOWNLOAD_HOST_REJECTED");
 seed();otaJob.url="https://example.test/update";failed("OTA_TLS_CA_REQUIRED");
 seed();otaJob.url="https://example.test/update";brokerCa="test-ca";otaWorker(nullptr);assert(otaResult==1 && scenario.tls && scenario.selected);
}
'''
compiler=shutil.which('g++')
if not compiler:raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='ota-transfer-') as folder:
 folder=Path(folder);cpp=folder/'test.cpp';exe=folder/'test.exe';cpp.write_text(harness,encoding='utf-8')
 subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-static-libgcc','-static-libstdc++','-I',str(ROOT/'include'),str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('PASS: real OTA worker handles HTTP/size/flash/truncation/hash/NVS/commit/TLS failures; boot receipt precedes slot selection')
