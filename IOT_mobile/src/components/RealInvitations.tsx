import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { request } from '../services/api/client';
import { Button, Card } from './ui';
type Invitation = { id: number; doorName: string; ownerName: string; status: string; expiresAt: string };
export function RealInvitations({ changed }: { changed: () => Promise<void> }) {
 const [rows,setRows]=useState<Invitation[]>([]);const [error,setError]=useState('');
 const load=async()=>setRows(await request<Invitation[]>('/api/invitations'));
 useEffect(()=>{let alive=true;const poll=()=>{if(alive)void load().catch(e=>setError(e.message));};poll();const timer=setInterval(poll,10000);return()=>{alive=false;clearInterval(timer);};},[]);
 const respond=async(id:number,accept:boolean)=>{try{await request(`/api/invitations/${id}/response`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accept})});await load();await changed();}catch(e){setError(e instanceof Error?e.message:'Không xử lý được lời mời.');}};
 return <ScrollView contentContainerStyle={{padding:22,gap:16,paddingBottom:100}}><Text style={{fontSize:26,fontWeight:'700'}}>Lời mời vào cửa</Text>{error?<Text style={{color:'#b91c1c'}}>{error}</Text>:null}{rows.map(i=><Card key={i.id}><Text style={{fontWeight:'700'}}>{i.doorName}</Text><Text>Chủ cửa: {i.ownerName} · {i.status}</Text>{i.status==='PENDING'?<><Button title="Chấp nhận" onPress={()=>{void respond(i.id,true);}}/><Button title="Từ chối" variant="ghost" onPress={()=>{void respond(i.id,false);}}/></>:null}</Card>)}{!rows.length?<Text>Chưa có lời mời.</Text>:null}</ScrollView>;
}
