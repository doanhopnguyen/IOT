import { useCallback, useEffect, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { useConfirm } from './ConfirmationProvider';
import { BarChart } from './BarChart';
import { rssiStrength } from './chartMath';
import { Button, Card, Input } from './ui';
import { colors } from '../theme/tokens';
import { managerService } from '../services/api/managerService';
import { lockdownCopy } from '../utils/lockdown';
import { DailyAccessDto, statsService, TelemetryPointDto, UnitSettingsDto, validateSettings } from '../services/api/statsService';

const dayLabel = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Thống kê + cài đặt cửa cho chủ cửa (đề bài mục 4.5–4.6: biểu đồ, cấu hình từ xa, xuất dữ liệu). */
export function DoorDashboard({ unitId }: { unitId: number }) {
  const confirm = useConfirm();
  const [days, setDays] = useState<DailyAccessDto[]>([]);
  const [rssi, setRssi] = useState<TelemetryPointDto[]>([]);
  const [settings, setSettings] = useState<UnitSettingsDto>();
  const [unlock, setUnlock] = useState(''); const [openLimit, setOpenLimit] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [reportedTiming, setReportedTiming] = useState<{ seconds: number; waitForClose: boolean }>();
  const [lockedDown, setLockedDown] = useState<boolean>();

  const load = useCallback(async () => {
    const [d, r, s] = await Promise.all([statsService.dailyAccess(unitId, 7), statsService.telemetry(unitId, 'rssi'), statsService.settings(unitId)]);
    setDays(d); setRssi(r.slice(-24)); setSettings(s);
    setUnlock(String(s.unlockDurationSec)); setOpenLimit(String(s.doorOpenTimeoutSec));
    setLockedDown((await managerService.lockdownStatus(unitId)).lockedDown);
  }, [unitId]);
  useEffect(() => { void load().catch(e => setMessage(e instanceof Error ? e.message : 'Không tải được thống kê.')); }, [load]);
  useEffect(() => {
    let active = true, running = false;
    const refresh = async () => {
      if (running) return; running = true;
      try {
        const [duration, policy] = await Promise.all([statsService.telemetry(unitId, 'unlockDurationSec'), statsService.telemetry(unitId, 'autoLockWaitForClose')]);
        const seconds = Number(duration.at(-1)?.value), wait = policy.at(-1)?.value;
        if (active && Number.isInteger(seconds) && seconds >= 1 && seconds <= 30 && (wait === 'true' || wait === 'false'))
          setReportedTiming({ seconds, waitForClose: wait === 'true' });
      } catch { /* Keep requested settings distinct from an unavailable device confirmation. */ }
      finally { running = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);

  const save = async (patch: Partial<UnitSettingsDto>) => {
    const invalid = validateSettings(patch);
    if (invalid) { setMessage(invalid); return; }
    setBusy(true); setMessage('');
    try {
      const s = await statsService.updateSettings(unitId, patch);
      setSettings(s); setUnlock(String(s.unlockDurationSec)); setOpenLimit(String(s.doorOpenTimeoutSec));
      setMessage('Đã lưu yêu cầu trên máy chủ. Theo dõi xác nhận từ thiết bị bên dưới.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Không lưu được cài đặt.'); }
    finally { setBusy(false); }
  };

  const total = days.reduce((a, d) => ({ granted: a.granted + d.granted, denied: a.denied + d.denied }), { granted: 0, denied: 0 });
  const toggleLockdown = async (next: boolean) => {
    setBusy(true); setMessage('');
    try {
      const result = await managerService.waitForCommand(await (next ? managerService.startLockdown(unitId) : managerService.endLockdown(unitId)));
      if (result.status !== 'ACKNOWLEDGED') setMessage(result.resultMessage || 'Cửa chưa xác nhận lệnh. Vui lòng thử lại.');
      setLockedDown((await managerService.lockdownStatus(unitId)).lockedDown);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Không gửi được lệnh tạm khóa.'); }
    finally { setBusy(false); }
  };
  const lockdown = lockdownCopy(lockedDown === true);
  const latestRssi = rssi.length ? Number(rssi[rssi.length - 1].value) : undefined;
  const toggles: [keyof UnitSettingsDto, string][] = [['autoLockWaitForClose', 'Chờ cánh cửa đóng trước khi khóa'], ['remoteUnlockEnabled', 'Cho phép mở từ xa'], ['rfidEnabled', 'Cho phép thẻ RFID'], ['fingerprintEnabled', 'Cho phép vân tay']];

  return <View style={{ gap: 16 }}>
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 17 }}>Lượt ra vào 7 ngày</Text>
      <Text style={{ color: colors.muted }}>Cho phép {total.granted} · Từ chối {total.denied}</Text>
      {days.length ? <BarChart data={days.map(d => ({ label: dayLabel(d.day), values: [d.granted, d.denied] }))}
        colors={[colors.success, colors.error]} legend={['Cho phép', 'Từ chối']} /> : <Text>Đang tải...</Text>}
    </Card>
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 17 }}>Sóng Wi-Fi của cửa (24 giờ)</Text>
      <Text style={{ color: colors.muted }}>{latestRssi === undefined ? 'Chưa có dữ liệu' : `Hiện tại ${latestRssi} dBm`}</Text>
      {rssi.length ? <BarChart data={rssi.map(p => ({ label: '', values: [rssiStrength(Number(p.value))] }))} colors={[colors.primary]} max={100} height={60} /> : null}
      {rssi.length ? <Text style={{ fontSize: 11, color: colors.muted }}>{timeLabel(rssi[0].at)} → {timeLabel(rssi[rssi.length - 1].at)}</Text> : null}
    </Card>
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 17 }}>Cài đặt cửa từ xa</Text>
      <Text>Tự về góc khóa sau (1–30 giây)</Text>
      <Text style={{ color: colors.muted }}>{settings?.autoLockWaitForClose !== false ? 'Hẹn giờ được lưu trên cửa. Nếu cánh cửa còn mở, chốt chờ cửa đóng ổn định rồi mới khóa.' : 'Servo trở về góc khóa khi hết thời gian, kể cả khi cảm biến còn báo mở. App chỉ báo đã khóa khi cảm biến xác nhận đóng và servo hoàn tất lệnh.'}</Text>
      <Input value={unlock} onChangeText={setUnlock} keyboardType="numeric" placeholder="5" />
      <Text>Cảnh báo khi cửa mở quá (10–600 giây)</Text>
      <Input value={openLimit} onChangeText={setOpenLimit} keyboardType="numeric" placeholder="60" />
      <Button title="Lưu thời gian" disabled={busy || !settings} onPress={() => { void save({ unlockDurationSec: Number(unlock), doorOpenTimeoutSec: Number(openLimit) }); }} />
      <Text style={{ color: colors.muted }}>{reportedTiming && settings && reportedTiming.seconds === settings.unlockDurationSec && reportedTiming.waitForClose === (settings.autoLockWaitForClose !== false)
        ? `Thiết bị đã xác nhận: ${reportedTiming.seconds} giây · ${reportedTiming.waitForClose ? 'chờ cửa đóng' : 'quay về đúng hẹn'}.`
        : 'Đang chờ thiết bị xác nhận thời gian và chế độ tự khóa.'}</Text>
      {settings ? toggles.map(([key, label]) => <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text>{label}</Text>
        <Switch accessibilityLabel={label} value={key === 'autoLockWaitForClose' ? settings[key] !== false : Boolean(settings[key])} disabled={busy} onValueChange={value => { void save({ [key]: value }); }} />
      </View>) : null}
    </Card>
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 17 }}>Tạm khóa cửa</Text>
      <Text style={{ color: lockedDown ? colors.error : colors.muted }}>{lockedDown === undefined ? 'Đang tải...' : lockdown.title}</Text>
      <Text style={{ color: colors.muted }}>Khi tạm khóa, chỉ vân tay, thẻ của bạn và lệnh mở từ app của bạn còn mở được cửa. Không tự hết hạn.</Text>
      <Button title={lockdown.button} variant={lockedDown ? 'primary' : 'ghost'} disabled={busy || lockedDown === undefined}
        onPress={() => { void confirm({ title: lockdown.button, message: lockdown.confirm,
          confirmLabel: lockdown.button, destructive: !lockedDown }).then(ok => { if (ok) void toggleLockdown(!lockedDown); }); }} />
    </Card>
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 17 }}>Xuất dữ liệu</Text>
      <Text>Lịch sử ra vào 30 ngày gần nhất, tệp CSV mở được bằng Excel.</Text>
      <Button title="Tải CSV lịch sử" variant="ghost" onPress={() => { void Linking.openURL(statsService.csvUrl(unitId)); }} />
    </Card>
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </View>;
}
