import { Ionicons } from '@expo/vector-icons';
import { ItemList } from './ItemList';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { request } from '../services/api/client';
import { managerService } from '../services/api/managerService';
import { Card, Notice, styles as s } from './ui';
import { useConfirm } from './ConfirmationProvider';
import { colors, fonts } from '../theme/tokens';
type Credential = {
  id: number;
  type: string;
  status: string;
  rfidUid?: string;
  templateId?: number;
};
export function MemberPermissions({
  unitId,
  userId,
  methods,
  changed,
  self = false,
  disabled = false,
}: {
  unitId: number;
  userId: number;
  methods: string[];
  changed: () => Promise<void>;
  self?: boolean;
  disabled?: boolean;
}) {
  const confirm = useConfirm();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const path = `/api/manager/units/${unitId}/users/${userId}`;
  useEffect(() => {
    let active = true;
    void request<Credential[]>(path + '/credentials')
      .then((r) => {
        if (active) {
          setCredentials(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, methods]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await changed();
      setCredentials(await request(path + '/credentials'));
      setMessage('Đã lưu thay đổi trên hệ thống. Thiết bị cần nhận đồng bộ để áp dụng.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };
  const permissions = [
    ['RFID', 'allowRfid'],
    ['Vân tay', 'allowFingerprint'],
    ['Mở từ xa', 'allowRemoteUnlock'],
  ] as const;
  const active = credentials.filter(
    (c) => c.status !== 'REVOKED' && (c.type === 'RFID' || c.type === 'FINGERPRINT'),
  );
  return (
    <Card>
      <Text style={s.heading}>{self ? 'Thẻ và vân tay của bạn' : 'Quyền theo phương thức'}</Text>
      {(self ? [] : permissions).map(([label, key]) => (
        <View key={key} style={[s.row, { paddingVertical: 6 }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[s.description, { color: colors.text }]}>{label}</Text>
            <Text style={s.caption}>
              {methods.includes(label) ? 'Đang được cho phép' : 'Chưa được cấp quyền'}
            </Text>
          </View>
          <Switch
            accessibilityLabel={`Quyền ${label}`}
            value={methods.includes(label)}
            disabled={busy || disabled}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
            onValueChange={(value) => {
              void confirm({
                title: `${value ? 'Bật' : 'Tắt'} quyền ${label}?`,
                message: 'Thay đổi chỉ áp dụng cho thành viên tại cửa hiện tại.',
                confirmLabel: 'Lưu thay đổi',
                destructive: !value,
              }).then((ok) => {
                if (ok)
                  void run(() =>
                    request(path + '/permissions', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ [key]: value }),
                    }),
                  );
              });
            }}
          />
        </View>
      ))}
      <Text style={[s.heading, !self && { marginTop: 8 }]}>Thẻ & vân tay đã đăng ký</Text>
      {
        <ItemList
          items={active}
          resetKey={`${unitId}:${userId}`}
          renderItem={(c) => (
            <View
              key={c.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={c.type === 'RFID' ? 'card-outline' : 'finger-print-outline'}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontFamily: fonts.semibold,
                    fontSize: 14.5,
                    color: colors.text,
                    fontWeight: '600',
                  }}
                >
                  {c.type === 'RFID' ? `Thẻ ${c.rfidUid}` : `Vân tay #${c.templateId}`}
                </Text>
                <Text style={s.caption}>
                  {c.status === 'ACTIVE' ? 'Đang hoạt động' : c.status}
                </Text>
              </View>
              <Pressable
                disabled={busy || disabled}
                accessibilityRole="button"
                accessibilityLabel="Thu hồi phương thức"
                onPress={() => {
                  void confirm({
                    title: 'Thu hồi phương thức?',
                    message: 'Phương thức này sẽ ngừng được phép mở cửa.',
                    confirmLabel: 'Thu hồi',
                    destructive: true,
                  }).then((ok) => {
                    if (ok)
                      void run(async () => {
                        const result = await request(
                          path + `/${c.type === 'RFID' ? 'rfids' : 'fingerprints'}/${c.id}`,
                          { method: 'DELETE' },
                        );
                        if (c.type !== 'RFID') {
                          const ack = await managerService.waitForCommand(
                            result as Awaited<ReturnType<typeof managerService.commandStatus>>,
                          );
                          if (ack.status !== 'ACKNOWLEDGED')
                            throw Error(ack.resultMessage || 'Thiết bị chưa xác nhận xóa');
                        }
                      });
                  });
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FEE2E2',
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.semibold,
                    fontSize: 12.5,
                    color: colors.error,
                    fontWeight: '600',
                  }}
                >
                  Thu hồi
                </Text>
              </Pressable>
            </View>
          )}
        />
      }
      {!active.length ? (
        <Text style={s.description}>Chưa có thẻ hoặc vân tay đang sử dụng.</Text>
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}
