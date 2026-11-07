import { DoorDashboard } from './DoorDashboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { request } from '../services/api/client';
import { Badge, Button, Card, Notice, PageHeader, styles as s } from './ui';
import type { InventoryDevice } from './ActivationWizard';
import { FactoryReset } from './FactoryReset';
import { colors } from '../theme/tokens';
import { CameraNodeSettings } from './CameraNodeSettings';
import { DeviceSetup } from './DeviceSetup';
import { OwnerCredentials } from './OwnerCredentials';
import { deviceDisplayName } from '../services/api/productQr';
import type { SetupPage } from '../services/api/setupService';
import { lifecycleNotice } from '../services/api/deviceState';

export function OwnerDeviceSettings({ unitId, back }: { unitId: number; back: () => void }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [device, setDevice] = useState<InventoryDevice>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const updateDevice = useCallback((next: InventoryDevice) => { revision.current++; setDevice(next); }, []);
  const deviceUid = device?.deviceUid;
  const reload = useCallback(async () => {
    const ticket = ++revision.current;
    if (deviceUid) {
      const next = await request<InventoryDevice>(`/api/activation/devices/${deviceUid}`);
      if (ticket === revision.current) setDevice(next);
    }
    else {
      const rows = await request<InventoryDevice[]>('/api/activation/mine');
      if (ticket === revision.current) setDevice(rows.find((d) => d.unitId === unitId));
    }
  }, [unitId, deviceUid]);
  const setupChanged = useCallback((page: SetupPage) => {
    if (page === 'COMPLETE') void reload().catch(e => { setMessage(e.message); setFailed(true); });
  }, [reload]);
  useEffect(() => {
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try { await reload(); }
      catch (e) {
        setMessage(e instanceof Error ? e.message : 'Chưa lấy được trạng thái cửa.'); setFailed(true);
        if (e && typeof e === 'object' && 'status' in e && [403, 404].includes(Number(e.status))) setDevice(undefined);
      } finally { setLoading(false); running = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [reload]);
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
      {lifecycleNotice(device?.lifecycleStatus) ? <Notice tone="warning">{lifecycleNotice(device?.lifecycleStatus)}</Notice> : null}
      <Card>
        <View style={s.row}>
          <Text style={[s.heading, { flex: 1 }]}>Thông tin thiết bị</Text>
          {device ? (
            <Badge
              label={
                device.lifecycleStatus === 'SUSPENDED' ? 'Bị tạm ngưng'
                  : device.lifecycleStatus === 'MAINTENANCE' ? 'Đang bảo trì'
                  : device.lifecycleStatus === 'DECOMMISSIONED' ? 'Đã thu hồi'
                  : device.state === 'ACTIVE' && device.setupReady
                  ? 'Đã sẵn sàng'
                  : device.state === 'RESETTING'
                    ? 'Đang reset'
                    : device.state === 'CLAIMED'
                      ? 'Đang thiết lập'
                      : 'Trong danh mục'
              }
              tone={device.state === 'ACTIVE' && device.setupReady && device.lifecycleStatus === 'ACTIVE' ? 'success' : 'warning'}
            />
          ) : null}
        </View>
        <Text selectable style={s.caption}>
          {(device ? deviceDisplayName(device.deviceUid, device.name) : undefined) ??
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
        <DeviceSetup unitId={unitId} onStepChange={setupChanged} />
      </> : null}
      {device?.unitId && device.state !== 'RESETTING' ? <OwnerCredentials key={unitId} unitId={unitId} ready={device.setupReady} /> : null}
      {device ? <FactoryReset key={device.deviceUid} device={device} onUpdated={updateDevice} /> : null}
      {device?.unitId && device.state !== 'RESETTING' ? <CameraNodeSettings unitId={unitId} /> : null}
    </ScrollView>
  );
}
