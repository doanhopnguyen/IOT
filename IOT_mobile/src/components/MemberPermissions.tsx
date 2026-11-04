import { useEffect,useState } from 'react';
import { Switch,Text,View } from 'react-native';
import { request } from '../services/api/client';
import { managerService } from '../services/api/managerService';
import { Button,Card } from './ui';
type Credential={id:number;type:string;status:string;rfidUid?:string;templateId?:number};
export function MemberPermissions({unitId,userId,methods,changed}:{unitId:number;userId:number;methods:string[];changed:()=>Promise<void>}){
 const [credentials,setCredentials]=useState<Credential[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const path=`/api/manager/units/${unitId}/users/${userId}`;
 useEffect(()=>{let active=true;void request<Credential[]>(path+'/credentials').then(r=>{if(active)setCredentials(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[path,methods]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await changed();setCredentials(await request(path+'/credentials'));}catch(e){setError(e instanceof Error?e.message:'Lỗi kết nối');}finally{setBusy(false);}};
 const permissions=[['RFID','allowRfid'],['Vân tay','allowFingerprint'],['Mở từ xa','allowRemoteUnlock']] as const;
 return <Card><Text style={{fontWeight:'700'}}>Quyền theo phương thức</Text>{permissions.map(([label,key])=><View key={key} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text>{label}</Text><Switch accessibilityLabel={`Quyền ${label}`} value={methods.includes(label)} disabled={busy} onValueChange={value=>{void run(()=>request(path+'/permissions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({[key]:value})}));}} /></View>)}
 <Text style={{fontWeight:'700',marginTop:12}}>Thẻ và vân tay đã đăng ký</Text>{credentials.filter(c=>c.status!=='REVOKED').map(c=><View key={c.id}><Text>{c.type==='RFID'?`RFID ${c.rfidUid}`:`Vân tay #${c.templateId}`} · {c.status}</Text><Button title="Thu hồi" variant="ghost" disabled={busy} onPress={()=>{void run(async()=>{const r=await request(path+`/${c.type==='RFID'?'rfids':'fingerprints'}/${c.id}`,{method:'DELETE'});if(c.type!=='RFID'){const result=await managerService.waitForCommand(r as Awaited<ReturnType<typeof managerService.commandStatus>>);if(result.status!=='ACKNOWLEDGED')throw Error(result.resultMessage||'Thiết bị chưa xác nhận xóa');}});}} /></View>)}
 {!credentials.length?<Text>Chưa có thẻ hoặc vân tay.</Text>:null}{error?<Text style={{color:'#b91c1c'}}>{error}</Text>:null}</Card>;
}
