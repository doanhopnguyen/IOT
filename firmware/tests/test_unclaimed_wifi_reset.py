"""Exercise the production USB cleanup against ownership guards and storage failures."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
network = (root / 'connected_door/network.h').read_text(encoding='utf-8')
production = network[network.index('const char *forgetUnclaimedWifi('):network.index('void handleFactorySerial(')]
source = r'''
#include <cassert>
#include <string>
using String=std::string;
String deviceUid="ESP32-80B54EC8149C", activationCode(32,'a'), setupPassword="setup-password";
String wifiSsid="old-network",wifiPassword="old-password";
bool claimed=false,resetPending=false,storageFault=false,appPinsReady=false;
bool sensorCycleVerified=false,servoCycleVerified=false;
int savedWifiCount=1;
struct Pin{bool valid=false;};
struct Config{Pin admin,user,touch;int cardCount=0,fingerCount=0;} cfg;
struct Storage{
  bool fail=false;int calls=0,bytes=0;
  bool clear(){++calls;return !fail;}
  int getBytesLength(const char*){return bytes;}
} nvs,networkPrefs;
struct Broker{int calls=0;void disconnect(){++calls;}} broker;
struct Wifi{int calls=0;bool fail=false;bool disconnect(bool off,bool erase){
  assert(!off && erase);++calls;return !fail;
}} WiFi;
bool badReadback=false;
void loadSavedWifiNetworks(){
  if(!badReadback){savedWifiCount=0;wifiSsid="";wifiPassword="";}
}
''' + production + r'''
void seed(){
  cfg={};nvs={};networkPrefs={};broker={};WiFi={};
  claimed=resetPending=storageFault=appPinsReady=sensorCycleVerified=servoCycleVerified=badReadback=false;
  savedWifiCount=1;wifiSsid="old-network";wifiPassword="old-password";
}
void rejected(){
  assert(String(forgetUnclaimedWifi(deviceUid))=="WIFI_RESET_REJECTED");
  assert(!WiFi.calls && !networkPrefs.calls && !broker.calls && savedWifiCount==1);
}
int main(){
  seed();assert(String(forgetUnclaimedWifi("ESP32-000000000000"))=="WIFI_RESET_REJECTED");assert(!WiFi.calls);
  seed();claimed=true;rejected();
  seed();resetPending=true;rejected();
  seed();storageFault=true;rejected();
  seed();appPinsReady=true;rejected();
  seed();cfg.admin.valid=true;rejected();
  seed();cfg.user.valid=true;rejected();
  seed();cfg.touch.valid=true;rejected();
  seed();cfg.cardCount=1;rejected();
  seed();cfg.fingerCount=1;rejected();
  seed();sensorCycleVerified=true;rejected();
  seed();servoCycleVerified=true;rejected();
  seed();nvs.bytes=100;rejected();
  seed();WiFi.fail=true;assert(String(forgetUnclaimedWifi(deviceUid))=="WIFI_RESET_FAILED");assert(!networkPrefs.calls);
  seed();networkPrefs.fail=true;assert(String(forgetUnclaimedWifi(deviceUid))=="WIFI_RESET_FAILED");assert(savedWifiCount==1);
  seed();badReadback=true;assert(String(forgetUnclaimedWifi(deviceUid))=="WIFI_RESET_FAILED");
  seed();const auto code=activationCode,key=setupPassword,uid=deviceUid;
  assert(String(forgetUnclaimedWifi(deviceUid))=="WIFI_RESET_COMPLETE");
  assert(!savedWifiCount && wifiSsid.empty() && wifiPassword.empty());
  assert(!nvs.calls && networkPrefs.calls==1 && WiFi.calls==1 && broker.calls==1);
  assert(activationCode==code && setupPassword==key && deviceUid==uid);
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='unclaimed-wifi-reset-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'reset.cpp', folder / 'reset.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: unclaimed Wi-Fi reset guards, failed erase/readback, product QR and identity preserved')
