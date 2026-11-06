import { ItemList } from './ItemList';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { request } from '../services/api/client';
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
import { useConfirm } from './ConfirmationProvider';
import { colors } from '../theme/tokens';
type Invitation = {
  id: number;
  doorName: string;
  ownerName: string;
  status: string;
  expiresAt: string;
};
const labels: Record<string, string> = {
  PENDING: 'Chờ phản hồi',
  ACCEPTED: 'Đã chấp nhận',
  DECLINED: 'Đã từ chối',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};
export function RealInvitations({ changed }: { changed: () => Promise<void> }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Invitation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await request<Invitation[]>('/api/invitations');
        if (active) {
          setRows(result);
          setError('');
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Không tải được lời mời.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [revision]);
  const respond = async (id: number, accept: boolean) => {
    if (
      !accept &&
      !(await confirm({
        title: 'Từ chối lời mời?',
        message: 'Bạn sẽ không tham gia cửa từ lời mời này.',
        confirmLabel: 'Từ chối lời mời',
      }))
    )
      return;
    setBusy(id);
    setError('');
    try {
      await request(`/api/invitations/${id}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      setRows(await request<Invitation[]>('/api/invitations'));
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xử lý được lời mời.');
    } finally {
      setBusy(undefined);
    }
  };
  const pending = rows.filter((row) => row.status === 'PENDING').length;
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader
        title="Lời mời"
        description={pending ? `${pending} lời mời chờ phản hồi` : undefined}
      />
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Thử lại" variant="ghost" onPress={() => setRevision((v) => v + 1)} />
        </>
      ) : null}
      {loading ? (
        <LoadingState label="Đang tải lời mời…" />
      ) : (
        <ItemList
          items={rows}
          resetKey={''}
          renderItem={(item) => (
            <Card key={item.id}>
              <View style={s.row}>
                <View style={s.emptyIcon}>
                  <Ionicons name="mail-open-outline" size={25} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={s.heading}>{item.doorName}</Text>
                  <Text style={s.description}>Từ {item.ownerName}</Text>
                </View>
              </View>
              <Badge
                label={labels[item.status] ?? item.status}
                tone={
                  item.status === 'PENDING'
                    ? 'warning'
                    : item.status === 'ACCEPTED'
                      ? 'success'
                      : 'neutral'
                }
              />
              {item.expiresAt ? (
                <Text style={s.caption}>
                  Hạn phản hồi: {new Date(item.expiresAt).toLocaleString('vi-VN')}
                </Text>
              ) : null}
              {item.status === 'PENDING' ? (
                <>
                  <Button
                    title={busy === item.id ? 'Đang xử lý…' : 'Chấp nhận lời mời'}
                    loading={busy === item.id}
                    disabled={busy !== undefined}
                    onPress={() => {
                      void respond(item.id, true);
                    }}
                  />
                  <Button
                    title="Từ chối"
                    variant="ghost"
                    disabled={busy !== undefined}
                    onPress={() => {
                      void respond(item.id, false);
                    }}
                  />
                </>
              ) : null}
            </Card>
          )}
        />
      )}
      {!loading && !error && !rows.length ? (
        <EmptyState icon="mail-outline" title="Chưa có lời mời nào" />
      ) : null}
      <Notice>Sau khi bạn chấp nhận, chủ cửa sẽ cấp từng phương thức xác thực tại cửa đó.</Notice>
    </ScrollView>
  );
}
