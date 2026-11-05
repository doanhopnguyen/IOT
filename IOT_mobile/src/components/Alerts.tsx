import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card } from './ui';
import { alertService, AlertDto } from '../services/api/alertService';
import { colors } from '../theme/tokens';

const statusText: Record<AlertDto['status'], string> = { NONE: 'Không theo dõi', OPEN: 'Chưa xem', ACKNOWLEDGED: 'Đã xem', RESOLVED: 'Đã xử lý' };

export function Alerts({ back }: { back: () => void }) {
  const [items, setItems] = useState<AlertDto[]>([]); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [page, setPage] = useState(0); const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0); const [severity, setSeverity] = useState<AlertDto['severity']>();
  const [busyId, setBusyId] = useState<number>();
  const change = async (alert: AlertDto, status: 'ACKNOWLEDGED' | 'RESOLVED') => {
    setBusyId(alert.id); setError('');
    try { const updated = await alertService.setStatus(alert.id, status); setItems(old => old.map(x => x.id === updated.id ? updated : x)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không cập nhật được cảnh báo.'); }
    finally { setBusyId(undefined); }
  };
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    alertService.list(page, severity).then(data => { if (active) { setItems(old => page ? [...old, ...data.items] : data.items); setMore(data.hasNext); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Không tải được cảnh báo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, severity, retry]);
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}><Button title="Quay lại" variant="ghost" onPress={back} /><Text style={{ fontSize: 26, color: colors.text, fontWeight: '700' }}>Cảnh báo</Text>
    <View style={{ gap: 8 }}>{([undefined, 'INFO', 'WARNING', 'CRITICAL'] as const).map(s => <Button key={s ?? 'all'} title={s ?? 'Tất cả'} variant={severity === s ? 'primary' : 'ghost'} onPress={() => { setItems([]); setPage(0); setSeverity(s); }} />)}</View>
    {loading && <ActivityIndicator color={colors.primary} />}{error ? <><Text style={{ color: colors.error }}>{error}</Text><Button title="Thử lại" onPress={() => setRetry(v => v + 1)} /></> : !loading && !items.length ? <Text>Chưa có cảnh báo.</Text> : null}
    {items.map(e => <Card key={e.id}><Text style={{ fontWeight: '700', color: e.severity === 'CRITICAL' ? colors.error : e.severity === 'WARNING' ? colors.warning : colors.primary }}>{e.severity} · {e.eventType}</Text><Text>{e.message ?? e.eventType}</Text><Text>{e.accessUnit?.name ?? 'Chưa gắn cửa'} · {e.device.name}</Text><Text>{new Date(e.occurredAt).toLocaleString('vi-VN')} · {statusText[e.status]}</Text>
      {e.status === 'OPEN' ? <Button title="Đã xem" variant="ghost" disabled={busyId === e.id} onPress={() => { void change(e, 'ACKNOWLEDGED'); }} /> : null}
      {e.status === 'OPEN' || e.status === 'ACKNOWLEDGED' ? <Button title="Đã xử lý" disabled={busyId === e.id} onPress={() => { void change(e, 'RESOLVED'); }} /> : null}</Card>)}
    <Button title="Làm mới" disabled={loading} onPress={() => { setPage(0); setRetry(v => v + 1); }} />{more && !error && <Button title="Xem thêm" disabled={loading} onPress={() => setPage(p => p + 1)} />}
  </ScrollView>;
}
