import { Ionicons } from '@expo/vector-icons';
import { DoorDashboard } from './DoorDashboard';
import { DeviceHealth } from './DeviceHealth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { loadOwnerSettings, type UnitDto } from '../services/api/unitService';
import { Badge, Button, Card, FeatureTile, Notice, PageHeader, styles as s } from './ui';
import type { InventoryDevice } from './ActivationWizard';
import { FactoryReset, ResetOverview } from './FactoryReset';
import { HardwareSectionHero, isHardwareSection } from './HardwareSettingsUi';
import { colors, fonts, radius } from '../theme/tokens';
import { CameraNodeSettings } from './CameraNodeSettings';
import { DeviceSetup } from './DeviceSetup';
import { OwnerCredentials } from './OwnerCredentials';
import { deviceDisplayName } from '../services/api/productQr';
import type { SetupPage } from '../services/api/setupService';
import { lifecycleNotice, isDeviceReadOnly, recentHeartbeat } from '../services/api/deviceState';
import { FirmwareUpdates } from './FirmwareUpdates';
import { firmwareService } from '../services/api/firmwareService';

export type SettingsSection =
  | 'hub'
  | 'health'
  | 'stats'
  | 'remote-config'
  | 'access-methods'
  | 'lockdown'
  | 'owner-credentials'
  | 'door-pin'
  | 'admin-pin'
  | 'servo'
  | 'calibrate'
  | 'wifi'
  | 'camera-ai'
  | 'firmware'
  | 'factory-reset'
  | 'setup-wizard';

const sectionMeta: Record<
  Exclude<SettingsSection, 'hub'>,
  { title: string }
> = {
  health: { title: 'Tình trạng cửa' },
  stats: {
    title: 'Thống kê & Báo cáo',
  },
  'remote-config': {
    title: 'Chế độ tự khóa',
  },
  'access-methods': {
    title: 'Phương thức mở cửa',
  },
  lockdown: {
    title: 'Tạm khóa khẩn cấp',
  },
  'owner-credentials': {
    title: 'Thẻ & Vân tay chủ cửa',
  },
  'door-pin': {
    title: 'Mã PIN mở cửa',
  },
  'admin-pin': {
    title: 'Mã PIN Admin',
  },
  servo: {
    title: 'Góc mở Servo',
  },
  calibrate: {
    title: 'Hiệu chỉnh thiết bị',
  },
  wifi: {
    title: 'Wi-Fi của cửa',
  },
  'camera-ai': {
    title: 'Camera AI & Laptop',
  },
  firmware: { title: 'Cập nhật phần mềm cửa' },
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
  const [unit, setUnit] = useState<UnitDto>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);
  useEffect(() => {
    let active = true;
    const check = async () => { try { const value = await firmwareService.status(unitId); if (active) setUpdateCount(value.available.length); } catch { /* Settings remain usable while update checks are unavailable. */ } };
    void check(); const timer = setInterval(() => { void check(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [unitId]);
  const revision = useRef(0);

  const updateDevice = useCallback((next: InventoryDevice) => {
    revision.current++;
    setDevice(next);
  }, []);

  const deviceUid = device?.deviceUid;
  const reload = useCallback(async () => {
    const ticket = ++revision.current;
    const next = await loadOwnerSettings(unitId, deviceUid);
    if (ticket === revision.current) {
      setDevice(next.device);
      setUnit(next.unit);
      setMessage('');
      setFailed(false);
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
        ) {
          setDevice(undefined);
          setUnit(undefined);
        }
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

  const gridCellWidth = width >= 680 ? '20%' : '25%';
  const controllerUid = device?.deviceUid ?? unit?.deviceUid;
  const lifecycleStatus = isDeviceReadOnly(unit?.lifecycleStatus) ? unit?.lifecycleStatus
    : isDeviceReadOnly(device?.lifecycleStatus) ? device?.lifecycleStatus
    : unit?.lifecycleStatus ?? device?.lifecycleStatus;
  const lastSeenAt = device?.lastSeenAt ?? unit?.lastSeenAt ?? null;
  const sensorFresh = recentHeartbeat(lastSeenAt);
  const doorClosed = sensorFresh ? (device ? device.doorClosed : unit?.doorClosed) : null;
  const latchReleased = sensorFresh ? (device ? device.latchReleased : unit?.latchReleased) : null;
  const isResetting = device?.state === 'RESETTING';
  const needsInitialSetup =
    device && !isDeviceReadOnly(lifecycleStatus) && !isResetting && (!device.setupReady || device.state !== 'ACTIVE');

  const readOnly = (!device && !unit) || isDeviceReadOnly(lifecycleStatus);
  if (section !== 'hub' && section !== 'health' && section !== 'stats' && readOnly) {
    return <ScrollView contentContainerStyle={s.page}>
      <PageHeader back={() => setSection('hub')} title={sectionMeta[section].title} />
      {isHardwareSection(section) ? <HardwareSectionHero section={section} /> : null}
      <Notice tone="warning">{lifecycleNotice(lifecycleStatus) || 'Đang xác định trạng thái thiết bị.'} Chỉ cho phép xem thông tin.</Notice>
    </ScrollView>;
  }

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
        {isHardwareSection(section) ? <HardwareSectionHero section={section} /> : null}
        {message ? <Notice tone={failed ? 'error' : 'info'}>{message}</Notice> : null}
        {lifecycleNotice(lifecycleStatus) ? (
          <Notice tone="warning">{lifecycleNotice(lifecycleStatus)}</Notice>
        ) : null}

        {section === 'health' ? <DeviceHealth unitId={unitId} /> : null}
        {section === 'stats' ? <DoorDashboard unitId={unitId} section="stats" /> : null}
        {section === 'remote-config' ? (
          <DoorDashboard unitId={unitId} section="remote-config" />
        ) : null}
        {section === 'access-methods' ? (
          <DoorDashboard unitId={unitId} section="access-methods" />
        ) : null}
        {section === 'lockdown' ? <DoorDashboard unitId={unitId} section="lockdown" /> : null}
        {section === 'owner-credentials' ? (
          <OwnerCredentials key={unitId} unitId={unitId} ready={Boolean(device?.setupReady)} />
        ) : null}
        {section === 'door-pin' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="door-pin"
            standaloneSubView
            onInitialSetup={() => setSection('setup-wizard')}
            onStepChange={setupChanged}
          />
        ) : null}
        {section === 'admin-pin' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="admin-pin"
            standaloneSubView
            onInitialSetup={() => setSection('setup-wizard')}
            onStepChange={setupChanged}
          />
        ) : null}
        {section === 'servo' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="servo"
            standaloneSubView
            onStepChange={setupChanged}
          />
        ) : null}
        {section === 'calibrate' ? (
          <DeviceSetup
            unitId={unitId}
            initialView="calibrate"
            standaloneSubView
            onInitialSetup={() => setSection('setup-wizard')}
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
        {section === 'firmware' ? <FirmwareUpdates unitId={unitId} /> : null}
        {section === 'setup-wizard' ? (
          <DeviceSetup unitId={unitId} onStepChange={setupChanged} onComplete={() => setSection('hub')} />
        ) : null}
        {section === 'factory-reset' ? <ResetOverview /> : null}
        {section === 'factory-reset' && device ? (
          <FactoryReset key={device.deviceUid} device={device} onUpdated={updateDevice} />
        ) : null}
        {section === 'factory-reset' && !device ? <Notice tone="info">Chưa có hồ sơ cấp phát của thiết bị này nên chưa thể khôi phục cài đặt gốc. Liên hệ quản trị viên để kiểm tra thiết bị.</Notice> : null}
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
      {updateCount > 0 ? <Button title={`Có ${updateCount} bản cập nhật cho cửa`} icon="cloud-download-outline" variant="ghost" onPress={() => setSection('firmware')} /> : null}
      {lifecycleNotice(lifecycleStatus) ? (
        <Notice tone="warning">{lifecycleNotice(lifecycleStatus)}</Notice>
      ) : null}

      <Card style={oStyles.heroCard}>
        <View style={s.row}>
          <View style={oStyles.chipEmblem}>
            <Ionicons name="hardware-chip-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={oStyles.heroTitle}>Thông tin thiết bị</Text>
            <Text selectable style={oStyles.heroUid}>
              {(controllerUid ? deviceDisplayName(controllerUid, device?.name ?? unit?.unitName) : undefined) ??
                (loading ? 'Đang tải thiết bị…' : 'Chưa tìm thấy thiết bị của cửa.')}
            </Text>
            {device || unit ? (
              <Badge
                label={
                  lifecycleStatus === 'SUSPENDED'
                    ? 'Bị tạm ngưng'
                    : lifecycleStatus === 'MAINTENANCE'
                      ? 'Đang bảo trì'
                      : lifecycleStatus === 'DECOMMISSIONED'
                        ? 'Đã thu hồi'
                        : device?.state === 'ACTIVE' && device.setupReady
                          ? 'Đã sẵn sàng'
                          : device?.state === 'RESETTING'
                            ? 'Đang reset'
                            : device?.state === 'CLAIMED'
                              ? 'Đang thiết lập'
                              : device ? 'Trong danh mục' : 'Chưa xác nhận thiết lập'
                }
                tone={
                  device?.state === 'ACTIVE' &&
                  device.setupReady &&
                  lifecycleStatus === 'ACTIVE'
                    ? 'success'
                    : 'warning'
                }
              />
            ) : null}
          </View>
        </View>

        <View style={oStyles.sensorGrid}>
          <View style={oStyles.sensorBox}>
            <View style={s.row}>
              <Ionicons
                name={doorClosed === true ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                size={18}
                color={doorClosed === true ? colors.success : colors.warning}
              />
              <Text style={oStyles.sensorLabel}>Cảm biến cánh cửa</Text>
            </View>
            <Text style={oStyles.sensorValue}>
              {doorClosed == null
                ? 'Chưa có dữ liệu'
                : doorClosed
                  ? 'Đang đóng'
                  : 'Đang mở'}
            </Text>
          </View>
          <View style={oStyles.sensorBox}>
            <View style={s.row}>
              <Ionicons
                name={latchReleased === true ? 'lock-open-outline' : 'lock-closed-outline'}
                size={18}
                color={latchReleased === true ? colors.warning : colors.primary}
              />
              <Text style={oStyles.sensorLabel}>Lệnh chốt khóa</Text>
            </View>
            <Text style={oStyles.sensorValue}>
              {latchReleased == null
                ? 'Chưa có dữ liệu'
                : latchReleased
                  ? 'Nhả chốt'
                  : 'Khóa chốt'}
            </Text>
          </View>
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
                Cần hoàn tất tạo mã PIN, hiệu chỉnh cảm ứng và xác nhận cảm biến cửa đóng/mở.
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

      {controllerUid && !isResetting && !readOnly ? (
        <>
          <View style={oStyles.groupHeader}>
            <Text style={oStyles.groupTitle}>Vận hành & An ninh</Text>
          </View>
          <Card style={oStyles.iconGroupCard}>
            <View style={oStyles.bentoGrid}>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile icon="cloud-download-outline" tone="indigo" title="Cập nhật" badge={updateCount ? String(updateCount) : undefined} onPress={() => setSection('firmware')} />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="bar-chart-outline"
                  tone="indigo"
                  title="Thống kê"
                  onPress={() => setSection('stats')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="timer-outline"
                  tone="teal"
                  title="Tự khóa"
                  onPress={() => setSection('remote-config')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="toggle-outline"
                  title="Phương thức"
                  onPress={() => setSection('access-methods')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="finger-print-outline"
                  tone="purple"
                  title="Thẻ & Vân tay"
                  onPress={() => setSection('owner-credentials')}
                />
              </View>
            </View>
          </Card>

          <View style={oStyles.groupHeader}>
            <Text style={oStyles.groupTitle}>Phần cứng & Hệ thống</Text>
          </View>
          <Card style={oStyles.iconGroupCard}>
            <View style={oStyles.bentoGrid}>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="keypad-outline"
                  title="PIN mở cửa"
                  onPress={() => setSection('door-pin')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="key-outline"
                  tone="indigo"
                  title="PIN Admin"
                  onPress={() => setSection('admin-pin')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="options-outline"
                  tone="sky"
                  title="Góc Servo"
                  onPress={() => setSection('servo')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="locate-outline"
                  tone="purple"
                  title="Hiệu chỉnh"
                  onPress={() => setSection('calibrate')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="wifi-outline"
                  tone="teal"
                  title="Wi-Fi"
                  onPress={() => setSection('wifi')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="videocam-outline"
                  tone="indigo"
                  title="Camera AI"
                  onPress={() => setSection('camera-ai')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="shield-half-outline"
                  tone="rose"
                  title="Tạm khóa"
                  onPress={() => setSection('lockdown')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile
                  icon="refresh-circle-outline"
                  tone="error"
                  title="Khôi phục gốc"
                  onPress={() => setSection('factory-reset')}
                />
              </View>
              <View style={{ width: gridCellWidth }}>
                <FeatureTile icon="pulse-outline" tone="teal" title="Tình trạng cửa" titleLines={3} onPress={() => setSection('health')} />
              </View>
            </View>
          </Card>
        </>
      ) : <>
        <View style={oStyles.groupHeader}><Text style={oStyles.groupTitle}>Phần cứng & Hệ thống</Text></View>
        <Card style={oStyles.iconGroupCard}>
          <View style={oStyles.bentoGrid}>
            <View style={{ width: gridCellWidth }}>
              <FeatureTile
                icon="pulse-outline"
                tone="teal"
                title="Tình trạng cửa"
                titleLines={3}
                onPress={() => setSection('health')}
              />
            </View>
            {device && !readOnly ? <View style={{ width: gridCellWidth }}>
              <FeatureTile icon="refresh-circle-outline" tone="error" title="Khôi phục cài đặt gốc" onPress={() => setSection('factory-reset')} />
            </View> : null}
          </View>
        </Card>
      </>}
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
  iconGroupCard: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radius.card,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
});
