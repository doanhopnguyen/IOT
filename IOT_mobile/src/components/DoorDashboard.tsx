import { useCallback, useEffect, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { BarChart } from './BarChart';
import { rssiStrength } from './chartMath';
import { Button, Card, Input } from './ui';
import { colors } from '../theme/tokens';
import { DailyAccessDto, statsService, TelemetryPointDto, UnitSettingsDto, validateSettings } from '../services/api/statsService';

const dayLabel = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Thống kê + cài đặt cửa cho chủ cửa (đề bài mục 4.5–4.6: biểu đồ, cấu hình từ xa, xuất dữ liệu). */
export function DoorDashboard({ unitId }: { unitId: number }) {
  const [days, setDays] = useState<DailyAccessDto[]>([]);
  const [rssi, setRssi] = useState<TelemetryPointDto[]>([]);
  const [settings, setSettings] = useState<UnitSettingsDto>();
  const [unlock, setUnlock] = useState(''); const [openLimit, setOpenLimit] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, r, s] = await Promise.all([statsService.dailyAccess(unitId, 7), statsService.telemetry(unitId, 'rssi'), statsService.settings(unitId)]);
    setDays(d); setRssi(r.slice(-24)); setSettings(s);
    setUnlock(String(s.unlockDurationSec)); setOpenLimit(String(s.doorOpenTimeoutSec));
  }, [unitId]);
  useEffect(() => { void load().catch(e => setMessage(e instanceof Error ? e.message : 'Không tải được thống kê.')); }, [load]);

  const save = async (patch: Partial<UnitSettingsDto>) => {
    const invalid = validateSettings(patch);
    if (invalid) { setMessage(invalid); return; }
    setBusy(true); setMessage('');
    try {
      const s = await statsService.updateSettings(unitId, patch);
      setSettings(s); setUnlock(String(s.unlockDurationSec)); setOpenLimit(String(s.doorOpenTimeoutSec));
      setMessage('Đã lưu. Cửa nhận cấu hình mới trong vài giây.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Không lưu được cài đặt.'); }
    finally { setBusy(false); }
  };

  const total = days.reduce((a, d) => ({ granted: a.granted + d.granted, denied: a.denied + d.denied }), { granted: 0, denied: 0 });
  const latestRssi = rssi.length ? Number(rssi[rssi.length - 1].value) : undefined;
  const toggles: [keyof UnitSettingsDto, string][] = [['remoteUnlockEnabled', 'Cho phép mở từ xa'], ['rfidEnabled', 'Cho phép thẻ RFID'], ['fingerprintEnabled', 'Cho phép vân tay']];

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
      <Text>Thời gian mở khóa (1–30 giây)</Text>
      <Input value={unlock} onChangeText={setUnlock} keyboardType="numeric" placeholder="5" />
      <Text>Cảnh báo khi cửa mở quá (10–600 giây)</Text>
      <Input value={openLimit} onChangeText={setOpenLimit} keyboardType="numeric" placeholder="60" />
      <Button title="Lưu thời gian" disabled={busy || !settings} onPress={() => { void save({ unlockDurationSec: Number(unlock), doorOpenTimeoutSec: Number(openLimit) }); }} />
      {settings ? toggles.map(([key, label]) => <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text>{label}</Text>
        <Switch accessibilityLabel={label} value={Boolean(settings[key])} disabled={busy} onValueChange={value => { void save({ [key]: value }); }} />
      </View>) : null}
    </Card>
    <Card>
      <Text style={{ fontWeight: '700', fontSize: 17 }}>Xuất dữ liệu</Text>
      <Text>Lịch sử ra vào 30 ngày gần nhất, tệp CSV mở được bằng Excel.</Text>
      <Button title="Tải CSV lịch sử" variant="ghost" onPress={() => { void Linking.openURL(statsService.csvUrl(unitId)); }} />
    </Card>
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </View>;
}
