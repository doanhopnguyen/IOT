import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Text } from 'react-native';
import { setupInstruction, setupService, validateSetupPins, type SetupStatus } from '../services/api/setupService';
import { managerService, type CommandDto } from '../services/api/managerService';
import { Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { ServoSettings } from './ServoSettings';

async function acknowledged(command: CommandDto) {
  const result = await managerService.waitForCommand(command);
  if (result.status === 'FAILED' && result.resultMessage?.startsWith('DEVICE_BUSY')) throw new Error('Cửa đang hiệu chỉnh hoặc thực hiện thao tác khác. Hoàn tất thao tác trên chip rồi thử lại.');
  if (result.status !== 'ACKNOWLEDGED') throw new Error(result.status === 'TIMEOUT' || result.status === 'SENT' || result.status === 'PENDING'
    ? 'Chưa nhận xác nhận từ cửa. Kiểm tra kết nối và cập nhật trạng thái trước khi thử lại.'
    : `Cửa chưa thực hiện được: ${result.resultMessage ?? result.status}`);
}

export function DeviceSetup({ unitId }: { unitId: number }) {
  const [status, setStatus] = useState<SetupStatus>();
  const [pin, setPin] = useState(''), [confirmPin, setConfirmPin] = useState('');
  const [adminPin, setAdminPin] = useState(''), [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [pinsAcknowledged, setPinsAcknowledged] = useState(false);
  const [editingPins, setEditingPins] = useState(false);
  const reload = useCallback(async () => { setStatus(await setupService.status(unitId)); }, [unitId]);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const next = await setupService.status(unitId); if (active) { setStatus(next); setError(''); } } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Chưa tải được trạng thái cửa.'); } };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Chưa thực hiện được.'); } finally { setBusy(false); }
  };
  const pins = { pin, confirmPin, adminPin, confirmAdminPin };
  const needsPins = !status?.doorPinSet || !status.adminPinSet;
  const showPinSetup = Boolean(status?.online && needsPins && !pinsAcknowledged);
  const showCalibration = Boolean(pinsAcknowledged || (status?.doorPinSet && status.adminPinSet));
  const servoCalibrating = status?.stage === 'SERVO_LOCK' || status?.stage === 'SERVO_OPEN';
  return <>
    <Card>
      <Text style={s.heading}>Thiết lập cửa</Text>
      <Badge label={!status?.online ? (status?.ready ? 'Offline · dùng tại cửa' : 'Chờ cửa online') : status.ready ? 'Đã hoàn tất' : 'Đang thiết lập'} tone={status?.ready && status.online ? 'success' : 'warning'} />
      <Text style={s.description}>{pinsAcknowledged ? 'Cửa đã xác nhận PIN. Màn hình cửa đang chuyển sang hiệu chỉnh.' : status ? setupInstruction(status) : 'Đang lấy hướng dẫn từ cửa…'}</Text>
      {showPinSetup || editingPins ? <>
        <Text style={s.caption}>PIN quản trị dùng để quản lý tại cửa và đổi Wi-Fi khi mất Internet. Chỉ tạo PIN ở app này.</Text>
        <Input label="PIN mở cửa · 6 số" value={pin} onChangeText={setPin} secureTextEntry keyboardType="numeric" />
        <Input label="Nhập lại PIN mở cửa" value={confirmPin} onChangeText={setConfirmPin} secureTextEntry keyboardType="numeric" />
        <Input label="PIN quản trị · 6 số khác PIN mở cửa" value={adminPin} onChangeText={setAdminPin} secureTextEntry keyboardType="numeric" />
        <Input label="Nhập lại PIN quản trị" value={confirmAdminPin} onChangeText={setConfirmAdminPin} secureTextEntry keyboardType="numeric" />
        <Button title={busy ? 'Đang chờ cửa xác nhận…' : 'Lưu PIN và chuyển sang hiệu chỉnh'} disabled={busy || !status?.online || Boolean(validateSetupPins(pins))} onPress={() => { void act(async () => {
          await acknowledged(await setupService.credentials(unitId, pins));
          setPinsAcknowledged(true); setEditingPins(false); setPin(''); setConfirmPin(''); setAdminPin(''); setConfirmAdminPin('');
          setMessage('Cửa đã xác nhận PIN và bắt đầu hiệu chỉnh. Làm theo hướng dẫn trên màn hình cửa.');
        }); }} />
      </> : null}
      {showCalibration ? <>
        <Text style={s.caption}>Cảm ứng: {status?.touchCalibrated ? 'Đã xác nhận' : 'Chờ hiệu chỉnh'} · Cảm biến cửa: {status?.doorCalibrated ? 'Đã xác nhận' : 'Chờ hiệu chỉnh'} · Servo: {status?.servoCalibrated ? 'Đã xác nhận' : 'Chờ thử vị trí khóa/mở'}</Text>
        {status?.servoCommandAngle != null ? <Text style={s.caption}>Lệnh servo gần nhất: {status.servoCommandAngle}° · {status.servoDirection === 'INCREASE' ? 'Tăng góc' : status.servoDirection === 'DECREASE' ? 'Giảm góc' : status.servoDirection === 'HOLD' ? 'Giữ nguyên góc' : 'Chưa biết góc trước đó'}. Đây là góc đã ra lệnh, không phải số đo vị trí thực.</Text> : null}
        <Button title="Đổi PIN mở cửa và PIN quản trị" variant="ghost" disabled={busy || !status?.online || servoCalibrating} onPress={() => setEditingPins(value => !value)} />
        <Button title="Bắt đầu lại hiệu chỉnh trên cửa" variant="ghost" disabled={busy || !status?.online || servoCalibrating} onPress={() => { void act(async () => {
          await acknowledged(await setupService.calibrate(unitId)); setMessage('Đã bắt đầu hiệu chỉnh. Thao tác tại màn hình cửa theo hướng dẫn ở trên.');
        }); }} />
      </> : null}
      <Button title="Cập nhật tiến độ" variant="ghost" disabled={busy} onPress={() => { void act(reload); }} />
      {message ? <Notice tone="info">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
    {showCalibration ? <ServoSettings key={unitId} unitId={unitId} online={status?.online ?? false} calibrating={servoCalibrating} /> : null}
    {showCalibration ? <Card>
      <Text style={s.heading}>Wi-Fi của cửa</Text>
      <Text style={s.description}>{status?.wifiSsid ? `Mạng đã lưu: ${status.wifiSsid}` : 'Chưa có thông tin mạng.'}</Text>
      <Text style={s.description}>1. Mở chế độ đổi Wi-Fi. 2. Kết nối điện thoại với mạng SmartDoor; trang thường tự bật, nếu chưa thì mở trang bên dưới. 3. Nhập lại PIN admin, chọn mạng mới, bấm Hoàn tất rồi trở lại app.</Text>
      <Button title="Mở chế độ đổi Wi-Fi" icon="wifi-outline" disabled={busy || !status?.online} onPress={() => { void act(async () => {
        await acknowledged(await setupService.wifi(unitId)); setMessage('Cửa đã mở mạng SmartDoor. Xem tên và mật khẩu trên màn hình; trang Wi-Fi sẽ yêu cầu PIN admin trước khi đổi mạng.');
      }); }} />
      {Platform.OS === 'android' ? <Button title="Mở cài đặt Wi-Fi điện thoại" variant="ghost" onPress={() => { void Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => setError('Mở Cài đặt → Wi-Fi trên điện thoại.')); }} /> : null}
      <Button title="Mở trang chọn Wi-Fi của cửa" variant="ghost" onPress={() => { void Linking.openURL('http://192.168.4.1').catch(() => setError('Kết nối mạng SmartDoor trước khi mở trang.')); }} />
      <Text style={s.caption}>Khi cửa mất mạng, ESP32 lần lượt thử tối đa 5 mạng đã lưu và tự mở mạng SmartDoor sau khoảng 30 giây. Trên cửa, vào ADMIN → WI-FI bằng PIN admin; trang Wi-Fi cũng yêu cầu nhập lại PIN trước mỗi lần đổi mạng. Chỉ lưu mạng mới sau khi kết nối thành công.</Text>
    </Card> : null}
  </>;
}
