import { DoorDashboard } from './DoorDashboard';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { request } from '../services/api/client';
import { Badge, Button, Card, Input, Notice, PageHeader, styles as s } from './ui';
import type { InventoryDevice } from './ActivationWizard';
import { useConfirm } from './ConfirmationProvider';
import { colors } from '../theme/tokens';
import { CameraNodeSettings } from './CameraNodeSettings';

export function OwnerDeviceSettings({ unitId, back }: { unitId: number; back: () => void }) {
  const confirmAction = useConfirm();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [device, setDevice] = useState<InventoryDevice>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recipientEmail, setRecipient] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    if (device) setDevice(await request(`/api/activation/devices/${device.deviceUid}`));
    else {
      const rows = await request<InventoryDevice[]>('/api/activation/mine');
      setDevice(rows.find((d) => d.unitId === unitId));
    }
  };
  useEffect(() => {
    void reload()
      .catch((e) => {
        setMessage(e.message);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [unitId]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await fn();
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : 'Lỗi kết nối.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader back={back} title="Cài đặt cửa" />
      {message ? <Notice tone={failed ? 'error' : 'info'}>{message}</Notice> : null}
      <Card>
        <View style={s.row}>
          <Text style={[s.heading, { flex: 1 }]}>Thông tin thiết bị</Text>
          {device ? (
            <Badge
              label={
                device.state === 'ACTIVE'
                  ? 'Đã sẵn sàng'
                  : device.state === 'RESETTING'
                    ? 'Đang reset'
                    : device.state === 'CLAIMED'
                      ? 'Đang thiết lập'
                      : 'Trong danh mục'
              }
              tone={device.state === 'ACTIVE' ? 'success' : 'warning'}
            />
          ) : null}
        </View>
        <Text selectable style={s.caption}>
          {device?.deviceUid ??
            (loading ? 'Đang tải thiết bị…' : 'Chưa tìm thấy thiết bị của cửa.')}
        </Text>
        <View style={{ backgroundColor: colors.background, padding: 14, borderRadius: 11, gap: 8 }}>
          <Text style={s.description}>
            Cảm biến cánh cửa:{' '}
            {device?.doorClosed == null ? 'Chưa có dữ liệu' : device.doorClosed ? 'Đóng' : 'Mở'}
          </Text>
          <Text style={s.description}>
            Lệnh chốt:{' '}
            {device?.latchReleased == null
              ? 'Chưa có dữ liệu'
              : device.latchReleased
                ? 'Nhả chốt'
                : 'Khóa chốt'}
          </Text>
        </View>
        <Text style={s.caption}>Trạng thái lệnh không thay thế việc kiểm tra cơ khí.</Text>
        <Button
          title="Cập nhật trạng thái"
          icon="refresh-outline"
          disabled={busy}
          onPress={() => {
            void act(reload);
          }}
        />
        <Button
          title="Mở trang Wi-Fi tại cửa"
          variant="ghost"
          icon="wifi-outline"
          onPress={() => {
            void Linking.openURL('http://192.168.4.1').catch(() => {
              setFailed(true);
              setMessage(
                'Chưa mở được trang thiết lập. Kết nối Wi-Fi riêng của cửa trước khi thử lại.',
              );
            });
          }}
        />
      </Card>
      <DoorDashboard unitId={unitId} />
      <Card>
        <Text style={s.heading}>Mã PIN mở cửa</Text>
        <Text style={s.description}>
          Đặt mã gồm 6 chữ số. Mã cũ không thể xem lại; mã mới cần được thiết bị xác nhận.
        </Text>
        <Input
          label="Mã PIN mới"
          value={pin}
          onChangeText={setPin}
          secureTextEntry
          keyboardType="numeric"
          placeholder="6 số mới"
        />
        <Button
          title="Gửi yêu cầu đổi PIN"
          disabled={busy || !/^\d{6}$/.test(pin)}
          onPress={() => {
            void act(async () => {
              await request(`/api/manager/units/${unitId}/pin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin, confirmPin: pin }),
              });
              setPin('');
              setMessage('Đã gửi yêu cầu đổi PIN. Chỉ áp dụng sau khi thiết bị xác nhận.');
            });
          }}
        />
      </Card>
      <Card style={{ borderColor: '#F1CBD1' }}>
        <Text style={[s.heading, { color: colors.error }]}>Reset / Chuyển giao</Text>
        <Text style={s.description}>
          Xóa dữ liệu cửa, PIN, Wi-Fi, thẻ, vân tay, thành viên và lịch sử. Không thể khôi phục.
          Nhập email người nhận nếu chuyển giao; để trống nếu chỉ reset.
        </Text>
        <Input
          label="Email người nhận · không bắt buộc"
          keyboardType="email-address"
          value={recipientEmail}
          onChangeText={setRecipient}
          placeholder="Email người nhận (nếu có)"
        />
        <Input
          label="UID xác nhận xóa dữ liệu"
          autoCapitalize="none"
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder="Nhập đúng device UID để xác nhận xóa"
        />
        <Input
          label="Mật khẩu tài khoản hiện tại"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Mật khẩu tài khoản hiện tại"
        />
        <Button
          title="Xác nhận xóa toàn bộ"
          variant="danger"
          disabled={busy || !device || confirmation !== device.deviceUid || !password}
          onPress={() => {
            void confirmAction({
              title: 'Xóa toàn bộ dữ liệu cửa?',
              message:
                'PIN, Wi-Fi, phương thức xác thực, thành viên và lịch sử sẽ bị xóa. Thao tác không thể hoàn tác.',
              confirmLabel: 'Xác nhận reset',
              destructive: true,
            }).then((ok) => {
              if (ok)
                void act(async () => {
                  await request(`/api/activation/devices/${device!.deviceUid}/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, confirmation, recipientEmail }),
                  });
                  setPassword('');
                  setMessage(
                    'Đang reset. Nhấn cập nhật để kiểm tra, không coi là hoàn tất trước khi thiết bị xác nhận.',
                  );
                  await reload();
                });
            });
          }}
        />
      </Card>
      {device?.state === 'INVENTORY' && device.operationUuid ? (
        <Card>
          <Text style={s.description}>Thiết bị đã reset. Xác thực lại để cấp mã nhận mới.</Text>
          <Input
            label="Mật khẩu tài khoản hiện tại"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mật khẩu tài khoản"
          />
          <Button
            title="Cấp mã kích hoạt mới"
            disabled={busy || !password}
            onPress={() => {
              void act(async () => {
                const r = await request<{ activationCode: string }>(
                  `/api/activation/devices/${device.deviceUid}/issue-code`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password }),
                  },
                );
                setPassword('');
                setMessage(`Mã bàn giao mới: ${r.activationCode}`);
              });
            }}
          />
        </Card>
      ) : null}
      {device?.unitId ? <CameraNodeSettings unitId={unitId} /> : null}
    </ScrollView>
  );
}
