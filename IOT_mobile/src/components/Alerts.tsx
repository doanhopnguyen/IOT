import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card } from './ui';
import { alertService, AlertDto } from '../services/api/alertService';
import { colors } from '../theme/tokens';

export function Alerts({ back }: { back: () => void }) {
  const [items, setItems] = useState<AlertDto[]>([]); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [page, setPage] = useState(0); const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0); const [severity, setSeverity] = useState<AlertDto['severity']>();
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
    {items.map(e => <Card key={e.id}><Text style={{ fontWeight: '700', color: e.severity === 'CRITICAL' ? colors.error : e.severity === 'WARNING' ? colors.warning : colors.primary }}>{e.severity} · {e.eventType}</Text><Text>{e.message ?? e.eventType}</Text><Text>{e.accessUnit?.name ?? 'Chưa gắn cửa'} · {e.device.name}</Text><Text>{new Date(e.occurredAt).toLocaleString('vi-VN')} · {e.status}</Text></Card>)}
    <Button title="Làm mới" disabled={loading} onPress={() => { setPage(0); setRetry(v => v + 1); }} />{more && !error && <Button title="Xem thêm" disabled={loading} onPress={() => setPage(p => p + 1)} />}
  </ScrollView>;
}
