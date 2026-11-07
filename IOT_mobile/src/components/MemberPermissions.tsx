import { ItemList } from './ItemList';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { request } from '../services/api/client';
import { managerService } from '../services/api/managerService';
import { Badge, Button, Card, Notice, styles as s } from './ui';
import { useConfirm } from './ConfirmationProvider';
import { colors } from '../theme/tokens';
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
      <Text style={[s.heading, { marginTop: 12 }]}>Thẻ & vân tay</Text>
      {
        <ItemList
          items={active}
          resetKey={`${unitId}:${userId}`}
          renderItem={(c) => (
            <View
              key={c.id}
              style={{ paddingTop: 12, borderTopWidth: 1, borderColor: colors.border, gap: 10 }}
            >
              <View style={s.row}>
                <Text style={[s.description, { color: colors.text, flex: 1 }]}>
                  {c.type === 'RFID' ? `Thẻ ${c.rfidUid}` : `Vân tay #${c.templateId}`}
                </Text>
                <Badge
                  label={c.status === 'ACTIVE' ? 'Đang dùng' : c.status}
                  tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}
                />
              </View>
              <Button
                title="Thu hồi phương thức"
                variant="ghost"
                disabled={busy || disabled}
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
              />
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
