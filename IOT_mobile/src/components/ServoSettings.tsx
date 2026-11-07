import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { managerService } from '../services/api/managerService';
import { servoService, convertServoRange, displayServoAngle, parseServoAngle, stepServoAngle, type ServoAngles, type ServoTarget, type ServoRange } from '../services/api/servoService';
import { ServoPreviewQueue } from '../services/api/servoPreview';
import { servoSyncDecision, type ServoConfirmation } from '../services/api/servoSync';
import { Button, Card, Input, Notice, styles as s } from './ui';

function servoError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (code === 'SERVO_BUSY_OR_DOOR_OPEN') return 'Đóng cửa ổn định trước khi chỉnh góc khóa. Hoàn tất thao tác mở cửa hoặc hiệu chỉnh khác rồi thử lại.';
  if (code === 'DEVICE_BUSY') return 'Cửa đang bận. Hoàn tất đăng ký thẻ/vân tay hoặc hiệu chỉnh trên chip rồi thử lại.';
  if (code === 'EXPIRED_OR_CLOCK_INVALID' || code === 'STALE_SERVO_COMMAND') return 'Lệnh thử đã cũ hoặc mạng chậm. Kiểm tra kết nối rồi nhích lại góc.';
  if (code === 'UNSUPPORTED_COMMAND') return 'Cần nạp firmware 1.6.0 trở lên để quay thử trực tiếp.';
  if (code === 'SERVO_RANGE_MISMATCH') return 'Hành trình trên cửa đã đổi. Bấm Lấy lại góc đang lưu rồi thử lại.';
  return code;
}
async function acknowledged(command: Awaited<ReturnType<typeof servoService.preview>>) {
  const result = await managerService.waitForCommand(command, 6000, 150);
  if (result.status !== 'ACKNOWLEDGED') throw new Error(result.resultMessage || 'Chưa nhận được xác nhận từ cửa. Kiểm tra kết nối rồi thử lại.');
}

export function ServoSettings({ unitId, online, calibrating = false }: { unitId: number; online: boolean; calibrating?: boolean }) {
  const [reported, setReported] = useState<ServoAngles>();
  const [lock, setLock] = useState(''), [open, setOpen] = useState('');
  const [centered, setCentered] = useState(false), [live, setLive] = useState(true);
  const [range, setRange] = useState<ServoRange>(180);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const initialized = useRef(false), centeredRef = useRef(false);
  const dirty = useRef(false), revision = useRef(0), confirmation = useRef<ServoConfirmation | undefined>(undefined);
  const [hasDraft, setHasDraft] = useState(false);
  const editTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useMemo(() => new ServoPreviewQueue(async jog => {
    await acknowledged(await servoService.preview(unitId, jog.target, jog.angle, jog.servoRange));
    setMessage(`Cửa đã nhận góc thử ${jog.angle}°. Kiểm tra chốt thực tế rồi lưu hai góc.`);
  }, async () => { await acknowledged(await servoService.stopPreview(unitId)); }, e => {
    setError(servoError(e)); setMessage('');
  }), [unitId]);
  const cancelEdit = () => { clearTimeout(editTimer.current); queue.cancelPending(); };
  useEffect(() => {
    let active = true, refreshing = false; initialized.current = false; dirty.current = false; confirmation.current = undefined;
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
          confirmation.current = undefined; dirty.current = true; setHasDraft(true);
          setError('Góc cửa đang báo chưa trùng với góc vừa lưu. Lấy lại góc đang lưu để đối chiếu trước khi chỉnh tiếp.'); return;
        }
        if (decision === 'FOLLOW' && angles.lockAngle != null && angles.openAngle != null) {
          confirmation.current = undefined;
          const travel = angles.servoRange ?? 180; setRange(travel);
          setLock(displayServoAngle(angles.lockAngle, centeredRef.current, travel));
          setOpen(displayServoAngle(angles.openAngle, centeredRef.current, travel)); initialized.current = true;
        }
      } catch (e) { if (active) setError(servoError(e)); }
      finally { refreshing = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 2000);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        clearTimeout(editTimer.current); setLive(false);
        void queue.stop().catch(() => {}); // Device also expires the session after 5s.
      }
    });
    return () => {
      active = false; clearInterval(timer); clearTimeout(editTimer.current); subscription.remove();
      void queue.stop().catch(() => {});
    };
  }, [unitId, queue]);
  useEffect(() => {
    if (!online || calibrating) {
      clearTimeout(editTimer.current); void queue.stop().catch(() => {});
    }
  }, [online, calibrating, queue]);
  const lockAngle = parseServoAngle(lock, centered, range), openAngle = parseServoAngle(open, centered, range);
  const inputError = lockAngle == null || openAngle == null;
  const edit = (target: ServoTarget, value: string, immediate = false) => {
    dirty.current = true; setHasDraft(true); confirmation.current = undefined; revision.current++;
    initialized.current = true;
    (target === 'LOCK' ? setLock : setOpen)(value);
    setError(''); setMessage(''); cancelEdit();
    const angle = parseServoAngle(value, centered, range);
    if (live && online && !calibrating && angle != null) {
      if (immediate) queue.submit({ target, angle, servoRange: range });
      else editTimer.current = setTimeout(() => queue.submit({ target, angle, servoRange: range }), 350);
    }
  };
  const save = useCallback(async () => {
    if (lockAngle == null || openAngle == null) return;
    clearTimeout(editTimer.current); dirty.current = true; revision.current++; setBusy(true); setError(''); setMessage('');
    try {
      await queue.flush();
      await acknowledged(await servoService.set(unitId, lockAngle, openAngle, range));
      setMessage(`Đã lưu trên cửa: khóa ${lockAngle}°, mở ${openAngle}°. Lệnh mở/khóa tiếp theo dùng hai góc này.`);
      initialized.current = true; setReported({ lockAngle, openAngle, servoRange: range });
      confirmation.current = { angles: { lockAngle, openAngle, servoRange: range }, expiresAt: Date.now() + 15000 };
      dirty.current = false; setHasDraft(false); revision.current++;
    } catch (e) { setError(servoError(e)); }
    finally { setBusy(false); }
  }, [unitId, lockAngle, openAngle, range, queue]);
  const toggleMode = () => {
    if (lockAngle == null || openAngle == null) return;
    cancelEdit(); const next = !centered;
    setLock(displayServoAngle(lockAngle, next, range)); setOpen(displayServoAngle(openAngle, next, range));
    centeredRef.current = next; setCentered(next);
  };
  const controls = (target: ServoTarget, value: string, label: string) => <>
    <Input label={`${label} (${centered ? `${5 - range / 2} đến +${range / 2 - 5}` : `5–${range - 5}`}°)`} keyboardType={centered ? 'default' : 'numeric'}
      value={value} onChangeText={v => edit(target, v)} editable={!busy} />
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[-5, -1, 1, 5].map(delta => <View key={delta} style={{ flex: 1 }}><Button
        title={`${delta > 0 ? '+' : '−'}${Math.abs(delta)}°`} variant="ghost"
        disabled={busy || parseServoAngle(value, centered, range) == null}
        onPress={() => edit(target, stepServoAngle(value, delta, centered, range), true)} /></View>)}
    </View>
    <Button title={`Thử ${label.toLowerCase()} tại góc này`} variant="ghost"
      disabled={busy || !online || calibrating || parseServoAngle(value, centered, range) == null}
      onPress={() => { cancelEdit(); queue.submit({ target, angle: parseServoAngle(value, centered, range)!, servoRange: range }); }} />
  </>;
  return <Card>
    <Text style={s.heading}>Góc servo</Text>
    <Text style={s.description}>Nhích 1° hoặc 5°, hoặc nhập bất kỳ góc nguyên nào. Khi bật quay trực tiếp, servo quay theo góc vừa chỉnh; sau đó bấm lưu.</Text>
    <Text style={s.caption}>Hành trình đang dùng: {range}°. {centered ? `Mốc giữa 0° tương ứng góc servo ${range / 2}°.` : 'Có thể chuyển sang góc âm/dương quanh mốc giữa.'} Giữ cách hai đầu 5°, không quay vòng qua điểm chặn.</Text>
    <Button title={`Đổi hành trình và lưu: ${range === 180 ? 360 : 180}°`} variant="ghost" disabled={busy || inputError || !online || calibrating} onPress={() => {
      if (lockAngle == null || openAngle == null) return;
      cancelEdit(); dirty.current = true; revision.current++; setBusy(true); setError(''); setMessage('');
      const next = range === 180 ? 360 : 180;
      const newLock = convertServoRange(lockAngle, range, next), newOpen = convertServoRange(openAngle, range, next);
      void (async () => {
        try {
          await queue.flush(); await acknowledged(await servoService.set(unitId, newLock, newOpen, next));
          setRange(next); setLock(displayServoAngle(newLock, centered, next)); setOpen(displayServoAngle(newOpen, centered, next));
          setReported({ lockAngle: newLock, openAngle: newOpen, servoRange: next });
          confirmation.current = { angles: { lockAngle: newLock, openAngle: newOpen, servoRange: next }, expiresAt: Date.now() + 15000 };
          dirty.current = false; setHasDraft(false); revision.current++;
          setMessage(`Đã lưu hành trình ${next}° và quy đổi hai góc. Nhích 1° để kiểm tra chốt thực tế.`);
        } catch (e) { setError(servoError(e)); }
        finally { setBusy(false); }
      })();
    }} />
    <Button title={centered ? `Đổi sang góc servo 5–${range - 5}°` : 'Dùng góc âm/dương quanh mốc giữa'} variant="ghost" disabled={busy || inputError} onPress={toggleMode} />
    <Button title={live ? 'Quay trực tiếp: BẬT · chạm để tắt' : 'Quay trực tiếp: TẮT · chạm để bật'} variant="ghost" disabled={busy || !online || calibrating} onPress={() => {
      cancelEdit(); setLive(!live);
      if (live) { setBusy(true); void queue.stop().catch(e => setError(servoError(e))).finally(() => setBusy(false)); }
    }} />
    <Text style={s.caption}>Góc đang lưu: {reported?.lockAngle == null || reported.openAngle == null ? 'chờ cửa gửi dữ liệu' : `khóa ${reported.lockAngle}° · mở ${reported.openAngle}°`}</Text>
    <Text style={s.caption}>{hasDraft ? 'Bạn đang chỉnh bản nháp. Góc thiết bị mới gửi vẫn hiện ở dòng trên; bấm lưu để áp dụng hoặc lấy lại góc đang lưu.' : 'App tự đồng bộ góc khi bạn thay đổi trên thiết bị.'}</Text>
    {controls('LOCK', lock, 'Góc khóa')}
    {controls('OPEN', open, 'Góc mở')}
    {lockAngle != null && lockAngle === openAngle ? <Notice>Hai vị trí đang bằng nhau; lệnh khóa và mở sẽ đến cùng một góc.</Notice> : null}
    {inputError ? <Text style={s.caption}>Nhập đủ hai góc nguyên trong khoảng cho phép.</Text> : null}
    <Button title={busy ? 'Đang chờ cửa xác nhận…' : 'Lưu hai góc servo'} disabled={busy || !online || calibrating || inputError} onPress={() => { void save(); }} />
    <Button title="Dừng quay thử" variant="ghost" disabled={busy} onPress={() => {
      cancelEdit(); setLive(false); setMessage(''); setBusy(true);
      void queue.stop().then(() => setMessage('Đã kết thúc quay thử. Kiểm tra chốt thực tế; góc chưa lưu vẫn chỉ là bản nháp.')).catch(e => setError(servoError(e))).finally(() => setBusy(false));
    }} />
    <Button title="Lấy lại góc đang lưu" variant="ghost" disabled={busy} onPress={() => {
      cancelEdit(); setError(''); setBusy(true);
      void queue.stop().then(() => servoService.get(unitId)).then(angles => {
        dirty.current = false; confirmation.current = undefined; revision.current++; setHasDraft(false);
        setReported(angles);
        if (angles.lockAngle != null && angles.openAngle != null) {
          const travel = angles.servoRange ?? 180; setRange(travel);
          initialized.current = true; setLock(displayServoAngle(angles.lockAngle, centered, travel)); setOpen(displayServoAngle(angles.openAngle, centered, travel));
        }
      }).catch(e => setError(servoError(e))).finally(() => setBusy(false));
    }} />
    <Text style={s.caption}>{calibrating ? 'Hoàn tất hiệu chỉnh ban đầu trên chip trước khi chỉnh từ app.' : online ? 'Đóng cửa trước khi thử góc khóa. Quay thử không tự lưu; cửa thoát phiên chỉnh sau 5 giây không có lệnh. Góc báo là lệnh điều khiển, hãy quan sát chốt thực tế.' : 'Cửa cần online để quay thử và lưu góc.'}</Text>
    {message ? <Notice tone="info">{message}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
  </Card>;
}
