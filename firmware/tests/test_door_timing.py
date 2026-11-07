"""Test the real persisted timer codec, including failed writes and reboot reads."""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = r'''
#include <cassert>
#include <cstdint>
#include <cstddef>
#include <initializer_list>
#define DEFAULT 1
#include "door_timing.h"
struct Store {
  uint32_t value=0;bool fail=false,lie=false;int writes=0;
  uint32_t getUInt(const char*,uint32_t fallback){return value?value:fallback;}
  size_t putUInt(const char*,uint32_t next){++writes;if(fail)return 0;if(!lie)value=next;return 4;}
};
int main(){
  Store store;
  assert(DoorTiming::load(store)==DoorTiming::DEFAULT_TIMING);
  for(int sec:{1,5,7,30}){
    assert(DoorTiming::save(store,sec,60));
    uint32_t restored=DoorTiming::load(store);
    assert((restored&255)==unsigned(sec) && (restored>>8)==60);
    int writes=store.writes;assert(DoorTiming::save(store,sec,60));assert(store.writes==writes);
  }
  uint32_t previous=store.value;
  for(int sec:{-1,0,31,1000})assert(!DoorTiming::save(store,sec,60));
  assert(!DoorTiming::save(store,5,9) && !DoorTiming::save(store,5,601));
  assert(store.value==previous);
  store.fail=true;assert(!DoorTiming::save(store,5,30));assert(store.value==previous);
  store.fail=false;store.lie=true;assert(!DoorTiming::save(store,5,30));
  store.value=255;assert(DoorTiming::load(store)==DoorTiming::DEFAULT_TIMING);
  store={};assert(DoorTiming::save(store,7,60,false));
  uint32_t timed=DoorTiming::load(store);
  assert((timed&255)==7 && DoorTiming::openSeconds(timed)==60 && !DoorTiming::waitForClose(timed));
  assert(DoorTiming::save(store,7,60,true));assert(DoorTiming::waitForClose(DoorTiming::load(store)));
}
'''
compiler = shutil.which('g++')
if not compiler:
    raise SystemExit('g++ is required')
with tempfile.TemporaryDirectory(prefix='door-timing-') as folder:
    folder = Path(folder)
    cpp, exe = folder / 'timing.cpp', folder / 'timing.exe'
    cpp.write_text(source, encoding='utf-8')
    subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror', '-static-libgcc', '-static-libstdc++',
                    '-I', str(root / 'include'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('PASS: timer limits, one atomic stored value, unchanged-write suppression, reboot and storage failures')
