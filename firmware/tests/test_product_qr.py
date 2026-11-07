"""Compile the product QR generator used on the actual display."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = r'''
#include <cassert>
#include <string>
#include "product_qr.h"
int main(){
  using std::string;
  string code="aBcd0123456789_ABCDEFGHIJ-klmnopqr",uid="ESP32-80B54EC8149C",ssid="SmartDoor-C8149C",key="Abcd1234_qrs",name="Smart Door C8149C";
  string qr=ProductQr::build(code,uid,ssid,key,name);
  assert(qr=="WIFI:T:WPA;S:SmartDoor-C8149C;P:Abcd1234_qrs;H:false;C:aBcd0123456789_ABCDEFGHIJ-klmnopqr;U:ESP32-80B54EC8149C;N:Smart Door C8149C;;");
  assert(qr.size()<192); // Fits the current display QR version 8/ECC-L.
  qr=ProductQr::build(string(""),uid,ssid,key,name);
  assert(qr.find(";C:")==string::npos && qr.find("WIFI:")==0); // An owned door gives Wi-Fi only.
  assert(ProductQr::escape(string("Front;Door,Right:Key\\"))=="Front\\;Door\\,Right\\:Key\\\\");
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='product-qr-') as folder:
    folder = Path(folder)
    cpp, exe = folder/'test.cpp', folder/'test.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    '-I', str(root/'include'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: standard Wi-Fi product QR, activation fields, escaping, display capacity, owned-door Wi-Fi QR')
