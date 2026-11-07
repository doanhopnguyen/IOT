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
  LOCAL_ACCESS_DENIED: 'Thiết bị từ chối tại cửa',
  OFFLINE_CREDENTIAL_CHANGED: 'Mẫu xác thực đã thay đổi khi thiết bị mất mạng',
  DEVICE_CLOCK_UNSYNCED: 'Giờ thiết bị chưa đồng bộ, dùng giờ máy chủ',
  DEVICE_CLOCK_INVALID: 'Giờ thiết bị sai, dùng giờ máy chủ',
};
// Backend có thể ghi nhiều lý do cùng lúc, cách nhau bằng dấu phẩy.
const reasonText = (code: string) =>
  code
    .split(',')
    .map((c) => reasonLabels[c] ?? 'Không xác định nguyên nhân')
    .join(' · ');
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
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 4,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {[1, 7, 30].map((d) => {
          const active = days === d;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setItems([]);
                setPage(0);
                setDays(d);
              }}
              style={{
                flex: 1,
                paddingHorizontal: 10,
                paddingVertical: 8,
                minHeight: 36,
                borderRadius: 12,
                backgroundColor: active ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: active ? '#fff' : colors.muted,
                  fontSize: 13,
                  fontWeight: active ? '700' : '600',
                }}
              >
                {d === 1 ? 'Hôm nay' : `${d} ngày`}
              </Text>
            </Pressable>
          );
        })}
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
        <Card key={l.id} style={{ padding: 14, gap: 6 }}>
          <View style={s.row}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: l.result === 'GRANTED' ? colors.surfaceAlt : colors.errorSoft,
                borderWidth: 1,
                borderColor: l.result === 'GRANTED' ? colors.border : '#FECACA',
              }}
            >
              <Ionicons
                name={l.result === 'GRANTED' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                size={22}
                color={l.result === 'GRANTED' ? colors.primary : colors.error}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.heading} numberOfLines={1}>
                {l.account?.name ?? 'Không xác định'}
              </Text>
              <Text style={[s.caption, { fontSize: 12.5 }]} numberOfLines={1}>
                {methodLabels[l.method] ?? 'Phương thức khác'} · {l.accessUnit.name}
              </Text>
              <Text style={[s.caption, { fontSize: 12 }]}>
                {new Date(l.occurredAt).toLocaleString('vi-VN')}
              </Text>
            </View>
            <Badge
              label={l.result === 'GRANTED' ? 'Cho phép' : l.result === 'ERROR' ? 'Lỗi' : 'Từ chối'}
              tone={l.result === 'GRANTED' ? 'success' : 'error'}
            />
          </View>
          {l.reasonCode ? (
            <Text
              style={[
                s.caption,
                {
                  fontSize: 12,
                  color: l.result === 'GRANTED' ? colors.muted : colors.error,
                  paddingLeft: 52,
                },
              ]}
            >
              {reasonText(l.reasonCode)}
            </Text>
          ) : null}
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
