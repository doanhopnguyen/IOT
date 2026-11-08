import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { managerService } from '../services/api/managerService';
import { servoService, type ServoAngles } from '../services/api/servoService';
import { commandToDemoAngle, demoAngleToCommand, parseDemoServoAngle, stepDemoServoAngle } from '../services/api/servoDisplay';
import { ServoPreviewQueue } from '../services/api/servoPreview';
import { servoSyncDecision, type ServoConfirmation } from '../services/api/servoSync';
import { Button, Card, Input, Notice, styles as s } from './ui';
import { colors, fonts } from '../theme/tokens';

function servoError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (code === 'SERVO_BUSY_OR_DOOR_OPEN') return 'Đóng cửa ổn định trước khi thử khóa hoặc đưa góc mở về 0°. Chờ thao tác cửa kết thúc rồi thử lại.';
  if (code === 'DEVICE_BUSY') return 'Cửa đang bận. Hoàn tất thao tác mở cửa, đăng ký hoặc hiệu chỉnh trên chip rồi thử lại.';
  if (code === 'EXPIRED_OR_CLOCK_INVALID' || code === 'STALE_SERVO_COMMAND') return 'Lệnh thử đã cũ hoặc mạng chậm. Kiểm tra kết nối rồi nhích lại góc.';
  if (code === 'SERVO_RANGE_MISMATCH' || code === 'INVALID_SERVO_ANGLES') return 'Cấu hình servo đã thay đổi. Bấm Lấy lại góc đang lưu rồi thử lại.';
  if (code === 'UNSUPPORTED_COMMAND') return 'Firmware hiện tại chưa hỗ trợ quay thử servo từ app.';
  return code;
}
async function acknowledged(command: Awaited<ReturnType<typeof servoService.preview>>) {
  const result = await managerService.waitForCommand(command, 6000, 150);
  if (result.status !== 'ACKNOWLEDGED') throw new Error(result.resultMessage || 'Chưa nhận được xác nhận từ cửa. Kiểm tra kết nối rồi thử lại.');
}

export function ServoSettings({ unitId, online, calibrating = false }: { unitId: number; online: boolean; calibrating?: boolean }) {
  const [reported, setReported] = useState<ServoAngles>();
  const [open, setOpen] = useState('');
  const [live, setLive] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const openRef = useRef('');
  const dirty = useRef(false), revision = useRef(0), confirmation = useRef<ServoConfirmation | undefined>(undefined);
  const editTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useMemo(() => new ServoPreviewQueue(async jog => {
    await acknowledged(await servoService.preview(unitId, jog.target, jog.angle, 180, 1));
    setMessage(`Cửa đã nhận góc thử ${commandToDemoAngle(jog.angle)}°. Kiểm tra chốt thực tế, rồi lưu góc mở.`);
  }, async () => { await acknowledged(await servoService.stopPreview(unitId)); }, e => {
    setError(servoError(e)); setMessage('');
  }), [unitId]);
  const follow = (angles: ServoAngles) => {
    setReported(angles);
    if (angles.openAngle != null) {
      const display = commandToDemoAngle(angles.openAngle);
      openRef.current = display == null ? '' : String(display); setOpen(openRef.current);
    }
  };
  useEffect(() => {
    let active = true, refreshing = false;
    dirty.current = false; confirmation.current = undefined;
    const refresh = async () => {
      if (refreshing || AppState.currentState === 'background') return;
      refreshing = true; const startedAtRevision = revision.current;
      try {
        const angles = await servoService.get(unitId);
        if (!active || startedAtRevision !== revision.current) return;
        const decision = servoSyncDecision(angles, dirty.current, confirmation.current);
        if (decision === 'WAIT') return;
        setReported(angles);
        if (decision === 'CONFLICT') {
          confirmation.current = undefined; dirty.current = true;
          setError('Góc cửa đang báo chưa trùng với góc vừa lưu. Bấm Lấy lại góc đang lưu để đối chiếu.');
        } else if (decision === 'FOLLOW') { confirmation.current = undefined; follow(angles); }
      } catch (e) { if (active) setError(servoError(e)); }
      finally { refreshing = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 2000);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { clearTimeout(editTimer.current); setLive(false); void queue.stop().catch(() => {}); }
    });
    return () => {
      active = false; clearInterval(timer); clearTimeout(editTimer.current); subscription.remove();
      void queue.stop().catch(() => {});
    };
  }, [unitId, queue]);
  useEffect(() => {
    if (!online || calibrating) { clearTimeout(editTimer.current); void queue.stop().catch(() => {}); }
  }, [online, calibrating, queue]);
  const compatible = reported?.lockAngle === 0 && reported.servoRange === 180;
  const openAngle = parseDemoServoAngle(open);
  const reportedOpen = reported?.openAngle == null ? null : commandToDemoAngle(reported.openAngle);
  const disabled = busy || !online || calibrating || !compatible;
  const cancelEdit = () => { clearTimeout(editTimer.current); queue.cancelPending(); };
  const edit = (value: string, immediate = false) => {
    cancelEdit(); dirty.current = true; confirmation.current = undefined; revision.current++;
    openRef.current = value; setOpen(value); setError(''); setMessage('');
    const display = parseDemoServoAngle(value);
    if (live && !disabled && display != null) {
      const jog = { target: 'OPEN' as const, angle: demoAngleToCommand(display)!, servoRange: 180 as const, openDirection: 1 as const };
      if (immediate) queue.submit(jog);
      else editTimer.current = setTimeout(() => queue.submit(jog), 350);
    }
  };
  const save = useCallback(async () => {
    if (openAngle == null || disabled) return;
    clearTimeout(editTimer.current); queue.cancelPending(); dirty.current = true; revision.current++; setBusy(true); setError(''); setMessage('');
    try {
      await queue.flush();
      const command = demoAngleToCommand(openAngle)!;
      await acknowledged(await servoService.set(unitId, 0, command, 180, 1));
      const angles: ServoAngles = { lockAngle: 0, openAngle: command, servoRange: 180, openDirection: 1 };
      setReported(angles); confirmation.current = { angles, expiresAt: Date.now() + 15000 };
      dirty.current = false; revision.current++;
      setMessage(`Đã lưu: khóa 0°, mở ${openAngle}°. Cửa giữ góc này sau khi khởi động lại.`);
    } catch (e) { setError(servoError(e)); }
    finally { setBusy(false); }
  }, [unitId, openAngle, disabled, queue]);
  return (
    <Card>
      <View style={s.row}>
        <Ionicons name="options-outline" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.heading}>Góc mở servo 0–90°</Text>
          <Text style={s.caption}>Mốc khóa 0° · Nhích mỗi lần 5°</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, padding: 13, borderRadius: 16, backgroundColor: colors.surfaceAlt, gap: 4 }}>
          <Text style={s.caption}>Mốc khóa ở giữa</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.text }}>0°</Text>
        </View>
        <View style={{ flex: 1, padding: 13, borderRadius: 16, backgroundColor: colors.primarySoft, gap: 4 }}>
          <Text style={s.caption}>Góc mở đang lưu</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.primary }}>{reportedOpen == null ? '—' : `${reportedOpen}°`}</Text>
        </View>
      </View>
      <Text style={s.description}>Giữ nguyên vị trí khóa 0° đang dùng. Cửa demo chỉ chỉnh góc mở theo chiều dương, tối đa 90°.</Text>
      <Input label="Góc mở (0–90°)" keyboardType="decimal-pad" value={open} onChangeText={value => edit(value)} editable={!disabled} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[-5, 5].map(delta => <View key={delta} style={{ flex: 1 }}>
          <Button title={delta < 0 ? 'Giảm 5°' : 'Tăng 5°'} variant="ghost" disabled={disabled || openAngle == null || (delta < 0 ? openAngle <= 0 : openAngle >= 90)}
            onPress={() => edit(stepDemoServoAngle(openRef.current, delta), true)} />
        </View>)}
      </View>
      <Text style={s.caption}>0° → 5° → 10° → … → 90°. Giảm góc sẽ đưa servo về gần mốc 0°.</Text>
      <Button title={live ? 'Quay trực tiếp: BẬT' : 'Quay trực tiếp: TẮT'} variant="ghost" disabled={disabled}
        onPress={() => { cancelEdit(); setLive(!live); if (live) { setBusy(true); void queue.stop().catch(e => setError(servoError(e))).finally(() => setBusy(false)); } }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Thử khóa 0°" variant="ghost" icon="lock-closed-outline" disabled={disabled}
          onPress={() => { cancelEdit(); queue.submit({ target: 'LOCK', angle: 0, openDirection: 1 }); }} /></View>
        <View style={{ flex: 1 }}><Button title="Thử góc mở" variant="ghost" icon="play-outline" disabled={disabled || openAngle == null}
          onPress={() => { cancelEdit(); queue.submit({ target: 'OPEN', angle: demoAngleToCommand(openAngle!)!, openDirection: 1 }); }} /></View>
      </View>
      <Button title={busy ? 'Đang xử lý…' : 'Lưu góc mở'} icon="checkmark-circle-outline" disabled={disabled || openAngle == null} onPress={() => { void save(); }} />
      <Button title="Dừng quay thử" variant="ghost" disabled={busy || !online} onPress={() => {
        cancelEdit(); setLive(false); setBusy(true);
        void queue.stop().then(() => setMessage('Đã dừng quay thử.')).catch(e => setError(servoError(e))).finally(() => setBusy(false));
      }} />
      <Button title="Lấy lại góc đang lưu" variant="ghost" disabled={busy} onPress={() => {
        cancelEdit(); setBusy(true); revision.current++; setError('');
        void queue.stop().then(() => servoService.get(unitId)).then(angles => {
          dirty.current = false; confirmation.current = undefined; revision.current++; follow(angles); setMessage('Đã lấy lại góc đang lưu.');
        }).catch(e => setError(servoError(e))).finally(() => setBusy(false));
      }} />
      {reported && !compatible ? <Notice tone="error">Cấu hình cửa chưa dùng mốc khóa 0°. Kiểm tra lại cấu hình servo trên thiết bị.</Notice> : null}
      {compatible && (reported?.openDirection === -1 || (reported?.openAngle != null && reportedOpen == null)) ? <Notice>Đóng cửa, nhập góc mở mới từ 0–90° rồi lưu để dùng chiều dương cho cửa demo.</Notice> : null}
      {open !== '' && openAngle == null ? <Notice tone="error">Nhập góc từ 0° đến 90° theo bước 0.5°.</Notice> : null}
      {openAngle === 0 ? <Notice>Góc mở đang bằng góc khóa; chốt sẽ không di chuyển khi mở.</Notice> : null}
      {message ? <Notice tone="info">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}
