import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { accessLogService, AccessLogDto } from '../services/api/accessLogService';
import { backendDoorId } from '../services/api/client';
import { colors } from '../theme/tokens';

const reasonLabels: Record<string, string> = {
  NO_MATCH: 'Không tìm thấy mẫu xác thực phù hợp',
  CREDENTIAL_NOT_ACTIVE: 'Mẫu xác thực chưa hoạt động',
  UNKNOWN_FACE: 'Không nhận diện được khuôn mặt',
  FACE_DISABLED: 'Cửa chưa bật quyền khuôn mặt',
  MODEL_MISMATCH: 'Model nhận diện không khớp',
  BELOW_THRESHOLD: 'Độ tin cậy chưa đạt yêu cầu',
  LIVENESS_REQUIRED: 'Chưa xác minh được người thật',
  ACCESS_REVOKED: 'Tài khoản không có quyền mở cửa',
  CONTROLLER_OFFLINE: 'Bộ điều khiển cửa đang ngoại tuyến',
  DOOR_BUSY: 'Cửa đang xử lý một lệnh khác',
  WAITING_ACK: 'Đang chờ thiết bị xác nhận',
  DEVICE_FAILED: 'Thiết bị báo không thể mở cửa',
  SEND_FAILED: 'Không gửi được lệnh đến thiết bị',
  ACK_TIMEOUT: 'Thiết bị không phản hồi kịp thời',
};
const methodLabels: Record<string, string> = {
  FACE: 'Khuôn mặt',
  FINGERPRINT: 'Vân tay',
  RFID: 'Thẻ RFID',
  PIN: 'Mã PIN',
  REMOTE_UNLOCK: 'Mở từ xa',
};

export function AccessHistory({ doorId, back }: { doorId?: string; back: () => void }) {
  const [items, setItems] = useState<AccessLogDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(1);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.resolve()
      .then(() => {
        if (!doorId) throw new Error('Chưa chọn cửa.');
        return accessLogService.list(backendDoorId(doorId), page, days);
      })
      .then((data) => {
        if (active) {
          setItems((old) => (page ? [...old, ...data.items] : data.items));
          setMore(data.hasNext);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Không tải được lịch sử.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doorId, days, page, retry]);
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title="Lịch sử ra vào" />
      <View style={{ flexDirection: 'row', gap: 9, flexWrap: 'wrap' }}>
        {[1, 7, 30].map((d) => (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: days === d }}
            onPress={() => {
              setItems([]);
              setPage(0);
              setDays(d);
            }}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              minHeight: 44,
              borderRadius: 11,
              backgroundColor: days === d ? colors.primarySoft : colors.surface,
              borderWidth: 1,
              borderColor: days === d ? '#CBDEFF' : colors.border,
            }}
          >
            <Text
              style={{
                color: days === d ? colors.primary : colors.muted,
                fontSize: 15,
                fontWeight: '600',
              }}
            >
              {d === 1 ? 'Hôm nay' : `${d} ngày`}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading && <LoadingState label="Đang tải lịch sử…" />}
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Thử lại" variant="ghost" onPress={() => setRetry((v) => v + 1)} />
        </>
      ) : !loading && !items.length ? (
        <EmptyState icon="time-outline" title="Chưa có lượt truy cập" />
      ) : null}
      {items.map((l) => (
        <Card key={l.id} style={{ gap: 14 }}>
          <View style={s.row}>
            <View
              style={{
                width: 45,
                height: 48,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: l.result === 'GRANTED' ? colors.successSoft : colors.errorSoft,
              }}
            >
              <Ionicons
                name={l.result === 'GRANTED' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                size={25}
                color={l.result === 'GRANTED' ? colors.success : colors.error}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.heading}>{l.account?.name ?? 'Không xác định'}</Text>
              <Text style={s.description}>{l.accessUnit.name}</Text>
            </View>
            <Badge
              label={l.result === 'GRANTED' ? 'Cho phép' : l.result === 'ERROR' ? 'Lỗi' : 'Từ chối'}
              tone={l.result === 'GRANTED' ? 'success' : 'error'}
            />
          </View>
          <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 6 }}>
            <Text style={[s.description, { color: colors.text }]}>
              {methodLabels[l.method] ?? 'Phương thức khác'} · {l.device.name}
            </Text>
            <Text style={s.caption}>{new Date(l.occurredAt).toLocaleString('vi-VN')}</Text>
            {l.reasonCode ? (
              <Text
                style={[s.caption, { color: l.result === 'GRANTED' ? colors.muted : colors.error }]}
              >
                {reasonLabels[l.reasonCode] ?? l.reasonCode}
              </Text>
            ) : null}
          </View>
        </Card>
      ))}
      {more && !error ? (
        <Button
          title={loading ? 'Đang tải…' : 'Xem thêm lịch sử'}
          variant="ghost"
          disabled={loading}
          onPress={() => setPage((p) => p + 1)}
        />
      ) : null}
    </ScrollView>
  );
}
