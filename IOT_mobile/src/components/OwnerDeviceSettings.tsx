import { Ionicons } from '@expo/vector-icons';
import { DoorDashboard } from './DoorDashboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { request } from '../services/api/client';
import { Badge, Button, Card, FeatureTile, Notice, PageHeader, styles as s } from './ui';
import type { InventoryDevice } from './ActivationWizard';
import { FactoryReset } from './FactoryReset';
import { colors, fonts, radius } from '../theme/tokens';
import { CameraNodeSettings } from './CameraNodeSettings';
import { DeviceSetup } from './DeviceSetup';
import { OwnerCredentials } from './OwnerCredentials';
import { deviceDisplayName } from '../services/api/productQr';
import type { SetupPage } from '../services/api/setupService';
import { lifecycleNotice } from '../services/api/deviceState';

export type SettingsSection =
  | 'hub'
  | 'stats'
  | 'remote-config'
  | 'lockdown'
  | 'owner-credentials'
  | 'servo'
  | 'pins-calibrate'
  | 'wifi'
  | 'camera-ai'
  | 'factory-reset'
  | 'setup-wizard';

const sectionMeta: Record<
  Exclude<SettingsSection, 'hub'>,
  { title: string }
> = {
  stats: {
    title: 'Thống kê & Báo cáo',
  },
  'remote-config': {
    title: 'Hẹn giờ & Quyền',
  },
  lockdown: {
    title: 'Tạm khóa khẩn cấp',
  },
  'owner-credentials': {
    title: 'Thẻ & Vân tay chủ cửa',
  },
  servo: {
    title: 'Góc khóa Servo',
  },
  'pins-calibrate': {
    title: 'Mã PIN & Cảm biến',
  },
  wifi: {
    title: 'Wi-Fi của cửa',
  },
  'camera-ai': {
    title: 'Camera AI & Laptop',
  },
  'factory-reset': {
    title: 'Khôi phục xuất xưởng',
  },
  'setup-wizard': {
    title: 'Thiết lập ban đầu',
  },
};

export function OwnerDeviceSettings({
  unitId,
  back,
  initialSection = 'hub',
}: {
  unitId: number;
  back: () => void;
  initialSection?: SettingsSection;
}) {
  const { width } = useWindowDimensions();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [device, setDevice] = useState<InventoryDevice>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  const updateDevice = useCallback((next: InventoryDevice) => {
    revision.current++;
    setDevice(next);
  }, []);

  const deviceUid = device?.deviceUid;
  const reload = useCallback(async () => {
    const ticket = ++revision.current;
    if (deviceUid) {
      const next = await request<InventoryDevice>(`/api/activation/devices/${deviceUid}`);
      if (ticket === revision.current) setDevice(next);
    } else {
      const rows = await request<InventoryDevice[]>('/api/activation/mine');
      if (ticket === revision.current) setDevice(rows.find((d) => d.unitId === unitId));
    }
  }, [unitId, deviceUid]);

  const setupChanged = useCallback(
    (page: SetupPage) => {
      if (page === 'COMPLETE')
        void reload().catch((e) => {
          setMessage(e.message);
          setFailed(true);
        });
    },
    [reload],
  );

  useEffect(() => {
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        await reload();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Chưa lấy được trạng thái cửa.');
        setFailed(true);
        if (
          e &&
          typeof e === 'object' &&
          'status' in e &&
          [403, 404].includes(Number(e.status))
        )
          setDevice(undefined);
      } finally {
        setLoading(false);
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
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

  const gridCellWidth = width >= 680 ? '31.5%' : '48%';
  const isResetting = device?.state === 'RESETTING';
  const needsInitialSetup =
    device && !isResetting && (!device.setupReady || device.state !== 'ACTIVE');

  if (section !== 'hub') {
    const meta = sectionMeta[section];
    return (
      <ScrollView
        key={section}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        <PageHeader
          back={() => setSection('hub')}
          title={meta.title}
        />
        {message ? <Notice tone={failed ? 'error' : 'info'}>{message}</Notice> : null}
        {lifecycleNotice(device?.lifecycleStatus) ? (
          <Notice tone="warning">{lifecycleNotice(device?.lifecycleStatus)}</Notice>
        ) : null}

        {section === 'stats' ? <DoorDashboard unitId={unitId} section="stats" /> : null}
        {section === 'remote-config' ? (
          <DoorDashboard unitId={unitId} section="remote-config" />
        ) : null}
        {section === 'lockdown' ? <DoorDashboard unitId={unitId} section="lockdown" /> : null}
        {section === 'owner-credentials' ? (
          <OwnerCredentials key={unitId} unitId={unitId} ready={Boolean(device?.setupReady)} />
        ) : null}
        {section === 'servo' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="servo"
            standaloneSubView
            onStepChange={setupChanged}
          />
        ) : null}
        {section === 'pins-calibrate' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="pins"
            standaloneSubView
            onStepChange={setupChanged}
          />
        ) : null}
        {section === 'wifi' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="wifi"
            standaloneSubView
            onStepChange={setupChanged}
          />
        ) : null}
        {section === 'camera-ai' ? <CameraNodeSettings unitId={unitId} /> : null}
        {section === 'setup-wizard' ? (
          <DeviceSetup unitId={unitId} onStepChange={setupChanged} />
        ) : null}
        {section === 'factory-reset' && device ? (
          <FactoryReset key={device.deviceUid} device={device} onUpdated={updateDevice} />
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <PageHeader
        back={back}
        title="Cài đặt cửa"
        action={
          <Pressable
            onPress={() => {
              void act(reload);
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cập nhật trạng thái"
            style={oStyles.refreshIconBtn}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
          </Pressable>
        }
      />

      {message ? <Notice tone={failed ? 'error' : 'info'}>{message}</Notice> : null}
      {lifecycleNotice(device?.lifecycleStatus) ? (
        <Notice tone="warning">{lifecycleNotice(device?.lifecycleStatus)}</Notice>
      ) : null}

      <Card style={oStyles.heroCard}>
        <View style={s.row}>
          <View style={oStyles.chipEmblem}>
            <Ionicons name="hardware-chip-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={oStyles.heroTitle}>Thông tin thiết bị</Text>
            <Text selectable style={oStyles.heroUid}>
              {(device ? deviceDisplayName(device.deviceUid, device.name) : undefined) ??
                (loading ? 'Đang tải thiết bị…' : 'Chưa tìm thấy thiết bị của cửa.')}
            </Text>
          </View>
          {device ? (
            <Badge
              label={
                device.lifecycleStatus === 'SUSPENDED'
                  ? 'Bị tạm ngưng'
                  : device.lifecycleStatus === 'MAINTENANCE'
                    ? 'Đang bảo trì'
                    : device.lifecycleStatus === 'DECOMMISSIONED'
                      ? 'Đã thu hồi'
                      : device.state === 'ACTIVE' && device.setupReady
                        ? 'Đã sẵn sàng'
                        : device.state === 'RESETTING'
                          ? 'Đang reset'
                          : device.state === 'CLAIMED'
                            ? 'Đang thiết lập'
                            : 'Trong danh mục'
              }
              tone={
                device.state === 'ACTIVE' &&
                device.setupReady &&
                device.lifecycleStatus === 'ACTIVE'
                  ? 'success'
                  : 'warning'
              }
            />
          ) : null}
        </View>

        <View style={oStyles.sensorGrid}>
          <View style={oStyles.sensorBox}>
            <View style={s.row}>
              <Ionicons
                name={device?.doorClosed ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                size={18}
                color={device?.doorClosed ? colors.success : colors.warning}
              />
              <Text style={oStyles.sensorLabel}>Cảm biến cánh cửa</Text>
            </View>
            <Text style={oStyles.sensorValue}>
              {device?.doorClosed == null
                ? 'Chưa có dữ liệu'
                : device.doorClosed
                  ? 'Đang đóng'
                  : 'Đang mở'}
            </Text>
          </View>
          <View style={oStyles.sensorBox}>
            <View style={s.row}>
              <Ionicons
                name={device?.latchReleased ? 'lock-open-outline' : 'lock-closed-outline'}
                size={18}
                color={device?.latchReleased ? colors.warning : colors.primary}
              />
              <Text style={oStyles.sensorLabel}>Lệnh chốt khóa</Text>
            </View>
            <Text style={oStyles.sensorValue}>
              {device?.latchReleased == null
                ? 'Chưa có dữ liệu'
                : device.latchReleased
                  ? 'Nhả chốt'
                  : 'Khóa chốt'}
            </Text>
          </View>
        </View>

        <View style={oStyles.heroFooter}>
          <Text style={[s.caption, { flex: 1 }]}>
            Trạng thái lệnh không thay thế việc kiểm tra cơ khí.
          </Text>
          <Button
            title="Cập nhật trạng thái"
            icon="refresh-outline"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              void act(reload);
            }}
          />
        </View>
      </Card>

      {needsInitialSetup ? (
        <Card style={oStyles.setupBanner}>
          <View style={s.row}>
            <View style={[oStyles.bannerIcon, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="construct-outline" size={22} color={colors.warning} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.heading}>Chưa hoàn tất thiết lập ban đầu</Text>
              <Text style={s.caption}>
                Cần hoàn tất tạo mã PIN, hiệu chỉnh cảm ứng, cảm biến cửa và góc servo.
              </Text>
            </View>
          </View>
          <Button
            title="Tiếp tục thiết lập cửa"
            icon="arrow-forward-outline"
            onPress={() => setSection('setup-wizard')}
          />
        </Card>
      ) : null}

      {device?.unitId && !isResetting ? (
        <>
          <View style={oStyles.groupHeader}>
            <Text style={oStyles.groupTitle}>Vận hành & An ninh</Text>
          </View>
          <View style={oStyles.bentoGrid}>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="bar-chart-outline"
                tone="indigo"
                title="Thống kê"
                subtitle="Biểu đồ & xuất CSV"
                onPress={() => setSection('stats')}
              />
            </View>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="timer-outline"
                tone="primary"
                title="Hẹn giờ & Quyền"
                subtitle="Tự khóa & cấp quyền"
                onPress={() => setSection('remote-config')}
              />
            </View>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="shield-half-outline"
                tone="rose"
                title="Tạm khóa"
                subtitle="Khóa khẩn cấp"
                onPress={() => setSection('lockdown')}
              />
            </View>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="finger-print-outline"
                tone="teal"
                title="Thẻ & Vân tay"
                subtitle="Phương thức chủ cửa"
                onPress={() => setSection('owner-credentials')}
              />
            </View>
          </View>

          <View style={oStyles.groupHeader}>
            <Text style={oStyles.groupTitle}>Phần cứng & Kết nối</Text>
          </View>
          <View style={oStyles.bentoGrid}>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="options-outline"
                tone="purple"
                title="Góc Servo"
                subtitle="Chỉnh chốt cơ khí"
                onPress={() => setSection('servo')}
              />
            </View>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="keypad-outline"
                tone="warning"
                title="PIN & Cảm biến"
                subtitle="Đổi PIN & hiệu chỉnh"
                onPress={() => setSection('pins-calibrate')}
              />
            </View>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="wifi-outline"
                tone="sky"
                title="Wi-Fi"
                subtitle="Đổi mạng kết nối"
                onPress={() => setSection('wifi')}
              />
            </View>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="videocam-outline"
                tone="success"
                title="Camera AI"
                subtitle="Ghép nối Laptop"
                onPress={() => setSection('camera-ai')}
              />
            </View>
          </View>
        </>
      ) : null}

      {device ? (
        <>
          <View style={oStyles.groupHeader}>
            <Text style={oStyles.groupTitle}>Hệ thống</Text>
          </View>
          <FeatureTile
            compact
            icon="refresh-circle-outline"
            tone="error"
            title="Khôi phục cài đặt gốc"
            subtitle="Đặt lại mặc định nhà sản xuất"
            onPress={() => setSection('factory-reset')}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const oStyles = StyleSheet.create({
  refreshIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: radius.hero,
    padding: 18,
    gap: 14,
    backgroundColor: colors.surface,
  },
  chipEmblem: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.text,
  },
  heroUid: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  sensorGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  sensorBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 5,
  },
  sensorLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
    flex: 1,
  },
  sensorValue: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.text,
  },
  heroFooter: {
    flexDirection: 'column',
    gap: 10,
  },
  setupBanner: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeader: {
    gap: 2,
    marginTop: 2,
  },
  groupTitle: {
    fontFamily: fonts.bold,
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
});
