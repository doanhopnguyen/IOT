import { useEffect, useMemo, useState } from 'react';
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
import { alertService, AlertDto, type AlertStatistics as Statistics } from '../services/api/alertService';
import { colors } from '../theme/tokens';
import { subscribeUpdates } from '../services/api/realtime';
import { useConfirm } from './ConfirmationProvider';
import { AlertStatistics } from './AlertStatistics';
import { AlertFilters, type AlertPeriod } from './AlertFilters';
import { alertDateRange } from '../services/api/alertFilters';
import type { Reference } from '../services/api/client';

const automaticTypes = new Set(['DEVICE_OFFLINE', 'DOOR_LEFT_OPEN', 'SENSOR_FAULT']);

const statusText: Record<AlertDto['status'], string> = {
  NONE: 'Không theo dõi',
  OPEN: 'Chưa xem',
  ACKNOWLEDGED: 'Đã xem',
  RESOLVED: 'Đã xử lý',
};

export function Alerts({ back }: { back: () => void }) {
  const confirm = useConfirm();
  const [period, setPeriod] = useState<AlertPeriod>(7);
  const [customRange, setCustomRange] = useState(() => alertDateRange(7));
  const [users, setUsers] = useState<Reference[]>([]);
  const [userId, setUserId] = useState<number>();
  const [usersError, setUsersError] = useState('');
  const [statistics, setStatistics] = useState<Statistics>();
  const [items, setItems] = useState<AlertDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [severity, setSeverity] = useState<AlertDto['severity']>();
  const [busyId, setBusyId] = useState<number>();
  const today = alertDateRange(1).to;
  const filters = useMemo(() => ({
    ...(period === 'custom' ? customRange : alertDateRange(period, new Date(`${today}T12:00:00`))),
    relatedUserId: userId, severity,
  }), [period, customRange, userId, severity, today]);
  const resetResults = () => { setItems([]); setStatistics(undefined); setPage(0); setActionError(''); };
  const change = async (alert: AlertDto, status: 'ACKNOWLEDGED' | 'RESOLVED') => {
    if (busyId !== undefined) return;
    if (status === 'RESOLVED' && !(await confirm({
      title: 'Xác nhận đã xử lý',
      message: 'Bạn đã kiểm tra cửa và các lượt xác thực bất thường?',
      confirmLabel: 'Đã kiểm tra và xử lý',
    }))) return;
    setBusyId(alert.id);
    setActionError('');
    try {
      const updated = await alertService.setStatus(alert.id, status);
      setItems((old) => old.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không cập nhật được cảnh báo.');
    } finally {
      setBusyId(undefined);
      setRetry((value) => value + 1);
    }
  };
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    const unsubscribe = subscribeUpdates(refresh);
    // Fallback when the socket is unavailable; also catches automatic recovery.
    const timer = setInterval(refresh, 15000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    alertService.users().then(data => {
      if (active) {
        setUsers(data); setUsersError('');
        setUserId(selected => selected !== undefined && !data.some(user => user.id === selected) ? undefined : selected);
      }
    }).catch((e: unknown) => {
      if (active) setUsersError(e instanceof Error ? e.message : 'Không tải được người dùng.');
    });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return undefined;
      setLoading(true); setError('');
      return Promise.all([
        alertService.statistics(filters),
        Promise.all(Array.from({ length: page + 1 }, (_, index) => alertService.list(index, filters.severity, filters))),
      ]);
    }).then((result) => {
        if (!result) return;
        const [summary, pages] = result;
        if (active) {
          setStatistics(summary);
          setItems([...new Map(pages.flatMap(data => data.items).map(item => [item.id, item])).values()]);
          setMore(pages[pages.length - 1].hasNext);
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
  }, [page, filters, retry]);
  const labels = { INFO: 'Thông tin', WARNING: 'Cảnh báo', CRITICAL: 'Khẩn cấp' };
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title="Cảnh báo & thông báo" />
      <AlertFilters users={users} userId={userId} period={period} range={filters}
        onUser={id => { if (id !== userId) { resetResults(); setUserId(id); } }}
        onPeriod={value => { if (value !== period) { resetResults(); setPeriod(value); } }}
        onRange={range => { resetResults(); setCustomRange(range); setPeriod('custom'); }} />
      {usersError ? <Notice tone="error">{usersError}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {([undefined, 'INFO', 'WARNING', 'CRITICAL'] as const).map((value) => (
          <Pressable
            key={value ?? 'all'}
            onPress={() => {
              if (severity === value) return;
              resetResults();
              setSeverity(value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: severity === value }}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              minHeight: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: severity === value ? colors.primary : colors.border,
              backgroundColor: severity === value ? colors.primary : colors.surface,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: severity === value ? '#fff' : colors.muted,
              }}
            >
              {value ? labels[value] : 'Tất cả'}
            </Text>
          </Pressable>
        ))}
      </View>
      <AlertStatistics data={statistics} />
      {loading && !items.length ? <LoadingState label="Đang tải cảnh báo…" /> : null}
      {actionError ? <Notice tone="error">{actionError}</Notice> : null}
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
            <Text style={s.caption}>{statusText[item.status]}</Text>
          </View>
          <Text style={s.heading}>{item.message ?? item.eventType.replace(/_/g, ' ')}</Text>
          <Text style={s.description}>
            {item.accessUnit?.name ?? 'Chưa gắn cửa'} · {item.device.name}
          </Text>
          {item.relatedUsers?.length ? <Text style={s.caption}>
            Liên quan: {item.relatedUsers.map(user => user.name).join(', ')}
          </Text> : null}
          <Text style={s.caption}>{new Date(item.occurredAt).toLocaleString('vi-VN')}</Text>
          {item.status === 'OPEN' ? (
            <Button
              title="Đã xem"
              variant="ghost"
              disabled={busyId !== undefined}
              onPress={() => {
                void change(item, 'ACKNOWLEDGED');
              }}
            />
          ) : null}
          {(item.status === 'OPEN' || item.status === 'ACKNOWLEDGED') && !automaticTypes.has(item.eventType) ? (
            <Button
              title="Đã xử lý"
              disabled={busyId !== undefined}
              onPress={() => {
                void change(item, 'RESOLVED');
              }}
            />
          ) : null}
          {(item.status === 'OPEN' || item.status === 'ACKNOWLEDGED') && automaticTypes.has(item.eventType)
            ? <Text style={s.caption}>Tự xử lý khi sự cố được khắc phục</Text> : null}
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
