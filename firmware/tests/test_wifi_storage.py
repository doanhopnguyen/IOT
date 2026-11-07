"""Exercise actual Wi-Fi NVS persistence, including passwordless networks."""
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NETWORK = (ROOT / 'connected_door/network.h').read_text(encoding='utf-8')
functions = 'String savedWifiNameKey' + NETWORK.split('String savedWifiNameKey', 1)[1].split('void attemptSavedWifi(', 1)[0]
source = r'''
#include <cassert>
#include <cstdint>
#include <string>
#include <map>
#include <algorithm>
using std::min;
struct String:std::string {
  using std::string::string;
  using std::string::operator=;
  String()=default;
  String(const std::string &s):std::string(s){}
  String(unsigned n):std::string(std::to_string(n)){}
  bool isEmpty()const{return empty();}
};
struct Store {
  std::map<std::string,String> strings;
  std::map<std::string,uint8_t> numbers;
  std::string failWrite,failRead,failRemove;unsigned writes=0;
  unsigned putUChar(const char *k,uint8_t v){++writes;if(failWrite==k)return 0;numbers[k]=v;return 1;}
  uint8_t getUChar(const char *k,uint8_t fallback){return failRead==k || !numbers.count(k)?fallback:numbers[k];}
  unsigned putString(const char *k,const String &v){++writes;if(failWrite==k)return 0;strings[k]=v;return v.length();}
  String getString(const char *k,const char *fallback){return failRead==k || !strings.count(k)?String(fallback):strings[k];}
  bool isKey(const char *k){return strings.count(k) || numbers.count(k);}
  bool remove(const char *k){if(failRemove==k)return false;return strings.erase(k)+numbers.erase(k)>0;}
} networkPrefs;
constexpr uint8_t MAX_SAVED_WIFI=5;
String savedWifiSsids[MAX_SAVED_WIFI],savedWifiPasswords[MAX_SAVED_WIFI];
uint8_t savedWifiCount=0,wifiRetryIndex=0;
String wifiSsid,wifiPassword;bool storageFault=false;
''' + functions + r'''
void seed(){networkPrefs=Store{};savedWifiCount=wifiRetryIndex=0;wifiSsid=wifiPassword="";storageFault=false;
  for(int i=0;i<MAX_SAVED_WIFI;i++)savedWifiSsids[i]=savedWifiPasswords[i]="";}
void reboot(){savedWifiCount=0;wifiSsid=wifiPassword="";loadSavedWifiNetworks();}
int main(){
  // The old implementation falsely marked this as a storage fault (putString("") returns 0).
  seed();rememberSavedWifi("Open","");assert(!storageFault && confirmSavedWifi());
  assert(!networkPrefs.isKey("key0") && !networkPrefs.isKey("password"));
  reboot();assert(savedWifiCount==1 && wifiSsid=="Open" && wifiPassword.empty());
  unsigned writes=networkPrefs.writes;rememberSavedWifi("Open","");assert(networkPrefs.writes==writes);
  seed();rememberSavedWifi("Home","secret");assert(!storageFault && confirmSavedWifi());
  reboot();assert(wifiSsid=="Home" && wifiPassword=="secret");
  rememberSavedWifi("Home","");assert(!storageFault && confirmSavedWifi());
  reboot();assert(wifiSsid=="Home" && wifiPassword.empty() && !networkPrefs.isKey("key0") && !networkPrefs.isKey("password"));

  seed();rememberSavedWifi("Home","secret");rememberSavedWifi("Open","");
  rememberSavedWifi("Guest","another");rememberSavedWifi("Open","");
  assert(!storageFault && confirmSavedWifi());reboot();
  assert(savedWifiCount==3 && savedWifiSsids[0]=="Open" && savedWifiPasswords[0].empty());
  assert(savedWifiSsids[1]=="Guest" && savedWifiPasswords[1]=="another");
  assert(savedWifiSsids[2]=="Home" && savedWifiPasswords[2]=="secret");

  for(const char *key:{"netCount","net0","key0","ssid","password"}){
    seed();networkPrefs.failWrite=key;rememberSavedWifi("Home","secret");assert(storageFault && !confirmSavedWifi());
  }
  for(const char *key:{"key0","password"}){
    seed();rememberSavedWifi("Home","secret");networkPrefs.failRemove=key;
    rememberSavedWifi("Home","");assert(storageFault && !confirmSavedWifi());
  }
  seed();rememberSavedWifi("Home","secret");networkPrefs.failRead="net0";assert(!confirmSavedWifi() && storageFault);
  seed();networkPrefs.strings["ssid"]="LegacyOpen";loadSavedWifiNetworks();
  assert(!storageFault && confirmSavedWifi() && wifiSsid=="LegacyOpen" && wifiPassword.empty());
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='wifi-storage-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'wifi.cpp', folder / 'wifi.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: open/secured Wi-Fi, reboot, password removal, mixed saved networks and actual NVS failures')
