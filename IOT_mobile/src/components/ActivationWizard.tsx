import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AppModal, Button, Card, Input } from './ui';
import { ApiError, request } from '../services/api/client';
import { activationClaimInput, productSetup } from '../services/api/activationInput';

export interface InventoryDevice { deviceId: number; deviceUid: string; unitId: number | null; name: string; state: string; generation: number; setupReady: boolean; doorClosed: boolean | null; latchReleased: boolean | null; lastSeenAt: string | null; operationUuid: string | null; }
export function ActivationWizard({ open, close, onCreated }: { open: boolean; close: () => void; onCreated: () => Promise<void> }) {
  const { height } = useWindowDimensions();
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [scanner, setScanner] = useState(false); const [permission, ask] = useCameraPermissions();
  const [device, setDevice] = useState<InventoryDevice>();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  let setup: ReturnType<typeof productSetup> | undefined;
  try { if (code.trim()) setup = productSetup(code); } catch { /* Show validation when submitting or scanning. */ }
  useEffect(() => { if (!open) { setCode(''); setName(''); setDevice(undefined); setMessage(''); setScanner(false); } }, [open]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(''); try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Chưa thực hiện được. Kiểm tra kết nối Internet rồi thử lại.'); } finally { setBusy(false); } };
  const claim = async () => {
    const input = activationClaimInput(code, name);
    try {
      const d = await request<InventoryDevice>('/api/activation/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      setDevice(d); await onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) throw new Error('Mã nhận cửa không hợp lệ hoặc đã được sử dụng. Kiểm tra QR trên sản phẩm hoặc liên hệ nơi bán.');
      if (e instanceof ApiError && e.status === 400) throw new Error('Kiểm tra mã nhận cửa trên sản phẩm và tên cửa. Không dùng mã MAC hoặc PIN thay cho mã nhận cửa.');
      throw e;
    }
  };
  const check = async () => { if (device) { const d = await request<InventoryDevice>(`/api/activation/devices/${encodeURIComponent(device.deviceUid)}`); setDevice(d); setMessage(d.setupReady ? 'Cửa đã sẵn sàng sử dụng.' : 'Cửa đang hoàn tất thiết lập. Kiểm tra Wi-Fi, PIN và hiệu chỉnh cảm biến theo hướng dẫn trên màn hình cửa.'); } };
  return <AppModal visible={open} onClose={close} title="Thiết lập cửa mới">
    <ScrollView style={{ maxHeight: height * 0.72 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
    {!device ? <View style={{ gap: 14 }}>
      <Text style={{ fontWeight: '700' }}>1. Quét QR trên sản phẩm</Text><Text>Quét mã trên tem hoặc màn hình cửa. Mã sản phẩm và thông tin thiết lập đã được chuẩn bị sẵn.</Text>
      <Input value={code} onChangeText={setCode} placeholder="Mã nhận cửa hoặc nội dung QR" />
      {scanner && permission?.granted ? <CameraView style={{ height: 200 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={event => { try { productSetup(event.data); setCode(event.data); setScanner(false); setMessage(''); } catch (e) { setMessage(e instanceof Error ? e.message : 'QR không hợp lệ.'); } }} /> : null}
      <Button title="Quét QR sản phẩm" variant="ghost" onPress={() => { void ask().then(p => setScanner(p.granted)); }} />
      <Card><Text style={{ fontWeight: '700' }}>2. Kết nối Wi-Fi cho cửa</Text><Text>Trong cài đặt Wi-Fi điện thoại, kết nối mạng thiết lập của cửa. Mở trang thiết lập, chọn Wi-Fi trong nhà mà cửa tìm thấy và nhập mật khẩu. Bạn cũng có thể đặt PIN ngay trên trang này hoặc màn hình sản phẩm.</Text>
        <Text selectable>Mạng thiết lập: {setup?.ssid ?? 'SmartDoor-… (xem trên sản phẩm)'}</Text>
        <Text selectable>Mật khẩu: {setup?.password ?? 'Xem trên tem hoặc màn hình cửa'}</Text>
        {setup?.deviceUid ? <Text>Mã sản phẩm: {setup.deviceUid}</Text> : null}
        {Platform.OS === 'android' ? <Button title="Mở cài đặt Wi-Fi" variant="ghost" onPress={() => { void Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => setMessage('Mở Cài đặt → Wi-Fi trên điện thoại để chọn mạng của cửa.')); }} /> : null}
        <Button title="Mở trang thiết lập của cửa" variant="ghost" onPress={() => { void Linking.openURL('http://192.168.4.1'); }} />
        <Text>Sau khi lưu Wi-Fi, chọn hoàn tất trên trang thiết lập rồi mở lại Smart Door.</Text>
      </Card>
      <Text style={{ fontWeight: '700' }}>3. Nhận cửa vào tài khoản của bạn</Text><Input value={name} onChangeText={setName} placeholder="Đặt tên cửa, ví dụ Cửa nhà" />
      <Button title={busy ? 'Đang nhận cửa…' : 'Nhận cửa vào tài khoản'} disabled={busy || !code.trim() || !name.trim()} onPress={() => { void run(claim); }} />
    </View> : <View style={{ gap: 14 }}>
      <Text style={{ fontWeight: '700' }}>Đã nhận {device.name}</Text><Text>Mã sản phẩm: {device.deviceUid}</Text>
      <Text>Hoàn tất PIN, cảm ứng và cảm biến đóng/mở theo hướng dẫn trên sản phẩm. Cửa tự kết nối dịch vụ sau khi có Wi-Fi.</Text>
      <Button title="Kiểm tra cửa đã sẵn sàng" disabled={busy} onPress={() => { void run(check); }} />
      <Button title="Về danh sách cửa" variant="ghost" onPress={() => { void onCreated(); close(); }} />
    </View>}
    {message ? <Text accessibilityRole="alert" style={{ color: '#7c4c12', marginTop: 12 }}>{message}</Text> : null}
    </ScrollView>
  </AppModal>;
}
