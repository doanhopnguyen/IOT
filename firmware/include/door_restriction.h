#pragma once
#include <stdint.h>
#include <string.h>

// Quyết định lượt mở nào được qua theo trạng thái hạn chế của cửa.
// Ưu tiên: RETIRED (thu hồi, vĩnh viễn) > SUSPENDED (admin tạm ngưng) > LOCKDOWN (chủ cửa tạm khóa) > NORMAL.
namespace DoorRestriction {
enum Mode : uint8_t { NORMAL=0, LOCKDOWN=1, SUSPENDED=2, RETIRED=3 };

// ownerCredential: vân tay/thẻ thuộc chủ cửa. PIN dùng chung luôn là false.
inline bool allowLocal(Mode mode,bool ownerCredential) {
  if(mode==NORMAL)return true;
  if(mode==LOCKDOWN)return ownerCredential;
  return false;
}
// Lệnh mở từ xa đã được backend lọc theo tài khoản (chỉ chủ cửa khi đang tạm khóa).
inline bool allowRemote(Mode mode){return mode==NORMAL || mode==LOCKDOWN;}

// lifecycle: trường "lifecycle" trong config; nullptr khi backend cũ không gửi.
// MAINTENANCE/giá trị lạ giữ nguyên trạng thái hiện tại.
inline Mode fromServer(Mode current,const char *lifecycle,bool lockdown) {
  if(current==RETIRED)return RETIRED;
  if(lifecycle && strcmp(lifecycle,"SUSPENDED")==0)return SUSPENDED;
  if(lifecycle && strcmp(lifecycle,"ACTIVE")==0)return lockdown?LOCKDOWN:NORMAL;
  if(!lifecycle)return current==SUSPENDED?SUSPENDED:(lockdown?LOCKDOWN:NORMAL);
  return current;
}
inline Mode decode(uint8_t raw){return raw<=RETIRED?Mode(raw):NORMAL;}
}
