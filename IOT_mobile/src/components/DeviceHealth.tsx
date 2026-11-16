import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import { request } from '../services/api/client';
import { deviceHealthRows, type DeviceHealth as Health } from '../services/api/deviceHealth';
import { Button, Card, Notice, type IconName, styles as s } from './ui';

const moduleIcons: IconName[] = ['hardware-chip-outline', 'wifi-outline', 'finger-print-outline', 'card-outline', 'exit-outline', 'options-outline', 'hand-left-outline'];

export function DeviceHealth({ unitId }: { unitId: number }) {
  const [health, setHealth] = useState<Health>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try { setHealth(await request<Health>(`/api/manager/units/${unitId}/health`)); setError(''); }
    catch (e) { setHealth(undefined); setError(e instanceof Error ? e.message : 'Chưa tải được tình trạng thiết bị.'); }
    finally { running.current = false; setBusy(false); }
  }, [unitId]);
  useEffect(() => { void refresh(); const timer = setInterval(() => { tick(n => n + 1); void refresh(); }, 5000); return () => clearInterval(timer); }, [refresh]);
  return <Card>
    <Text style={s.heading}>Kết nối & phản hồi module</Text>
    <Text style={s.caption}>Tự cập nhật mỗi 5 giây. Module chưa gửi dữ liệu sẽ hiển thị chưa xác định.</Text>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {deviceHealthRows(health).map(([label, value], index) => <View key={label} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 16, backgroundColor: colors.surfaceAlt }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={moduleIcons[index]} size={19} color={colors.teal} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={s.label}>{label}</Text><Text style={s.caption}>{value}</Text></View>
    </View>)}
    <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, gap: 6 }}>
      <Text style={s.caption}>Heartbeat: {health?.lastSeenAt ? new Date(health.lastSeenAt).toLocaleString('vi-VN') : 'Chưa có'}</Text>
      <Text style={s.caption}>Cập nhật module: {health?.updatedAt ? new Date(health.updatedAt).toLocaleString('vi-VN') : 'Chưa có'}</Text>
    </View>
    <Button title={busy ? 'Đang kiểm tra…' : 'Kiểm tra lại'} icon="refresh-outline" variant="ghost" disabled={busy} onPress={() => { setBusy(true); void refresh(); }} />
  </Card>;
}
