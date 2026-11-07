"""Test the pure door restriction rules (retired / suspended / owner lockdown) on the host.

Run: python firmware/tests/test_door_restriction.py
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = r'''
#include <cassert>
#include <cstdint>
#include "door_restriction.h"
using namespace DoorRestriction;
int main(){
  assert(allowLocal(NORMAL,false) && allowLocal(NORMAL,true));
  assert(allowLocal(LOCKDOWN,true) && !allowLocal(LOCKDOWN,false));
  assert(!allowLocal(SUSPENDED,true) && !allowLocal(SUSPENDED,false));
  assert(!allowLocal(RETIRED,true) && !allowLocal(RETIRED,false));
  assert(allowRemote(NORMAL) && allowRemote(LOCKDOWN) && !allowRemote(SUSPENDED) && !allowRemote(RETIRED));
  assert(fromServer(SUSPENDED,"ACTIVE",false)==NORMAL);
  assert(fromServer(NORMAL,"ACTIVE",true)==LOCKDOWN);
  assert(fromServer(LOCKDOWN,"ACTIVE",false)==NORMAL);
  assert(fromServer(NORMAL,"SUSPENDED",true)==SUSPENDED);
  assert(fromServer(RETIRED,"ACTIVE",false)==RETIRED);
  assert(fromServer(RETIRED,"SUSPENDED",false)==RETIRED);
  assert(fromServer(LOCKDOWN,"MAINTENANCE",false)==LOCKDOWN);
  assert(fromServer(NORMAL,nullptr,true)==LOCKDOWN);
  assert(fromServer(NORMAL,nullptr,false)==NORMAL);
  assert(fromServer(SUSPENDED,nullptr,false)==SUSPENDED);
  assert(decode(0)==NORMAL && decode(1)==LOCKDOWN && decode(2)==SUSPENDED && decode(3)==RETIRED && decode(9)==NORMAL);
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='door-restriction-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'restriction.cpp', folder / 'restriction.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    '-I', str(root / 'include'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: retired is final, suspended blocks all, lockdown keeps owner credentials, server mapping')
