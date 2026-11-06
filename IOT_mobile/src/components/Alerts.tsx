import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  styles as s,
} from './ui';
import { alertService, AlertDto } from '../services/api/alertService';
import { colors } from '../theme/tokens';

export function Alerts({ back }: { back: () => void }) {
  const [items, setItems] = useState<AlertDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [severity, setSeverity] = useState<AlertDto['severity']>();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    alertService
      .list(page, severity)
      .then((data) => {
        if (active) {
          setItems((old) => (page ? [...old, ...data.items] : data.items));
          setMore(data.hasNext);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Không tải được cảnh báo.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, severity, retry]);
  const labels = { INFO: 'Thông tin', WARNING: 'Cảnh báo', CRITICAL: 'Khẩn cấp' };
  const statuses: Record<string, string> = {
    NONE: 'Thông tin',
    OPEN: 'Đang mở',
    ACKNOWLEDGED: 'Đã xác nhận',
    RESOLVED: 'Đã xử lý',
  };
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title="Cảnh báo & thông báo" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {([undefined, 'INFO', 'WARNING', 'CRITICAL'] as const).map((value) => (
          <Pressable
            key={value ?? 'all'}
            onPress={() => {
              setItems([]);
              setPage(0);
              setSeverity(value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: severity === value }}
            style={{
              paddingHorizontal: 13,
              paddingVertical: 11,
              minHeight: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: severity === value ? '#CBDEFF' : colors.border,
              backgroundColor: severity === value ? colors.primarySoft : colors.surface,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: severity === value ? colors.primary : colors.muted,
              }}
            >
              {value ? labels[value] : 'Tất cả'}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? <LoadingState label="Đang tải cảnh báo…" /> : null}
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Thử lại" variant="ghost" onPress={() => setRetry((v) => v + 1)} />
        </>
      ) : !loading && !items.length ? (
        <EmptyState icon="notifications-outline" title="Chưa có thông báo" />
      ) : null}
      {items.map((item) => (
        <Card
          key={item.id}
          style={{
            borderLeftWidth: 3,
            borderLeftColor:
              item.severity === 'CRITICAL'
                ? colors.error
                : item.severity === 'WARNING'
                  ? colors.warning
                  : colors.primary,
          }}
        >
          <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
            <Badge
              label={labels[item.severity]}
              tone={
                item.severity === 'CRITICAL'
                  ? 'error'
                  : item.severity === 'WARNING'
                    ? 'warning'
                    : 'primary'
              }
            />
            <Text style={s.caption}>{statuses[item.status] ?? item.status}</Text>
          </View>
          <Text style={s.heading}>{item.message ?? item.eventType.replace(/_/g, ' ')}</Text>
          <Text style={s.description}>
            {item.accessUnit?.name ?? 'Chưa gắn cửa'} · {item.device.name}
          </Text>
          <Text style={s.caption}>{new Date(item.occurredAt).toLocaleString('vi-VN')}</Text>
        </Card>
      ))}
      <Button
        title="Làm mới danh sách"
        icon="refresh-outline"
        variant="ghost"
        disabled={loading}
        onPress={() => {
          setPage(0);
          setRetry((v) => v + 1);
        }}
      />
      {more && !error ? (
        <Button title="Xem thêm" disabled={loading} onPress={() => setPage((p) => p + 1)} />
      ) : null}
    </ScrollView>
  );
}
