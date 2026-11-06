import { DoorDashboard } from './DoorDashboard';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { request } from '../services/api/client';
import { Badge, Button, Card, Input, Notice, PageHeader, styles as s } from './ui';
import type { InventoryDevice } from './ActivationWizard';
import { FactoryReset } from './FactoryReset';
import { colors } from '../theme/tokens';
import { CameraNodeSettings } from './CameraNodeSettings';
import { DeviceSetup } from './DeviceSetup';

export function OwnerDeviceSettings({ unitId, back }: { unitId: number; back: () => void }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [device, setDevice] = useState<InventoryDevice>();
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
      </Card>
      {device?.unitId && device.state !== 'RESETTING' ? <>
        <DoorDashboard unitId={unitId} />
        <DeviceSetup unitId={unitId} />
      </> : null}
      {device?.setupReady && device.state !== 'RESETTING' ? <Card>
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
      </Card> : null}
      {device ? <FactoryReset key={device.deviceUid} device={device} onUpdated={setDevice} /> : null}
      {device?.unitId && device.state !== 'RESETTING' ? <CameraNodeSettings unitId={unitId} /> : null}
    </ScrollView>
  );
}
