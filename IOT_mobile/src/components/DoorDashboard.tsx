import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useConfirm } from './ConfirmationProvider';
import { BarChart } from './BarChart';
import { rssiStrength } from './chartMath';
import { Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { colors, fonts, radius } from '../theme/tokens';
import { managerService } from '../services/api/managerService';
import { lockdownCopy } from '../utils/lockdown';
import {
  autoLockSettings,
  DailyAccessDto,
  statsService,
  TelemetryPointDto,
  UnitSettingsDto,
  validateSettings,
} from '../services/api/statsService';

const dayLabel = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export type DashboardSection = 'all' | 'stats' | 'remote-config' | 'access-methods' | 'lockdown';

/** Thống kê + cài đặt cửa cho chủ cửa (hỗ trợ hiển thị từng trang chi tiết riêng biệt). */
export function DoorDashboard({
  unitId,
  section = 'all',
}: {
  unitId: number;
  section?: DashboardSection;
}) {
  const confirm = useConfirm();
  const [days, setDays] = useState<DailyAccessDto[]>([]);
  const [rssi, setRssi] = useState<TelemetryPointDto[]>([]);
  const [settings, setSettings] = useState<UnitSettingsDto>();
  const [unlock, setUnlock] = useState('');
  const [waitForClose, setWaitForClose] = useState(true);
  const [openLimit, setOpenLimit] = useState('');
  const [pinLimit, setPinLimit] = useState('5');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportedTiming, setReportedTiming] = useState<{
    seconds: number;
    waitForClose: boolean;
    openLimit: number;
    pinLimit: number;
  }>();
  const [lockedDown, setLockedDown] = useState<boolean>();

  const load = useCallback(async () => {
    const [d, r, st, ld] = await Promise.all([
      statsService.dailyAccess(unitId, 7),
      statsService.telemetry(unitId, 'rssi'),
      statsService.settings(unitId),
      managerService.lockdownStatus(unitId),
    ]);
    setDays(d);
    setRssi(r.slice(-24));
    setSettings(st);
    setWaitForClose(st.autoLockWaitForClose !== false);
    setUnlock(String(st.unlockDurationSec));
    setOpenLimit(String(st.doorOpenTimeoutSec));
    setPinLimit(String(st.pinFailureLimit ?? 5));
    setLockedDown(ld.lockedDown);
  }, [unitId]);

  useEffect(() => {
    void load().catch((e) => {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : 'Không tải được dữ liệu cài đặt.');
    });
  }, [load]);

  useEffect(() => {
    if (section !== 'all' && section !== 'remote-config') return;
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const [duration, policy, doorLimit, pinFailures] = await Promise.all([
          statsService.telemetry(unitId, 'unlockDurationSec'),
          statsService.telemetry(unitId, 'autoLockWaitForClose'),
          statsService.telemetry(unitId, 'doorOpenTimeoutSec'),
          statsService.telemetry(unitId, 'pinFailureLimit'),
        ]);
        const seconds = Number(duration.at(-1)?.value);
        const wait = policy.at(-1)?.value;
        const doorTimeout = Number(doorLimit.at(-1)?.value), pinThreshold = Number(pinFailures.at(-1)?.value);
        if (
          active &&
          Number.isInteger(seconds) &&
          seconds >= 1 &&
          seconds <= 30 &&
          (wait === 'true' || wait === 'false') &&
          Number.isInteger(doorTimeout) && doorTimeout >= 10 && doorTimeout <= 600 &&
          Number.isInteger(pinThreshold) && pinThreshold >= 1 && pinThreshold <= 10
        ) {
          setReportedTiming({ seconds, waitForClose: wait === 'true', openLimit: doorTimeout, pinLimit: pinThreshold });
        }
      } catch {
        /* Keep requested settings distinct from an unavailable device confirmation. */
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [unitId, section]);

  const save = async (patch: Partial<UnitSettingsDto>) => {
    const invalid = validateSettings(patch);
    if (invalid) {
      setFailed(true);
      setMessage(invalid);
      return;
    }
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const st = await statsService.updateSettings(unitId, patch);
      setSettings(st);
      setWaitForClose(st.autoLockWaitForClose !== false);
      setUnlock(String(st.unlockDurationSec));
      setOpenLimit(String(st.doorOpenTimeoutSec));
      setPinLimit(String(st.pinFailureLimit ?? 5));
      setMessage('Đã lưu yêu cầu trên máy chủ. Theo dõi xác nhận từ thiết bị bên dưới.');
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : 'Không lưu được cài đặt.');
    } finally {
      setBusy(false);
    }
  };

  const total = days.reduce(
    (a, d) => ({ granted: a.granted + d.granted, denied: a.denied + d.denied }),
    { granted: 0, denied: 0 },
  );

  const toggleLockdown = async (next: boolean) => {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await managerService.waitForCommand(
        await (next
          ? managerService.startLockdown(unitId)
          : managerService.endLockdown(unitId)),
      );
      if (result.status !== 'ACKNOWLEDGED') {
        setFailed(true);
        setMessage(result.resultMessage || 'Cửa chưa xác nhận lệnh. Vui lòng thử lại.');
      } else {
        setMessage(
          next
            ? 'Đã kích hoạt chế độ tạm khóa khẩn cấp trên cửa.'
            : 'Đã tắt chế độ tạm khóa. Các thành viên có thể ra vào bình thường.',
        );
      }
      setLockedDown((await managerService.lockdownStatus(unitId)).lockedDown);
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : 'Không gửi được lệnh tạm khóa.');
    } finally {
      setBusy(false);
    }
  };

  const lockdown = lockdownCopy(lockedDown === true);
  const latestRssi = rssi.length ? Number(rssi[rssi.length - 1].value) : undefined;
  const toggles: {
    key: keyof UnitSettingsDto;
    label: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone: string;
    bg: string;
  }[] = [
    {
      key: 'remoteUnlockEnabled',
      label: 'Cho phép mở cửa từ xa',
      subtitle: 'Mở/khóa qua ứng dụng di động khi cửa trực tuyến',
      icon: 'phone-portrait-outline',
      tone: colors.primary,
      bg: colors.primarySoft,
    },
    {
      key: 'rfidEnabled',
      label: 'Cho phép thẻ từ NFC / RFID',
      subtitle: 'Quẹt thẻ đã đăng ký trên đầu đọc tại cửa',
      icon: 'card-outline',
      tone: colors.indigo,
      bg: colors.indigoSoft,
    },
    {
      key: 'fingerprintEnabled',
      label: 'Cho phép cảm biến vân tay',
      subtitle: 'Xác thực sinh trắc học vân tay trực tiếp trên khóa',
      icon: 'finger-print-outline',
      tone: colors.purple,
      bg: colors.purpleSoft,
    },
  ];

  const showStats = section === 'all' || section === 'stats';
  const showRemote = section === 'all' || section === 'remote-config';
  const showAccessMethods = section === 'all' || section === 'access-methods';
  const showLockdown = section === 'all' || section === 'lockdown';

  const timingChanged = settings && (
    waitForClose !== (settings.autoLockWaitForClose !== false) ||
    (!waitForClose && Number(unlock) !== settings.unlockDurationSec) ||
    Number(openLimit) !== settings.doorOpenTimeoutSec ||
    Number(pinLimit) !== (settings.pinFailureLimit ?? 5)
  );

  const synced =
    reportedTiming &&
    settings &&
    (settings.autoLockWaitForClose !== false || reportedTiming.seconds === settings.unlockDurationSec) &&
    reportedTiming.waitForClose === (settings.autoLockWaitForClose !== false) &&
    reportedTiming.openLimit === settings.doorOpenTimeoutSec &&
    reportedTiming.pinLimit === (settings.pinFailureLimit ?? 5);

  return (
    <View style={{ gap: 16 }}>
      {message ? (
        <Notice tone={failed ? 'error' : 'success'}>{message}</Notice>
      ) : null}

      {showStats ? (
        <>
          <View style={dStyles.statSummaryRow}>
            <Card style={dStyles.statMiniCard}>
              <View style={s.row}>
                <View style={[dStyles.statIconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="checkmark-done" size={18} color={colors.success} />
                </View>
                <Text style={dStyles.statBigNumber}>{total.granted}</Text>
              </View>
              <Text style={dStyles.statCaption}>Cho phép (7 ngày)</Text>
            </Card>
            <Card style={dStyles.statMiniCard}>
              <View style={s.row}>
                <View style={[dStyles.statIconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                </View>
                <Text style={dStyles.statBigNumber}>{total.denied}</Text>
              </View>
              <Text style={dStyles.statCaption}>Từ chối (7 ngày)</Text>
            </Card>
          </View>

          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="bar-chart-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Biểu đồ 7 ngày</Text>
                <Text style={s.caption}>
                  Tổng {total.granted + total.denied} lượt kiểm tra
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void Linking.openURL(statsService.csvUrl(unitId));
                }}
                accessibilityRole="button"
                accessibilityLabel="Tải CSV lịch sử"
                style={dStyles.csvChip}
              >
                <Ionicons name="download-outline" size={15} color={colors.primary} />
                <Text style={dStyles.csvChipText}>Xuất CSV</Text>
              </Pressable>
            </View>
            {days.length ? (
              <BarChart
                data={days.map((d) => ({
                  label: dayLabel(d.day),
                  values: [d.granted, d.denied],
                }))}
                colors={[colors.primary, '#94A3B8']}
                legend={['Cho phép', 'Từ chối']}
              />
            ) : (
              <Text style={s.caption}>Đang tải dữ liệu biểu đồ…</Text>
            )}
          </Card>

          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="wifi-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Tín hiệu Wi-Fi (24h)</Text>
                <Text style={s.caption}>
                  {latestRssi === undefined
                    ? 'Chưa có dữ liệu'
                    : `${latestRssi} dBm · Độ mạnh ${rssiStrength(latestRssi)}%`}
                </Text>
              </View>
              {latestRssi !== undefined ? (
                <Badge
                  label={latestRssi >= -67 ? 'Tốt' : latestRssi >= -78 ? 'Khá' : 'Yếu'}
                  tone={latestRssi >= -67 ? 'success' : latestRssi >= -78 ? 'warning' : 'error'}
                />
              ) : null}
            </View>
            {latestRssi !== undefined ? (
              <View style={dStyles.signalTrack}>
                <View
                  style={[
                    dStyles.signalFill,
                    { width: `${Math.max(8, rssiStrength(latestRssi))}%` },
                  ]}
                />
              </View>
            ) : null}
            {rssi.length ? (
              <BarChart
                data={rssi.map((p) => ({
                  label: '',
                  values: [rssiStrength(Number(p.value))],
                }))}
                colors={[colors.primary]}
                max={100}
                height={56}
              />
            ) : null}
            {rssi.length ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Khung giờ: {timeLabel(rssi[0].at)} → {timeLabel(rssi[rssi.length - 1].at)}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {showRemote ? (
        <Card>
          <View style={s.row}>
            <View style={[dStyles.sectionBadgeIcon, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="timer-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>Chế độ tự khóa & Cảnh báo</Text>
              <Text style={s.caption}>Đồng bộ trực tiếp xuống bộ điều khiển</Text>
            </View>
            <Badge
              label={timingChanged ? 'Chưa lưu' : synced ? 'Đã đồng bộ' : 'Chờ xác nhận'}
              tone={!timingChanged && synced ? 'success' : 'warning'}
            />
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel="Chế độ tự khóa" style={{ gap: 10 }}>
            {[
              { wait: false, title: 'Tự quay về góc khóa', description: 'Servo tự về góc khóa sau số giây đã chọn, kể cả khi cánh cửa còn mở.' },
              { wait: true, title: 'Chờ cửa đóng rồi khóa', description: 'Chờ cảm biến xác nhận cửa đã đóng trước khi servo về góc khóa.' },
            ].map((mode) => (
              <Pressable
                key={String(mode.wait)}
                accessibilityRole="radio"
                aria-checked={waitForClose === mode.wait}
                accessibilityLabel={mode.title}
                accessibilityState={{ checked: waitForClose === mode.wait, disabled: busy || !settings }}
                disabled={busy || !settings}
                onPress={() => setWaitForClose(mode.wait)}
                style={[dStyles.lockMode, waitForClose === mode.wait && dStyles.lockModeSelected]}
              >
                <Ionicons name={waitForClose === mode.wait ? 'radio-button-on' : 'radio-button-off'} size={22} color={waitForClose === mode.wait ? colors.primary : colors.muted} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={dStyles.toggleTitle}>{mode.title}</Text>
                  <Text style={s.caption}>{mode.description}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          {!waitForClose ? (
            <Input
              label="Tự về góc khóa sau (1–30 giây)"
              value={unlock}
              onChangeText={setUnlock}
              keyboardType="numeric"
              placeholder="5"
            />
          ) : null}
          <Input
            label="Cảnh báo khi cửa mở quá (10–600 giây)"
            value={openLimit}
            onChangeText={setOpenLimit}
            keyboardType="numeric"
            placeholder="60"
          />
          <Input
            label="Cảnh báo và khóa PIN sau số lần sai (1–10 lần)"
            value={pinLimit}
            onChangeText={setPinLimit}
            keyboardType="numeric"
            placeholder="5"
          />
          <Text style={s.caption}>Còi kêu khi sai PIN chạm ngưỡng; khóa nhập 30 giây. Cửa mở quá thời gian sẽ phát tiếng nhắc đến khi đóng cửa.</Text>
          <Button
            title="Lưu cài đặt"
            icon="save-outline"
            disabled={busy || !settings}
            onPress={() => {
              void save({
                ...autoLockSettings(waitForClose, unlock),
                doorOpenTimeoutSec: Number(openLimit),
                pinFailureLimit: Number(pinLimit),
              });
            }}
          />
          <Text style={s.caption}>
            {synced && reportedTiming
              ? `Đã xác nhận trên cửa: ${reportedTiming.waitForClose ? 'chờ cảm biến cửa đóng rồi khóa' : `tự quay về góc khóa sau ${reportedTiming.seconds}s`}, cảnh báo mở cửa ${reportedTiming.openLimit}s, sai PIN ${reportedTiming.pinLimit} lần.`
              : 'Đang chờ cửa xác nhận chế độ khóa và ngưỡng cảnh báo. Cửa cần firmware từ 1.14.0 hoặc demo 2.0.1.'}
          </Text>
        </Card>
      ) : null}

      {showAccessMethods ? (
        <Card>
          <View style={s.row}>
            <View style={[dStyles.sectionBadgeIcon, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="options-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>Phương thức mở cửa</Text>
              <Text style={s.caption}>Bật hoặc tắt các phương thức trên toàn cửa</Text>
            </View>
          </View>
          {settings ? (
            <View style={{ marginTop: 4 }}>
              {toggles.map((item, idx) => (
                <View
                  key={item.key}
                  style={[
                    dStyles.toggleRow,
                    idx === toggles.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={[dStyles.toggleIcon, { backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={dStyles.toggleTitle}>{item.label}</Text>
                    <Text style={s.caption}>{item.subtitle}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={item.label}
                    value={Boolean(settings[item.key])}
                    disabled={busy}
                    trackColor={{ true: colors.primary, false: colors.borderStrong }}
                    thumbColor="#fff"
                    onValueChange={(value) => {
                      void save({ [item.key]: value });
                    }}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.caption}>Đang tải cấu hình phương thức…</Text>
          )}
        </Card>
      ) : null}

      {showLockdown ? (
        <Card
          style={[
            lockedDown && {
              borderColor: '#FCA5A5',
              backgroundColor: '#FFFBFB',
            },
          ]}
        >
          <View style={s.row}>
            <View
              style={[
                dStyles.sectionBadgeIcon,
                { backgroundColor: lockedDown ? colors.errorSoft : colors.roseSoft },
              ]}
            >
              <Ionicons
                name={lockedDown ? 'lock-closed' : 'shield-half-outline'}
                size={22}
                color={lockedDown ? colors.error : colors.rose}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.heading}>Tạm khóa cửa (Lockdown)</Text>
              <Text
                style={{
                  color: lockedDown ? colors.error : colors.muted,
                  fontWeight: '700',
                  fontSize: 14,
                }}
              >
                {lockedDown === undefined ? 'Đang tải...' : lockdown.title}
              </Text>
              <View style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                <Badge
                  label={lockedDown ? 'Đang khóa khẩn cấp' : 'Hoạt động bình thường'}
                  tone={lockedDown ? 'error' : 'success'}
                />
              </View>
            </View>
          </View>
          <View style={dStyles.infoBox}>
            <Ionicons name="shield-outline" size={18} color={colors.rose} />
            <Text style={[s.caption, { flex: 1, color: colors.text }]}>
              Khi tạm khóa, toàn bộ quyền mở cửa của thành viên bị tạm dừng. Chỉ vân tay, thẻ của
              bạn (chủ cửa) và lệnh mở từ app của bạn còn mở được cửa. Chế độ này không tự hết hạn.
            </Text>
          </View>
          <Button
            title={lockdown.button}
            icon={lockedDown ? 'lock-open-outline' : 'lock-closed-outline'}
            variant={lockedDown ? 'primary' : 'danger'}
            disabled={busy || lockedDown === undefined}
            onPress={() => {
              void confirm({
                title: lockdown.button,
                message: lockdown.confirm,
                confirmLabel: lockdown.button,
                destructive: !lockedDown,
              }).then((ok) => {
                if (ok) void toggleLockdown(!lockedDown);
              });
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}

const dStyles = StyleSheet.create({
  lockMode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockModeSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  statSummaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statMiniCard: {
    flex: 1,
    padding: 15,
    gap: 8,
    borderRadius: radius.card,
  },
  statIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBigNumber: {
    fontFamily: fonts.bold,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  statCaption: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.muted,
  },
  csvChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  csvChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  signalTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  signalFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  sectionBadgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.slateSoft,
    alignItems: 'flex-start',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  toggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
  },
});
