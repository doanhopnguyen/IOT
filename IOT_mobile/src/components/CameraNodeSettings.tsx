import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { request, getApiBaseUrl } from '../services/api/client';
import { Button, Card, Input } from './ui';

export function CameraNodeSettings({ unitId }: { unitId: number }) {
 const [nodes,setNodes]=useState<{ deviceCode: string; lifecycleStatus: string }[]>([]);
 const [password,setPassword]=useState('');const [issued,setIssued]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const path=`/api/manager/units/${unitId}/camera-node`;
 useEffect(()=>{let active=true;void request<typeof nodes>(path).then(r=>{if(active)setNodes(r);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[path]);
 const act=async(uid?:string)=>{setBusy(true);try{
  if(uid){await request(`${path}/${uid}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});setIssued('');}
  else {const r=await request<{deviceUid:string;deviceSecret:string}>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});setIssued(`FACE_API_URL=${getApiBaseUrl()}\nFACE_DEVICE_UID=${r.deviceUid}\nFACE_DEVICE_SECRET=${r.deviceSecret}`);}
  setNodes(await request(path));setPassword('');setMessage('Đã cập nhật camera.');
 }catch(e){setMessage(e instanceof Error?e.message:'Lỗi kết nối');}finally{setBusy(false);}};
 return <Card><Text style={{fontWeight:'700'}}>Camera nhận diện online</Text><Text>Chủ cửa cấp riêng node camera. Lưu thông tin cấp phát một lần vào face-node/.env; thêm tài khoản MQTT cùng UID theo hướng dẫn triển khai.</Text>
 <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Mật khẩu tài khoản để cấp / gỡ camera" />
 {nodes.map(n=><Card key={n.deviceCode}><Text selectable>{n.deviceCode} · {n.lifecycleStatus}</Text><Button title="Gỡ camera và vô hiệu khóa cũ" variant="danger" disabled={busy||!password} onPress={()=>{void act(n.deviceCode);}} /></Card>)}
 {!nodes.length?<Button title="Cấp node camera mới" disabled={busy||!password} onPress={()=>{void act();}} />:null}
 {issued?<Text selectable style={{fontFamily:'monospace',fontSize:12}}>{issued}</Text>:null}{message?<Text>{message}</Text>:null}</Card>;
}
