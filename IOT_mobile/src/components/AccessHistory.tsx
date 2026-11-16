import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal, Badge, Button, Card, EmptyState, LoadingState, Notice, PageHeader, styles as s } from './ui';
import { accessLogService, type AccessLogDto } from '../services/api/accessLogService';
import { backendDoorId } from '../services/api/client';
import { AccessHistoryFeed, actorName, methodLabels, referenceName, reasonText, resultLabels, sourceDeviceName } from '../services/accessHistory';
import { formatVietnamTime } from '../utils/vietnamTime';
import { colors } from '../theme/tokens';

function Filter<T extends string | number | undefined>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <View style={{ gap: 6 }}>
    <Text style={s.label}>{label}</Text>
    <View style={local.filters}>
      {options.map(option => <Pressable key={option.value ?? 'all'}
        accessibilityRole="button" accessibilityLabel={`${label}: ${option.label}`}
        accessibilityState={{ selected: value === option.value }}
        onPress={() => { if (value !== option.value) onChange(option.value); }}
        style={[local.chip, value === option.value && local.activeChip]}>
        <Text style={[s.caption, value === option.value && { color: '#fff' }]}>{option.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: 3 }}>
    <Text style={s.caption}>{label}</Text>
    <Text selectable style={[s.description, { color: colors.text }]}>{value}</Text>
  </View>;
}

export function AccessHistory({ doorId, back }: { doorId?: string; back: () => void }) {
  return <AccessHistoryContent key={doorId} doorId={doorId} back={back} />;
}

function AccessHistoryContent({ doorId, back }: { doorId?: string; back: () => void }) {
  const [days, setDays] = useState(1);
  const [method, setMethod] = useState<AccessLogDto['method']>();
  const [result, setResult] = useState<AccessLogDto['result']>();
  const [selected, setSelected] = useState<AccessLogDto>();
  const feed = useMemo(() => new AccessHistoryFeed(days, (page, from) => {
    if (!doorId) throw new Error('Chưa chọn cửa.');
    return accessLogService.list(backendDoorId(doorId), page, days, { method, result, from });
  }), [doorId, days, method, result]);
  const { items, loading, error, more } = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  useEffect(() => {
    void feed.refresh();
    return feed.cancel;
  }, [feed]);
  const changeFilter = (change: () => void) => {
    feed.cancel();
    setSelected(undefined);
    change();
  };
  return <>
    <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
      <PageHeader back={back} title="Lịch sử ra vào" action={
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới lịch sử"
          accessibilityState={{ disabled: loading, busy: loading }} disabled={loading}
          onPress={() => { setSelected(undefined); void feed.refresh(); }}
          style={[local.refresh, loading && { opacity: 0.45 }]}>
          <Ionicons name="refresh-outline" size={21} color={colors.primary} />
        </Pressable>
      } />
      <Card style={{ padding: 12, gap: 12 }}>
        <Filter label="Thời gian" value={days} onChange={value => changeFilter(() => setDays(value))}
          options={[{ value: 1, label: 'Hôm nay' }, { value: 7, label: '7 ngày' }, { value: 30, label: '30 ngày' }]} />
        <Filter<AccessLogDto['method'] | undefined> label="Phương thức" value={method}
          onChange={value => changeFilter(() => setMethod(value))}
          options={[{ value: undefined, label: 'Tất cả' },
            ...Object.entries(methodLabels).map(([value, label]) => ({ value: value as AccessLogDto['method'], label }))]} />
        <Filter<AccessLogDto['result'] | undefined> label="Kết quả" value={result}
          onChange={value => changeFilter(() => setResult(value))}
          options={[{ value: undefined, label: 'Tất cả' },
            ...Object.entries(resultLabels).map(([value, label]) => ({ value: value as AccessLogDto['result'], label }))]} />
      </Card>
      {loading && !items.length ? <LoadingState label="Đang tải lịch sử…" /> : null}
      {error ? <>
        <Notice tone="error">{error}</Notice>
        <Button title="Thử lại" variant="ghost" disabled={loading} onPress={() => { void feed.retry(); }} />
      </> : !loading && !items.length ? <EmptyState icon="time-outline" title="Chưa có lượt truy cập"
        description="Không có bản ghi phù hợp với bộ lọc đang chọn." /> : null}
      {items.map(log => {
        const device = sourceDeviceName(log);
        const granted = log.result === 'GRANTED';
        return <Pressable key={log.id} accessibilityRole="button"
          accessibilityLabel={`${actorName(log)}, ${methodLabels[log.method]}, ${resultLabels[log.result]}, ${referenceName(log.accessUnit, 'Cửa')}, ${formatVietnamTime(log.occurredAt)}`}
          accessibilityHint="Mở chi tiết lượt truy cập" onPress={() => setSelected(log)}
          style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <Card style={{ padding: 14, gap: 8 }}>
            <View style={[s.row, { alignItems: 'flex-start', gap: 8 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={[s.heading, { fontSize: 15 }]} numberOfLines={2}>{actorName(log)}</Text>
              </View>
              <Badge label={resultLabels[log.result] ?? 'Chưa rõ kết quả'} tone={granted ? 'success' : log.result === 'ERROR' ? 'error' : 'warning'} />
            </View>
            <View style={[s.row, { gap: 6 }]}>
              <Ionicons name="home-outline" size={14} color={colors.muted} />
              <Text style={[s.caption, { flex: 1 }]} numberOfLines={1}>
                {methodLabels[log.method] ?? 'Phương thức khác'} · {referenceName(log.accessUnit, 'Cửa')}
              </Text>
            </View>
            {device ? <View style={[s.row, { gap: 6 }]}>
              <Ionicons name="hardware-chip-outline" size={14} color={colors.muted} />
              <Text style={[s.caption, { flex: 1 }]} numberOfLines={1}>{device}</Text>
            </View> : null}
            <View style={[s.row, { gap: 6 }]}>
              <Text style={[s.caption, { fontSize: 12, flex: 1 }]}>{formatVietnamTime(log.occurredAt)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.subtle} />
            </View>
            {log.reasonCode ? <Text style={[s.caption, { fontSize: 12,
              color: granted ? colors.muted : log.result === 'ERROR' ? colors.error : colors.warning }]}
              numberOfLines={2}>{reasonText(log.reasonCode)}</Text> : null}
          </Card>
        </Pressable>;
      })}
      {more && !error ? <Button title={loading ? 'Đang tải thêm…' : 'Xem thêm lịch sử'} variant="ghost" loading={loading}
        onPress={() => { void feed.loadMore(); }} /> : null}
    </ScrollView>
    <AppModal visible={!!selected} title="Chi tiết lượt truy cập" scrollKey={selected ? String(selected.id) : undefined}
      onClose={() => setSelected(undefined)}>
      {selected ? <>
        <Detail label="Người thực hiện" value={actorName(selected)} />
        <Detail label="Phương thức" value={methodLabels[selected.method] ?? 'Phương thức khác'} />
        <Detail label="Kết quả" value={resultLabels[selected.result] ?? 'Chưa rõ kết quả'} />
        <Detail label="Cửa" value={referenceName(selected.accessUnit, 'Cửa')} />
        <Detail label="Thiết bị nguồn" value={referenceName(selected.device, 'Thiết bị')} />
        <Detail label="Thời gian (Việt Nam)" value={formatVietnamTime(selected.occurredAt)} />
        {selected.reasonCode ? <Detail label="Lý do / ghi chú" value={reasonText(selected.reasonCode)} /> : null}
        {selected.result === 'GRANTED' ? <Text style={s.caption}>
          Cho phép truy cập không xác nhận cánh cửa đã mở vật lý.
        </Text> : null}
        <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 4 }}>
          <Text style={s.label}>Thông tin bản ghi</Text>
          {selected.id != null ? <Text selectable style={s.caption}>ID bản ghi: {selected.id}</Text> : null}
          {selected.device?.id != null ? <Text selectable style={s.caption}>ID thiết bị: {selected.device.id}</Text> : null}
          {selected.accessUnit?.id != null ? <Text selectable style={s.caption}>ID cửa: {selected.accessUnit.id}</Text> : null}
        </View>
      </> : null}
    </AppModal>
  </>;
}

const local = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  activeChip: { borderColor: colors.primary, backgroundColor: colors.primary },
  refresh: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
