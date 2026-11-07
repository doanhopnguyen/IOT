import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { setupInstruction, setupPage, setupService, validateSetupPins, type SetupPage, type SetupStatus } from '../services/api/setupService';
import { managerService, type CommandDto } from '../services/api/managerService';
import { openSetupPortal, openWifiSettings } from '../services/setupWifi';
import { Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { ServoSettings } from './ServoSettings';
import { SetupProgress } from './SetupProgress';
import { LaptopAiSetup } from './LaptopAiSetup';

async function acknowledged(command: CommandDto) {
  const result = await managerService.waitForCommand(command);
  if (result.status === 'FAILED' && result.resultMessage?.includes('STORAGE')) throw new Error('Cửa chưa lưu được cấu hình. Nếu vừa lưu Wi-Fi lần đầu, nhấn/thả RST/EN hoặc rút nguồn 5 giây rồi cấp lại; chờ cửa online và thử lưu PIN lại. Không khôi phục mặc định.');
  if (result.status === 'FAILED' && result.resultMessage?.startsWith('DEVICE_BUSY')) throw new Error('Cửa đang bận. Hoàn tất thao tác trên màn hình cửa rồi thử lại.');
  if (result.status !== 'ACKNOWLEDGED') throw new Error('Chưa nhận xác nhận từ cửa. Kiểm tra kết nối; app sẽ tiếp tục khi cửa phản hồi.');
}
const pages: Record<SetupPage, { title: string; position: number }> = {
  PINS: { title: 'Tạo hai mã PIN', position: 1 }, TOUCH: { title: 'Hiệu chỉnh cảm ứng', position: 2 },
  DOOR_CLOSED: { title: 'Xác nhận cánh cửa đóng', position: 3 }, DOOR_OPEN: { title: 'Xác nhận cánh cửa mở', position: 4 },
  SERVO_LOCK: { title: 'Căn vị trí khóa', position: 5 }, SERVO_OPEN: { title: 'Căn vị trí mở', position: 6 },
  VERIFY: { title: 'Chờ cửa hoàn tất', position: 6 }, COMPLETE: { title: 'Cửa đã sẵn sàng', position: 6 },
};
interface Props { unitId: number; onComplete?: () => void; onStepChange?: (page: SetupPage) => void; stepOffset?: number; }
export function DeviceSetup(props: Props) { return <DeviceSetupFlow key={props.unitId} {...props} />; }
function DeviceSetupFlow({ unitId, onComplete, onStepChange, stepOffset = 0 }: Props) {
  const [status, setStatus] = useState<SetupStatus>();
  const [pin, setPin] = useState(''), [confirmPin, setConfirmPin] = useState('');
  const [adminPin, setAdminPin] = useState(''), [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [loadError, setLoadError] = useState(''), [pinsAcknowledged, setPinsAcknowledged] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [view, setView] = useState<'home' | 'pins' | 'servo' | 'wifi'>('home');
  const reload = useCallback(async () => {
    const next = await setupService.status(unitId); setStatus(next); setLoadError('');
    if (!next.ready) setRestarting(false);
  }, [unitId]);
  useEffect(() => {
    let active = true, running = false;
    const refresh = async () => {
      if (running) return; running = true;
      try {
        const next = await setupService.status(unitId);
        if (active) { setStatus(next); setLoadError(''); if (!next.ready) setRestarting(false); }
      } catch (e) { if (active) setLoadError(e instanceof Error ? e.message : 'Chưa nhận được trạng thái cửa.'); }
      finally { running = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);
  const effective = status && restarting && status.ready ? { ...status, ready: false, touchCalibrated: false, stage: 'TOUCH_1' } : status;
  const page = effective ? setupPage(effective, pinsAcknowledged) : undefined;
  useEffect(() => { if (page) onStepChange?.(page); }, [page, onStepChange]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Chưa thực hiện được.'); }
    finally { setBusy(false); }
  };
  const clearPins = () => { setPin(''); setConfirmPin(''); setAdminPin(''); setConfirmAdminPin(''); };
  const pins = { pin, confirmPin, adminPin, confirmAdminPin };
  const pinForm = <>
    <Text style={s.description}>Dùng PIN mở cửa hằng ngày. PIN quản trị dành cho quản lý trực tiếp tại cửa; hai mã phải khác nhau.</Text>
    <Input label="PIN mở cửa · 6 số" value={pin} onChangeText={setPin} secureTextEntry keyboardType="numeric" maxLength={6} editable={!busy} />
    <Input label="Nhập lại PIN mở cửa" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry keyboardType="numeric" maxLength={6} editable={!busy} />
    <Input label="PIN quản trị · 6 số khác PIN mở cửa" value={adminPin} onChangeText={setAdminPin} secureTextEntry keyboardType="numeric" maxLength={6} editable={!busy} />
    <Input label="Nhập lại PIN quản trị" value={confirmAdminPin} onChangeText={setConfirmAdminPin} secureTextEntry keyboardType="numeric" maxLength={6} editable={!busy} />
    <Button title={busy ? 'Đang chờ cửa xác nhận…' : view === 'pins' ? 'Lưu hai PIN' : 'Lưu PIN và tiếp tục'} disabled={busy || !status?.online || Boolean(validateSetupPins(pins))} onPress={() => {
      void act(async () => {
        await acknowledged(await setupService.credentials(unitId, pins)); clearPins();
        if (view === 'pins') { setView('home'); setMessage('Đã đổi hai mã PIN.'); }
        else setPinsAcknowledged(true);
        await reload();
      });
    }} />
  </>;
  if (!effective || !page) return <Card><Text style={s.heading}>Đang lấy tiến độ thiết lập…</Text>{loadError ? <Notice tone="error">{loadError}</Notice> : null}</Card>;
  const feedback = <>
    {message ? <Notice tone="info">{message}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {loadError ? <Notice tone="warning">{loadError}</Notice> : null}
  </>;
  if (page !== 'COMPLETE') return <Card>
    <SetupProgress step={pages[page].position + stepOffset} total={6 + stepOffset} title={pages[page].title} />
    {!effective.online ? <Notice tone="warning">Cửa đang mất kết nối. Giữ nguồn ổn định; tiếp tục theo màn hình cửa, app sẽ tự cập nhật khi kết nối lại.</Notice> : null}
    {page === 'PINS' ? <>
      <Notice tone="info">Sau khi trang Wi-Fi báo Đã lưu, hãy khởi động lại cửa một lần trước lần lưu PIN đầu tiên: nhấn/thả RST/EN hoặc rút nguồn 5 giây rồi cấp lại. Chờ cửa online. Không khôi phục mặc định.</Notice>
      {pinForm}
    </> : <>
      <Text style={s.description}>{page === 'VERIFY' ? 'Các bước đã được xác nhận. Đang chờ cửa báo sẵn sàng…' : setupInstruction({ ...effective, online: true, doorPinSet: true, adminPinSet: true })}</Text>
      <View style={{ padding: 18, borderRadius: 12, backgroundColor: '#EFF5FF', gap: 8 }}>
        <Text style={s.heading}>{page === 'TOUCH' ? `Điểm ${effective.stage.startsWith('TOUCH_') ? effective.stage.slice(6) : '1'} / 4` : page === 'DOOR_CLOSED' ? 'Đóng cánh cửa' : page === 'DOOR_OPEN' ? 'Mở cánh cửa' : page === 'SERVO_LOCK' ? 'LOCK · vị trí khóa' : page === 'SERVO_OPEN' ? 'OPEN · vị trí mở' : 'Đang xác nhận'}</Text>
        <Text style={s.description}>Thực hiện trên màn hình thiết bị. App tự chuyển sang bước tiếp theo khi cửa xác nhận.</Text>
      </View>
      {page.startsWith('SERVO_') ? <Text style={s.caption}>Chọn RANGE 180/360 theo servo. Các nút ±1°/±5° quay thử ngay; quan sát chốt, chờ dừng rồi xác nhận.</Text> : null}
    </>}
    <Button title="Kiểm tra tiến độ" variant="ghost" disabled={busy} onPress={() => { void act(reload); }} />
    {feedback}
  </Card>;
  if (onComplete) return <Card>
    <Badge label="Hoàn tất" tone="success" />
    <Text style={s.heading}>Cửa đã sẵn sàng</Text>
    <Text style={s.description}>Đã lưu PIN và xác nhận cảm ứng, cảm biến cửa, vị trí khóa/mở. Bạn có thể thêm thẻ, vân tay và thành viên.</Text>
    <LaptopAiSetup unitId={unitId} />
    <Button title="Về danh sách cửa" icon="checkmark-circle-outline" onPress={onComplete} />
    {feedback}
  </Card>;
  if (view === 'servo') return <>
    <Button title="Quay lại thiết lập cửa" variant="ghost" onPress={() => setView('home')} />
    <ServoSettings unitId={unitId} online={effective.online} />
  </>;
  if (view === 'pins') return <Card>
    <Text style={s.heading}>Đổi hai mã PIN</Text>{pinForm}
    <Button title="Quay lại" variant="ghost" disabled={busy} onPress={() => { clearPins(); setView('home'); }} />{feedback}
  </Card>;
  if (view === 'wifi') return <Card>
    <Text style={s.heading}>Đổi Wi-Fi của cửa</Text>
    <Text style={s.description}>Mạng đã lưu: {effective.wifiSsid || 'Chưa có thông tin'}</Text>
    <Text style={s.description}>Mở Wi-Fi của cửa, quét QR trên màn hình bằng camera điện thoại để tham gia mạng. Chọn Wi-Fi mới trên trang thiết lập; với cửa đã nhận, trang yêu cầu PIN quản trị.</Text>
    <Button title="Mở Wi-Fi thiết lập trên cửa" disabled={busy || !effective.online} onPress={() => { void act(async () => {
      await acknowledged(await setupService.wifi(unitId)); setMessage('Đã mở Wi-Fi thiết lập. Quét QR trên màn hình cửa để kết nối.');
    }); }} />
    <Button title="Mở cài đặt Wi-Fi điện thoại" variant="ghost" onPress={() => { void act(openWifiSettings); }} />
    <Button title="Mở trang chọn Wi-Fi" variant="ghost" onPress={() => { void act(openSetupPortal); }} />
    <Button title="Quay lại" variant="ghost" disabled={busy} onPress={() => setView('home')} />{feedback}
  </Card>;
  return <Card>
    <Text style={s.heading}>Thiết lập cửa</Text><Badge label="Đã hoàn tất" tone="success" />
    <Button title="Chỉnh góc khóa / mở" variant="ghost" onPress={() => { setError(''); setMessage(''); setView('servo'); }} />
    <Button title="Đổi PIN mở cửa và PIN quản trị" variant="ghost" onPress={() => { setError(''); setMessage(''); setView('pins'); }} />
    <Button title="Đổi Wi-Fi của cửa" variant="ghost" onPress={() => { setError(''); setMessage(''); setView('wifi'); }} />
    <Button title="Hiệu chỉnh lại cảm ứng, cảm biến và servo" variant="ghost" disabled={busy || !effective.online} onPress={() => { void act(async () => {
      await acknowledged(await setupService.calibrate(unitId)); setRestarting(true); await reload();
    }); }} />{feedback}
  </Card>;
}
