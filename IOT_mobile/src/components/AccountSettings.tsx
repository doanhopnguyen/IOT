import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Button, Card, Input } from './ui';
import { request } from '../services/api/client';
import type { AccountDto } from '../services/api/authService';
export function AccountSettings({ account, changed, back }: { account: AccountDto; changed: (a: AccountDto) => void; back: () => void }) {
 const [name,setName]=useState(account.fullName),[email,setEmail]=useState(account.email??''),[phone,setPhone]=useState(account.phone??'');
 const [oldPassword,setOld]=useState(''),[newPassword,setNew]=useState(''),[confirmPassword,setConfirm]=useState(''),[message,setMessage]=useState('');
 const act=async(fn:()=>Promise<void>)=>{try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Không thực hiện được.');}};
 return <ScrollView contentContainerStyle={{padding:22,gap:16,paddingBottom:100}}><Button title="← Quay lại" variant="ghost" onPress={back}/><Text style={{fontSize:25,fontWeight:'700'}}>Tài khoản của tôi</Text>
 <Card><Input value={name} onChangeText={setName} placeholder="Họ tên"/><Input value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address"/><Input value={phone} onChangeText={setPhone} placeholder="Số điện thoại"/><Button title="Lưu hồ sơ" onPress={()=>{void act(async()=>{const a=await request<AccountDto>('/api/accounts/me',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:name,email:email||null,phone:phone||null})});changed(a);setMessage('Đã lưu hồ sơ.');});}}/></Card>
 <Card><Input value={oldPassword} onChangeText={setOld} placeholder="Mật khẩu hiện tại" secureTextEntry/><Input value={newPassword} onChangeText={setNew} placeholder="Mật khẩu mới (ít nhất 8 ký tự)" secureTextEntry/><Input value={confirmPassword} onChangeText={setConfirm} placeholder="Nhập lại mật khẩu mới" secureTextEntry/><Button title="Đổi mật khẩu — đăng nhập lại sau đó" disabled={newPassword.length<8||newPassword!==confirmPassword} onPress={()=>{void act(async()=>{await request('/api/accounts/me/password',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:oldPassword,newPassword,confirmPassword})});setOld('');setNew('');setConfirm('');setMessage('Đã đổi mật khẩu. Các phiên cũ bị thu hồi; hãy đăng nhập lại.');});}}/></Card>{message?<Text accessibilityRole="alert">{message}</Text>:null}</ScrollView>;
}
