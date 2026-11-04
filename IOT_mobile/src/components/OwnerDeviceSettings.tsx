import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text } from 'react-native';
import { request } from '../services/api/client';
import { Button, Card, Input } from './ui';
import type { InventoryDevice } from './ActivationWizard';
import { CameraNodeSettings } from './CameraNodeSettings';

export function OwnerDeviceSettings({ unitId, back }: { unitId: number; back: () => void }) {
  const [device, setDevice] = useState<InventoryDevice>(); const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState(''); const [recipientEmail, setRecipient] = useState('');
  const [pin, setPin] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const reload = async () => { if (device) setDevice(await request(`/api/activation/devices/${device.deviceUid}`)); else { const rows = await request<InventoryDevice[]>('/api/activation/mine'); setDevice(rows.find(d => d.unitId === unitId)); } };
  useEffect(() => { void reload().catch(e => setMessage(e.message)); }, [unitId]);
  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Lỗi kết nối.'); } finally { setBusy(false); } };
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: 100 }}><Button title="← Quay lại" variant="ghost" onPress={back} /><Text style={{ fontSize: 25, fontWeight: '700' }}>Cài đặt cửa</Text>
    <Card><Text>{device ? `${device.deviceUid} · ${device.state}` : 'Đang lấy thông tin thiết bị...'}</Text><Text>Cánh cửa: {device?.doorClosed == null ? 'Chưa có dữ liệu' : device.doorClosed ? 'Đóng' : 'Mở'} · Lệnh chốt: {device?.latchReleased == null ? 'Không rõ' : device.latchReleased ? 'Nhả' : 'Khóa'}</Text><Button title="Cập nhật trạng thái" disabled={busy} onPress={() => { void act(reload); }} /><Button title="Trang Wi-Fi tại cửa" variant="ghost" onPress={() => { void Linking.openURL('http://192.168.4.1'); }} /></Card>
    <Card><Text>Đổi PIN mở cửa (không xem lại PIN cũ)</Text><Input value={pin} onChangeText={setPin} secureTextEntry keyboardType="numeric" placeholder="6 số mới" /><Button title="Gửi yêu cầu đổi PIN" disabled={busy || !/^\d{6}$/.test(pin)} onPress={() => { void act(async () => { await request(`/api/manager/units/${unitId}/pin`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, confirmPin: pin }) }); setPin(''); setMessage('Đã gửi yêu cầu; chỉ áp dụng khi thiết bị ACK.'); }); }} /></Card>
    <Card><Text style={{ fontWeight: '700', color: '#b91c1c' }}>Reset toàn bộ / Chuyển giao</Text><Text>Xóa dữ liệu cửa, PIN, Wi-Fi, thẻ, vân tay, thành viên và lịch sử. Không thể khôi phục. Nhập email người nhận nếu chuyển giao; để trống nếu chỉ reset.</Text>
      <Input value={recipientEmail} onChangeText={setRecipient} placeholder="Email người nhận (nếu có)" />
      <Input value={confirmation} onChangeText={setConfirmation} placeholder="Nhập đúng device UID để xác nhận xóa" />
      <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Mật khẩu tài khoản hiện tại" />
      <Button title="Xác nhận xóa toàn bộ" variant="danger" disabled={busy || !device || confirmation !== device.deviceUid || !password} onPress={() => { void act(async () => { await request(`/api/activation/devices/${device!.deviceUid}/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, confirmation, recipientEmail }) }); setPassword(''); setMessage('Đang reset. Nhấn cập nhật để kiểm tra, không coi là hoàn tất trước khi thiết bị xác nhận.'); await reload(); }); }} />
    </Card>{device?.state === 'INVENTORY' && device.operationUuid ? <Card><Text>Thiết bị đã reset. Xác thực lại để cấp mã nhận mới.</Text><Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Mật khẩu tài khoản" /><Button title="Cấp mã kích hoạt mới" disabled={busy || !password} onPress={() => { void act(async () => { const r = await request<{ activationCode: string }>(`/api/activation/devices/${device.deviceUid}/issue-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); setPassword(''); setMessage(`Mã bàn giao mới: ${r.activationCode}`); }); }} /></Card> : null}
    {device?.unitId ? <CameraNodeSettings unitId={unitId} /> : null}
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </ScrollView>;
}
