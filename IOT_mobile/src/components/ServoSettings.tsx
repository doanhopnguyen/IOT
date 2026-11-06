import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { managerService } from '../services/api/managerService';
import { servoService, stepServoAngle, validateServoAngles, type ServoAngles } from '../services/api/servoService';
import { Button, Card, Input, Notice, styles as s } from './ui';

export function ServoSettings({ unitId, online, calibrating = false }: { unitId: number; online: boolean; calibrating?: boolean }) {
  const [reported, setReported] = useState<ServoAngles>();
  const [lock, setLock] = useState(''), [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const initialized = useRef(false);
  useEffect(() => {
    let active = true; initialized.current = false;
    const refresh = async () => {
      try {
        const angles = await servoService.get(unitId);
        if (!active) return;
        setReported(angles);
        if (!initialized.current && angles.lockAngle != null && angles.openAngle != null) {
          setLock(String(angles.lockAngle)); setOpen(String(angles.openAngle)); initialized.current = true;
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Chưa đọc được góc servo.'); }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);
  const inputError = !/^\d+$/.test(lock) || !/^\d+$/.test(open)
    ? 'Nhập đủ hai góc.' : validateServoAngles(Number(lock), Number(open));
  const save = async () => {
    if (inputError) { setError(inputError); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await managerService.waitForCommand(await servoService.set(unitId, Number(lock), Number(open)));
      if (result.status !== 'ACKNOWLEDGED') throw new Error(result.resultMessage === 'DEVICE_BUSY'
        ? 'Cửa đang mở khóa hoặc hiệu chỉnh. Hoàn tất thao tác trên cửa rồi lưu lại góc.'
        : 'Chưa nhận được xác nhận lưu từ cửa. Cập nhật góc từ cửa trước khi thử lại.');
      setMessage(`Cửa đã xác nhận lưu: khóa ${Number(lock)}°, mở ${Number(open)}°. Góc áp dụng ở lệnh mở/khóa tiếp theo.`);
      initialized.current = true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa lưu được góc servo.'); }
    finally { setBusy(false); }
  };
  return <Card>
    <Text style={s.heading}>Góc servo</Text>
    <Text style={s.description}>Nhập góc hoặc dùng nút ±5°. Cho phép góc khóa và góc mở bằng nhau để chỉnh qua vị trí giữa.</Text>
    <Text style={s.caption}>Thiết bị báo: {reported?.lockAngle == null || reported.openAngle == null ? 'Chờ cửa gửi góc đang lưu' : `khóa ${reported.lockAngle}° · mở ${reported.openAngle}°`}</Text>
    <Input label="Góc khóa (5–175°)" keyboardType="numeric" value={lock} onChangeText={value => { initialized.current = true; setLock(value); }} editable={!busy} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Button title="Khóa −5°" variant="ghost" disabled={busy || !lock} onPress={() => setLock(value => stepServoAngle(value, -5))} /></View>
      <View style={{ flex: 1 }}><Button title="Khóa +5°" variant="ghost" disabled={busy || !lock} onPress={() => setLock(value => stepServoAngle(value, 5))} /></View>
    </View>
    <Input label="Góc mở (5–175°)" keyboardType="numeric" value={open} onChangeText={value => { initialized.current = true; setOpen(value); }} editable={!busy} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Button title="Mở −5°" variant="ghost" disabled={busy || !open} onPress={() => setOpen(value => stepServoAngle(value, -5))} /></View>
      <View style={{ flex: 1 }}><Button title="Mở +5°" variant="ghost" disabled={busy || !open} onPress={() => setOpen(value => stepServoAngle(value, 5))} /></View>
    </View>
    {lock && open && !inputError && Number(lock) === Number(open) ? <Notice>Hai góc đang bằng nhau: mở và khóa sẽ dùng cùng một vị trí servo.</Notice> : null}
    <Button title={busy ? 'Đang chờ cửa xác nhận…' : 'Lưu góc servo'} disabled={busy || !online || calibrating || Boolean(inputError)} onPress={() => { void save(); }} />
    <Button title="Lấy góc đang lưu từ cửa" variant="ghost" disabled={busy} onPress={() => {
      setError(''); void servoService.get(unitId).then(angles => {
        setReported(angles); if (angles.lockAngle != null && angles.openAngle != null) {
          initialized.current = true; setLock(String(angles.lockAngle)); setOpen(String(angles.openAngle));
        }
      }).catch(e => setError(e instanceof Error ? e.message : 'Chưa đọc được góc.'));
    }} />
    <Text style={s.caption}>{calibrating ? 'Đang thử và xác nhận vị trí servo trên chip. Hoàn tất bước đó trước khi lưu góc từ app.' : online ? 'Lưu góc không làm servo xoay. Đóng cửa và khóa chốt trước khi đổi góc; thử bằng lệnh mở/khóa khi đã sẵn sàng.' : 'Cửa cần online để lưu góc từ app. Bạn vẫn có thể chỉnh tại SERVO SETUP trên chip.'}</Text>
    {message ? <Notice tone="info">{message}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
  </Card>;
}
