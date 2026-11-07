#pragma once
#include <ArduinoJson.h>
#include <stdint.h>
namespace ProductActivation {
enum Result { SAVED, STALE, INVALID, STORAGE_ERROR };
template<class Text> bool valid(const Text &code) {
  if(code.length()<24 || code.length()>128)return false;
  for(unsigned i=0;i<code.length();i++){
    char c=code[i];if(!((c>='a'&&c<='z') || (c>='A'&&c<='Z') || (c>='0'&&c<='9') || c=='_' || c=='-'))return false;
  }
  return true;
}
template<class Text,class Store> Result save(Store &store,const Text &code,uint64_t sequence,uint32_t generation) {
  if(!valid(code) || !sequence || !generation)return INVALID;
  Text previous=store.getString("config","");DynamicJsonDocument doc(8192);
  if(!previous.length() || deserializeJson(doc,previous))return STORAGE_ERROR;
  if(!doc.is<JsonObject>() || !doc["deviceUid"].is<const char*>() ||
      !doc["deviceSecret"].is<const char*>() || Text(doc["deviceSecret"]|"").length()<32)return STORAGE_ERROR;
  uint64_t last=(doc["activationGeneration"]|0u)==generation ? (doc["activationSequence"]|uint64_t(0)):0;
  if(sequence<=last)return sequence==last && Text(doc["activationCode"]|"")==code ? SAVED:STALE;
  doc["activationCode"]=code;doc["activationSequence"]=sequence;doc["activationGeneration"]=generation;
  if(doc.overflowed())return STORAGE_ERROR;
  Text encoded;serializeJson(doc,encoded);
  if(store.putString("config",encoded)!=encoded.length() || store.getString("config","")!=encoded)return STORAGE_ERROR;
  return SAVED;
}
}
