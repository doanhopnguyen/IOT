import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { AppModal, Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { ApiError } from '../services/api/client';
import { productSetup } from '../services/api/activationInput';
import { deviceDisplayName, parseScannedProductQr, type ProductSetup } from '../services/api/productQr';
import { activationPage, checkRestartConnection, claimProduct, inspectProduct, type InventoryDevice } from '../services/api/activationService';
import { canJoinSetupWifi, connectSetupWifi, openSetupPortal, openWifiSettings } from '../services/setupWifi';
import { DeviceSetup } from './DeviceSetup';
import { SetupProgress } from './SetupProgress';
import type { SetupPage } from '../services/api/setupService';
export type { InventoryDevice } from '../services/api/activationService';

export function ActivationWizard({ open, close, onCreated }: { open: boolean; close: () => void; onCreated: () => Promise<void> }) {
  const [code, setCode] = useState(''), [draft, setDraft] = useState<ProductSetup>();
  const [product, setProduct] = useState<ProductSetup>();
  const [name, setName] = useState(''), [scanner, setScanner] = useState(false);
  const [permission, ask] = useCameraPermissions();
  const [device, setDevice] = useState<InventoryDevice>();
  const [busy, setBusy] = useState(false), [wifiBusy, setWifiBusy] = useState(false);
  const [error, setError] = useState(''), [wifiMessage, setWifiMessage] = useState('');
  const [online, setOnline] = useState(false), [refreshKey, setRefreshKey] = useState(0);
  const [restartConfirmed, setRestartConfirmed] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupPage>('PINS');
  const scanLocked = useRef(false), autoJoinCode = useRef('');
  const wifiEpoch = useRef(0);
  const page = activationPage({ hasDevice: Boolean(device), hasProduct: Boolean(product), online, restartConfirmed });
  useEffect(() => {
    if (!open) {
      setCode(''); setDraft(undefined); setProduct(undefined); setName(''); setDevice(undefined);
      setError(''); setWifiMessage(''); setScanner(false); setOnline(false); setBusy(false); setWifiBusy(false);
      setRestartConfirmed(false);
      scanLocked.current = false; autoJoinCode.current = '';
      wifiEpoch.current++;
    }
  }, [open]);
  useEffect(() => {
    if (!open || !product || device || online) return;
    let active = true, running = false, blocked = false;
    const refresh = async () => {
      if (!active || running || blocked || AppState.currentState === 'background') return;
      running = true;
      try {
        const info = await inspectProduct(product);
        if (!active) return;
        if (info.online === true) {
          setOnline(true); setError(''); setName(value => value || deviceDisplayName(info.deviceUid, info.name));
        } else if (product.ssid && product.password && canJoinSetupWifi && autoJoinCode.current !== product.activationCode) {
          autoJoinCode.current = product.activationCode; setWifiBusy(true);
          const epoch = ++wifiEpoch.current;
          void connectSetupWifi(product).then(() => { if (active) setWifiMessage('Đã gửi Wi-Fi cho điện thoại. Chọn kết nối, giữ mạng của cửa dù không có Internet, rồi mở trang thiết lập.'); })
            .catch(e => { if (active) setWifiMessage(e instanceof Error ? e.message : 'Chưa kết nối được Wi-Fi của cửa.'); })
            .finally(() => { if (epoch === wifiEpoch.current) setWifiBusy(false); });
        }
      } catch (e) {
        if (active) {
          const fatal = e instanceof ApiError && [400, 401, 403, 404, 409].includes(e.status);
          blocked = fatal;
          setError(fatal ? e.message : 'Đang chờ cửa kết nối. Nếu vừa chọn Wi-Fi cho cửa, đưa điện thoại về mạng có Internet; app sẽ tự tiếp tục.');
        }
      } finally { running = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 3000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [open, product, device, online, refreshKey]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Chưa thực hiện được. Kiểm tra kết nối rồi thử lại.'); }
    finally { setBusy(false); }
  };
  const accept = (data: string, raw?: string) => {
    const parsed = parseScannedProductQr({ data, raw });
    setCode(parsed.activationCode); setDraft(parsed); setProduct(parsed); setOnline(false); setScanner(false); setError(''); setWifiMessage('');
    setRestartConfirmed(false);
  };
  const join = async () => {
    if (!product) return;
    const epoch = ++wifiEpoch.current;
    setWifiBusy(true); setError('');
    try {
      const result = await connectSetupWifi(product);
      setWifiMessage(result === 'saved' ? 'Điện thoại đã nhận thông tin Wi-Fi. Kết nối mạng của cửa rồi mở trang thiết lập bên dưới.' : 'Chọn mạng của cửa trong Cài đặt Wi-Fi, hoặc dùng camera điện thoại quét cùng QR sản phẩm để tham gia mạng.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa mở được Wi-Fi của cửa.'); }
    finally { if (epoch === wifiEpoch.current) setWifiBusy(false); }
  };
  const finish = () => { close(); void onCreated().catch(() => {}); };
  return <AppModal visible={open} title="Thiết lập cửa mới" scrollKey={`${page}:${setupStep}`} onClose={() => { if (!busy && !wifiBusy) close(); }}>
    <View style={{ gap: 16 }}>
      {page === 'SCAN' ? <>
        <SetupProgress step={1} total={8} title="Quét QR sản phẩm" detail="QR chứa mã nhận cửa và Wi-Fi thiết lập của khóa." />
        {scanner && permission?.granted ? <CameraView style={{ height: 260, borderRadius: 14 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={event => {
          if (scanLocked.current) return; scanLocked.current = true;
          try { accept(event.data, event.raw); } catch (e) { setScanner(false); setError(e instanceof Error ? e.message : 'QR không hợp lệ.'); }
        }} /> : null}
        <Button title={scanner ? 'Đang quét QR…' : 'Quét QR trên khóa'} icon="qr-code-outline" onPress={() => {
          setError(''); scanLocked.current = false;
          void ask().then(result => { setScanner(result.granted); if (!result.granted) setError('Cho phép camera để quét QR, hoặc nhập mã nhận cửa bên dưới.'); });
        }} />
        <Text style={s.caption}>Có thể nhập mã nếu chưa quét được.</Text>
        <Input label="Mã nhận cửa" autoCapitalize="none" autoCorrect={false} value={code} placeholder="Nhập mã trên tem sản phẩm" onChangeText={value => {
          setError('');
          try { const parsed = productSetup(value); setDraft(parsed); setCode(parsed.activationCode); }
          catch { setDraft(undefined); setCode(value); }
        }} />
        <Button title="Tiếp tục" variant="ghost" disabled={!code.trim()} onPress={() => {
          try {
            if (draft && draft.activationCode === code.trim()) { setProduct(draft); setOnline(false); setRestartConfirmed(false); setError(''); }
            else accept(code);
          } catch (e) { setError(e instanceof Error ? e.message : 'Mã nhận cửa không hợp lệ.'); }
        }} />
      </> : page === 'WIFI' && product ? <>
        <SetupProgress step={2} total={8} title="Kết nối Wi-Fi cho cửa" detail="Kết nối điện thoại với khóa, rồi chọn Wi-Fi 2.4 GHz để khóa sử dụng." />
        <Card><Text style={s.heading}>{deviceDisplayName(product.deviceUid, product.name)}</Text><Badge label="Đã quét sản phẩm" tone="success" />
          <Text selectable style={s.caption}>Mã nhận cửa: {product.activationCode}</Text>
        </Card>
        <Text style={s.description}>Mạng của khóa: {product.ssid ?? 'SmartDoor-… (xem màn hình khóa)'}</Text>
        <Button title={wifiBusy ? 'Đang chờ điện thoại xác nhận…' : canJoinSetupWifi && product.ssid ? 'Kết nối Wi-Fi của khóa' : 'Mở Wi-Fi để kết nối khóa'} icon="wifi-outline" disabled={wifiBusy} onPress={() => { void join(); }} />
        {product.password ? <Text selectable style={s.caption}>Mật khẩu mạng của khóa: {product.password}</Text> : null}
        {!canJoinSetupWifi ? <Text style={s.caption}>Camera hệ thống có thể quét cùng QR sản phẩm để lấy sẵn Wi-Fi. Nếu điện thoại không nhận, chọn mạng và mật khẩu ở trên.</Text> : null}
        {canJoinSetupWifi ? <Button title="Chọn Wi-Fi trong Cài đặt điện thoại" variant="ghost" disabled={wifiBusy} onPress={() => { void run(openWifiSettings); }} /> : null}
        <Button title="Mở trang chọn Wi-Fi cho khóa" variant="ghost" disabled={wifiBusy} onPress={() => { void run(openSetupPortal); }} />
        <Text style={s.caption}>Bấm Hoàn tất trên trang của khóa và chờ báo Đã lưu Wi-Fi. Nhấn rồi thả RST/EN hoặc rút nguồn khóa 5 giây rồi cấp lại; chờ khóa kết nối lại và đưa điện thoại về mạng có Internet. Bước tiếp theo sẽ nhắc bạn xác nhận đã khởi động lại trước khi nhận cửa và đặt PIN.</Text>
        {wifiMessage ? <Notice tone="info">{wifiMessage}</Notice> : null}
        <Button title="Kiểm tra lại kết nối" variant="ghost" disabled={busy || wifiBusy} onPress={() => { setError(''); setRefreshKey(key => key + 1); }} />
        <Button title="Quét lại sản phẩm" variant="ghost" disabled={wifiBusy} onPress={() => { setProduct(undefined); setOnline(false); setRestartConfirmed(false); setError(''); autoJoinCode.current = ''; }} />
      </> : page === 'RESTART' && product ? <>
        <SetupProgress step={3} total={8} title="Khởi động lại cửa sau khi lưu Wi-Fi" detail="Thực hiện một lần trước khi nhận cửa và lưu hai mã PIN." />
        <Notice tone="info">Chỉ thực hiện sau khi trang thiết lập báo Đã lưu Wi-Fi. Nhấn rồi thả nút RST/EN trên bo, hoặc rút nguồn cửa 5 giây rồi cấp lại.</Notice>
        <Text style={s.description}>Chờ cửa khởi động và tự kết nối Wi-Fi đã lưu. Đưa điện thoại về mạng có Internet, sau đó bấm nút bên dưới để kiểm tra kết nối dịch vụ.</Text>
        <Text style={s.caption}>Đây là khởi động lại, không phải khôi phục mặc định. Không giữ BOOT và không chọn xóa dữ liệu cửa.</Text>
        <Button title={busy ? 'Đang kiểm tra kết nối…' : 'Tôi đã khởi động lại · kiểm tra kết nối'} disabled={busy || wifiBusy} onPress={() => { void run(async () => {
          const info = await checkRestartConnection(product);
          setName(value => value || deviceDisplayName(info.deviceUid, info.name)); setRestartConfirmed(true);
        }); }} />
      </> : page === 'NAME' && product ? <>
        <SetupProgress step={4} total={8} title="Đặt tên cửa" detail="Đặt một tên dễ nhớ để phân biệt các cửa của bạn." />
        <Badge label="Cửa đã kết nối" tone="success" />
        <Text style={s.description}>{deviceDisplayName(product.deviceUid, product.name)}</Text>
        <Text selectable style={s.caption}>Mã nhận cửa: {product.activationCode}</Text>
        <Input label="Tên cửa" value={name} onChangeText={setName} maxLength={100} placeholder="Ví dụ: Cửa nhà, Cửa văn phòng" editable={!busy} />
        <Button title={busy ? 'Đang nhận cửa…' : 'Nhận cửa và tiếp tục'} disabled={busy || !name.trim()} onPress={() => { void run(async () => {
          const claimed = await claimProduct(product, name); setDevice(claimed); setCode(''); setDraft(undefined); setProduct(undefined);
          await onCreated().catch(() => {});
        }); }} />
        <Button title="Quét sản phẩm khác" variant="ghost" disabled={busy} onPress={() => { setProduct(undefined); setOnline(false); setRestartConfirmed(false); setName(''); setError(''); }} />
      </> : device?.unitId ? <>
        <Text style={s.caption}>{name.trim() || deviceDisplayName(device.deviceUid, device.name)}</Text>
        <DeviceSetup unitId={device.unitId} stepOffset={4} onStepChange={setSetupStep} onComplete={finish} />
      </> : null}
      {error ? <Notice tone="warning">{error}</Notice> : null}
    </View>
  </AppModal>;
}
