#pragma once
namespace ProductQr {
template<class Text> Text escape(const Text &value) {
  Text out;
  for(unsigned i=0;i<value.length();i++){
    char c=value[i];
    if(c=='\\' || c==';' || c==',' || c==':' || c=='"')out+='\\';
    out+=c;
  }
  return out;
}
template<class Text> Text build(const Text &code,const Text &uid,const Text &ssid,const Text &password,const Text &name) {
  Text out=Text("WIFI:T:WPA;S:")+escape(ssid)+";P:"+escape(password)+";H:false;";
  if(code.length())out+=Text("C:")+escape(code)+";";
  out+=Text("U:")+escape(uid)+";N:"+escape(name)+";;";
  return out;
}
}
