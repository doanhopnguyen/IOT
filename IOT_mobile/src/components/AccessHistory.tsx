import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from './ui';
import { accessLogService, AccessLogDto } from '../services/api/accessLogService';
import { backendDoorId } from '../services/api/client';
import { colors } from '../theme/tokens';

export function AccessHistory({ doorId, back }: { doorId?: string; back: () => void }) {
  const [items, setItems] = useState<AccessLogDto[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [days, setDays] = useState(1); const [page, setPage] = useState(0); const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.resolve().then(() => {
      if (!doorId) throw new Error('Chưa chọn cửa.');
      return accessLogService.list(backendDoorId(doorId), page, days);
    }).then(data => { if (active) { setItems(old => page ? [...old, ...data.items] : data.items); setMore(data.hasNext); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Không tải được lịch sử.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [doorId, days, page, retry]);
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
    <Pressable accessibilityLabel="Quay lại" onPress={back} style={{ width: 42, height: 42, justifyContent: 'center' }}><Ionicons name="arrow-back" size={23} color={colors.primary} /></Pressable><Text style={{ fontSize: 26, color: colors.text, fontWeight: '800' }}>Lịch sử ra vào</Text>
    <View style={{ flexDirection: 'row', gap: 10 }}>{[1, 7, 30].map(d => <Pressable key={d} onPress={() => { setItems([]); setPage(0); setDays(d); }}><Text style={{ color: days === d ? colors.primary : colors.muted, backgroundColor: days === d ? '#E7E8FF' : 'transparent', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, fontWeight: '700' }}>{d === 1 ? 'Hôm nay' : `${d} ngày`}</Text></Pressable>)}</View>
    {loading && <ActivityIndicator color={colors.primary} />}
    {error ? <><Text style={{ color: colors.error }}>{error}</Text><Button title="Thử lại" onPress={() => setRetry(v => v + 1)} /></> : !loading && !items.length ? <Text>Chưa có lịch sử trong khoảng thời gian này.</Text> : null}
    {items.map(l => <Card key={l.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: l.result === 'GRANTED' ? '#EAF9EF' : '#FFF0F0' }}><Ionicons name={l.result === 'GRANTED' ? 'checkmark-circle-outline' : 'close-circle-outline'} size={23} color={l.result === 'GRANTED' ? colors.success : colors.error} /></View><View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{l.account?.name ?? 'Không xác định'}</Text><Text style={{ fontSize: 14, color: colors.muted }}>{l.accessUnit.name} · {l.method}</Text><Text style={{ fontSize: 12, color: colors.muted }}>{l.device.name}</Text><Text style={{ fontSize: 12, color: l.result === 'GRANTED' ? colors.success : colors.error }}>{new Date(l.occurredAt).toLocaleString('vi-VN')} · {l.result === 'GRANTED' ? 'Cho phép' : l.result === 'ERROR' ? 'Lỗi' : 'Từ chối'}</Text>{l.reasonCode && <Text>{l.reasonCode}</Text>}</View></Card>)}
    {more && !error && <Button title="Xem thêm" disabled={loading} onPress={() => setPage(p => p + 1)} />}
  </ScrollView>;
}
