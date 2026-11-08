"""Compile the production OTA validation used before flashing and before boot selection."""
from pathlib import Path
import subprocess,shutil,tempfile
root=Path(__file__).resolve().parents[1]
source=r'''
#include <cassert>
#include <string>
#include "ota_policy.h"
int main(){
 std::string hash(64,'a'),other(64,'b');
 assert(OtaPolicy::manifest("1.13.0","2.0.0-demo",hash.c_str(),1024,2*1024*1024));
 assert(!OtaPolicy::manifest("2.0.0-demo","2.0.0-demo",hash.c_str(),1024,2*1024*1024));
 assert(!OtaPolicy::manifest("1.13.0","2.0.0-demo","bad",1024,2*1024*1024));
 assert(!OtaPolicy::manifest("1.13.0","2.0.0-demo",hash.c_str(),1024,512));
 assert(!OtaPolicy::manifest("1.13.0","2.0.0-demo",hash.c_str(),5*1024*1024,8*1024*1024));
 assert(!OtaPolicy::manifest("1.13.0","2.0.0-demo",hash.c_str(),0,2*1024*1024));
 assert(OtaPolicy::digest(hash.c_str(),hash.c_str(),1024,1024));
 assert(!OtaPolicy::digest(hash.c_str(),other.c_str(),1024,1024));
 assert(!OtaPolicy::digest(hash.c_str(),hash.c_str(),1000,1024));
 assert(OtaPolicy::canStart(true,false,false,false,false,false,false,false,false,false,true));
 for(int i=0;i<11;i++){
  bool args[11]={true,false,false,false,false,false,false,false,false,false,true};args[i]=!args[i];
  assert(!OtaPolicy::canStart(args[0],args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8],args[9],args[10]));
 }
}
'''
compiler=shutil.which('g++')
if not compiler:raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='ota-policy-') as folder:
 folder=Path(folder);cpp=folder/'test.cpp';exe=folder/'test.exe';cpp.write_text(source)
 subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror','-static-libgcc','-static-libstdc++','-I',str(root/'include'),str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('PASS: OTA size/partition/version/SHA-256 gates and safe locked-idle update state')
