import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { managerService } from '../services/api/managerService';
import { servoService, convertServoRange, displayServoAngle, parseServoAngle, stepServoAngle, type ServoAngles, type ServoTarget, type ServoRange } from '../services/api/servoService';
import { ServoPreviewQueue } from '../services/api/servoPreview';
import { servoSyncDecision, type ServoConfirmation } from '../services/api/servoSync';
import { AppModal, Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { colors, fonts } from '../theme/tokens';

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
  const [, setHasDraft] = useState(false);
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
  const [activeTarget, setActiveTarget] = useState<ServoTarget>('LOCK');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const currentVal = activeTarget === 'LOCK' ? lock : open;
  const currentLabel = activeTarget === 'LOCK' ? 'Góc khóa' : 'Góc mở';
  return (
    <Card>
      <View style={s.row}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            backgroundColor: '#F1F5F9',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="options-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heading}>Góc khóa & mở Servo</Text>
          <Text style={s.caption}>Hành trình {range}° · {live ? 'Quay trực tiếp BẬT' : 'Quay trực tiếp TẮT'}</Text>
        </View>
        <Pressable
          onPress={() => setOptionsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Tùy chọn nâng cao"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: '#F1F5F9',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="settings-outline" size={15} color={colors.text} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.text }}>
            Tùy chọn
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => setActiveTarget('LOCK')}
          style={{
            flex: 1,
            padding: 13,
            borderRadius: 16,
            backgroundColor: activeTarget === 'LOCK' ? colors.primarySoft : colors.surfaceAlt,
            borderWidth: 1.5,
            borderColor: activeTarget === 'LOCK' ? colors.primary : colors.border,
            gap: 4,
          }}
        >
          <View style={s.row}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={activeTarget === 'LOCK' ? colors.primary : colors.muted}
            />
            <Text style={[s.caption, { fontFamily: fonts.semibold, color: activeTarget === 'LOCK' ? colors.primary : colors.muted }]}>
              Góc khóa (LOCK)
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.text }}>
            {reported?.lockAngle != null ? `${reported.lockAngle}°` : `${lock || '--'}°`}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTarget('OPEN')}
          style={{
            flex: 1,
            padding: 13,
            borderRadius: 16,
            backgroundColor: activeTarget === 'OPEN' ? colors.primarySoft : colors.surfaceAlt,
            borderWidth: 1.5,
            borderColor: activeTarget === 'OPEN' ? colors.primary : colors.border,
            gap: 4,
          }}
        >
          <View style={s.row}>
            <Ionicons
              name="lock-open-outline"
              size={16}
              color={activeTarget === 'OPEN' ? colors.primary : colors.muted}
            />
            <Text style={[s.caption, { fontFamily: fonts.semibold, color: activeTarget === 'OPEN' ? colors.primary : colors.muted }]}>
              Góc mở (OPEN)
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.text }}>
            {reported?.openAngle != null ? `${reported.openAngle}°` : `${open || '--'}°`}
          </Text>
        </Pressable>
      </View>

      <Input
        label={`${currentLabel} (${centered ? `${5 - range / 2} đến +${range / 2 - 5}` : `5–${range - 5}`}°)`}
        keyboardType={centered ? 'default' : 'numeric'}
        value={currentVal}
        onChangeText={(v) => edit(activeTarget, v)}
        editable={!busy}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[-5, -1, 1, 5].map((delta) => (
          <View key={delta} style={{ flex: 1 }}>
            <Button
              title={`${delta > 0 ? '+' : '−'}${Math.abs(delta)}°`}
              variant="ghost"
              disabled={busy || parseServoAngle(currentVal, centered, range) == null}
              onPress={() =>
                edit(activeTarget, stepServoAngle(currentVal, delta, centered, range), true)
              }
            />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            title={`Thử ${currentLabel.toLowerCase()}`}
            variant="ghost"
            icon="play-outline"
            disabled={busy || !online || calibrating || parseServoAngle(currentVal, centered, range) == null}
            onPress={() => {
              cancelEdit();
              queue.submit({
                target: activeTarget,
                angle: parseServoAngle(currentVal, centered, range)!,
                servoRange: range,
              });
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={busy ? 'Đang lưu…' : 'Lưu hai góc'}
            icon="checkmark-circle-outline"
            disabled={busy || !online || calibrating || inputError}
            onPress={() => {
              void save();
            }}
          />
        </View>
      </View>

      {lockAngle != null && lockAngle === openAngle ? (
        <Notice>Hai vị trí đang bằng nhau; lệnh khóa và mở sẽ đến cùng một góc.</Notice>
      ) : null}
      {message ? <Notice tone="info">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <AppModal
        visible={optionsOpen}
        title="Tùy chọn Servo nâng cao"
        onClose={() => setOptionsOpen(false)}
      >
        <View style={{ gap: 12 }}>
          <View style={s.row}>
            <Text style={[s.description, { flex: 1, color: colors.text }]}>
              Hành trình đang dùng
            </Text>
            <Badge label={`${range}°`} tone="primary" />
          </View>
          <Button
            title={`Đổi hành trình và lưu: ${range === 180 ? 360 : 180}°`}
            variant="ghost"
            disabled={busy || inputError || !online || calibrating}
            onPress={() => {
              if (lockAngle == null || openAngle == null) return;
              cancelEdit();
              dirty.current = true;
              revision.current++;
              setBusy(true);
              setError('');
              setMessage('');
              const next = range === 180 ? 360 : 180;
              const newLock = convertServoRange(lockAngle, range, next),
                newOpen = convertServoRange(openAngle, range, next);
              void (async () => {
                try {
                  await queue.flush();
                  await acknowledged(await servoService.set(unitId, newLock, newOpen, next));
                  setRange(next);
                  setLock(displayServoAngle(newLock, centered, next));
                  setOpen(displayServoAngle(newOpen, centered, next));
                  setReported({ lockAngle: newLock, openAngle: newOpen, servoRange: next });
                  confirmation.current = {
                    angles: { lockAngle: newLock, openAngle: newOpen, servoRange: next },
                    expiresAt: Date.now() + 15000,
                  };
                  dirty.current = false;
                  setHasDraft(false);
                  revision.current++;
                  setMessage(`Đã lưu hành trình ${next}° và quy đổi hai góc.`);
                  setOptionsOpen(false);
                } catch (e) {
                  setError(servoError(e));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
          <Button
            title={centered ? `Đổi sang góc 5–${range - 5}°` : 'Dùng góc âm/dương quanh mốc giữa'}
            variant="ghost"
            disabled={busy || inputError}
            onPress={toggleMode}
          />
          <Button
            title={live ? 'Quay trực tiếp: BẬT (Chạm để tắt)' : 'Quay trực tiếp: TẮT (Chạm để bật)'}
            variant="ghost"
            disabled={busy || !online || calibrating}
            onPress={() => {
              cancelEdit();
              setLive(!live);
              if (live) {
                setBusy(true);
                void queue
                  .stop()
                  .catch((e) => setError(servoError(e)))
                  .finally(() => setBusy(false));
              }
            }}
          />
          <Button
            title="Lấy lại góc đang lưu trên cửa"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              cancelEdit();
              setError('');
              setBusy(true);
              void queue
                .stop()
                .then(() => servoService.get(unitId))
                .then((angles) => {
                  dirty.current = false;
                  confirmation.current = undefined;
                  revision.current++;
                  setHasDraft(false);
                  setReported(angles);
                  if (angles.lockAngle != null && angles.openAngle != null) {
                    const travel = angles.servoRange ?? 180;
                    setRange(travel);
                    initialized.current = true;
                    setLock(displayServoAngle(angles.lockAngle, centered, travel));
                    setOpen(displayServoAngle(angles.openAngle, centered, travel));
                  }
                  setOptionsOpen(false);
                })
                .catch((e) => setError(servoError(e)))
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </AppModal>
    </Card>
  );
}
