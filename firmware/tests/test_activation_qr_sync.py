"""Exercise the exact atomic activation-code update with real ArduinoJson."""
from pathlib import Path
import shutil, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
source=r'''
#include <string>
#include <cassert>
#include "product_activation.h"
using String=std::string;
struct Store {
  String data;bool fail=false,lie=false;
  String getString(const char*,const char*){return data;}
  size_t putString(const char*,const String &value){if(fail)return 0;if(!lie)data=value;return value.size();}
};
int main(){
  using namespace ProductActivation;
  String code="aBcd0123456789_ABCDEFGHIJ-klmnopqr",newer="zBcd0123456789_ABCDEFGHIJ-klmnopqr";
  Store store;store.data=R"({"deviceUid":"ESP32-80B54EC8149C","deviceSecret":"kept-identity-secret-0123456789abcdef","setupPassword":"kept-wifi","brokerHost":"10.0.0.1","activationCode":"old"})";
  assert(save(store,code,10,2)==SAVED);
  DynamicJsonDocument value(2048);deserializeJson(value,store.data);
  assert(value["activationCode"].as<String>()==code);
  assert(value["deviceSecret"]=="kept-identity-secret-0123456789abcdef" && value["setupPassword"]=="kept-wifi" && value["brokerHost"]=="10.0.0.1");
  assert(save(store,code,10,2)==SAVED); // A duplicated ACK does not rewrite another code.
  assert(save(store,newer,11,2)==SAVED);
  assert(save(store,code,10,2)==STALE && save(store,code,11,2)==STALE);
  assert(save(store,code,1,3)==SAVED); // New deployment generation has its own watermark.
  auto previous=store.data;
  assert(save(store,String("bad"),20,3)==INVALID && store.data==previous);
  assert(save(store,code,0,3)==INVALID);
  store.fail=true;assert(save(store,newer,2,3)==STORAGE_ERROR && store.data==previous);
  store.fail=false;store.lie=true;assert(save(store,newer,2,3)==STORAGE_ERROR && store.data==previous);
  store.lie=false;assert(save(store,newer,2,3)==SAVED);
  for(String broken:{"42","[]","{}","not-json"}){store.data=broken;assert(save(store,code,30,3)==STORAGE_ERROR && store.data==broken);}
}
'''
compiler=shutil.which('g++')
if not compiler:raise SystemExit('g++ is required')
json_include=root/'.pio/libdeps/esp32-s3-connected/ArduinoJson/src'
if not json_include.is_dir():raise SystemExit('Build connected firmware first to install ArduinoJson.')
with tempfile.TemporaryDirectory(prefix='activation-qr-') as folder:
    folder=Path(folder);cpp=folder/'test.cpp';exe=folder/'test.exe';cpp.write_text(source,encoding='utf-8')
    subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-static-libgcc','-static-libstdc++',
                    '-I',str(root/'include'),'-I',str(json_include),str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('PASS: atomic QR code sync, identity/Wi-Fi preserved, readback failures, generation and durable sequence protection')
