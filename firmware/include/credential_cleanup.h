#pragma once
#include <stdint.h>
#include <stddef.h>

namespace CredentialCleanup {
// Verify both before and after deletion; already-empty slots are successful on retry.
template<class ReadBitmap,class DeleteSlot>
bool eraseFingerprints(const uint16_t *slots,size_t count,ReadBitmap read,DeleteSlot remove) {
  if(!count)return true;
  uint8_t bitmap[32];
  for(size_t i=0;i<count;i++)if(slots[i]<1 || slots[i]>255)return false;
  if(!read(bitmap))return false;
  for(size_t i=0;i<count;i++){
    unsigned slot=slots[i];
    if((bitmap[slot/8]&(1u<<(slot%8))) && !remove(slot))return false;
  }
  if(!read(bitmap))return false;
  for(size_t i=0;i<count;i++)if(bitmap[slots[i]/8]&(1u<<(slots[i]%8)))return false;
  return true;
}
}
