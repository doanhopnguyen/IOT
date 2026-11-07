import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { useConfirm } from './ConfirmationProvider';
import { BarChart } from './BarChart';
import { rssiStrength } from './chartMath';
import { Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { colors, radius } from '../theme/tokens';
import { managerService } from '../services/api/managerService';
import { lockdownCopy } from '../utils/lockdown';
import {
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

export type DashboardSection = 'all' | 'stats' | 'remote-config' | 'lockdown';

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
  const [openLimit, setOpenLimit] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportedTiming, setReportedTiming] = useState<{
    seconds: number;
    waitForClose: boolean;
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
    setUnlock(String(st.unlockDurationSec));
    setOpenLimit(String(st.doorOpenTimeoutSec));
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
        const [duration, policy] = await Promise.all([
          statsService.telemetry(unitId, 'unlockDurationSec'),
          statsService.telemetry(unitId, 'autoLockWaitForClose'),
        ]);
        const seconds = Number(duration.at(-1)?.value);
        const wait = policy.at(-1)?.value;
        if (
          active &&
          Number.isInteger(seconds) &&
          seconds >= 1 &&
          seconds <= 30 &&
          (wait === 'true' || wait === 'false')
        ) {
          setReportedTiming({ seconds, waitForClose: wait === 'true' });
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
      setUnlock(String(st.unlockDurationSec));
      setOpenLimit(String(st.doorOpenTimeoutSec));
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
      key: 'autoLockWaitForClose',
      label: 'Chờ cánh cửa đóng trước khi khóa',
      subtitle: 'Tránh bung chốt khi cánh cửa vẫn còn đang mở',
      icon: 'shield-checkmark-outline',
      tone: colors.teal,
      bg: colors.tealSoft,
    },
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
  const showLockdown = section === 'all' || section === 'lockdown';

  const synced =
    reportedTiming &&
    settings &&
    reportedTiming.seconds === settings.unlockDurationSec &&
    reportedTiming.waitForClose === (settings.autoLockWaitForClose !== false);

  return (
    <View style={{ gap: 18 }}>
      {message ? (
        <Notice tone={failed ? 'error' : 'success'}>{message}</Notice>
      ) : null}

      {showStats ? (
        <>
          <View style={dStyles.statSummaryRow}>
            <Card style={[dStyles.statMiniCard, { backgroundColor: colors.successSoft, borderColor: '#D1FAE5' }]}>
              <View style={[dStyles.statIconCircle, { backgroundColor: '#A7F3D0' }]}>
                <Ionicons name="checkmark-done" size={20} color={colors.success} />
              </View>
              <Text style={[dStyles.statBigNumber, { color: colors.success }]}>{total.granted}</Text>
              <Text style={dStyles.statCaption}>Lượt cho phép (7 ngày)</Text>
            </Card>
            <Card style={[dStyles.statMiniCard, { backgroundColor: colors.errorSoft, borderColor: '#FEE2E2' }]}>
              <View style={[dStyles.statIconCircle, { backgroundColor: '#FECACA' }]}>
                <Ionicons name="close-circle-outline" size={20} color={colors.error} />
              </View>
              <Text style={[dStyles.statBigNumber, { color: colors.error }]}>{total.denied}</Text>
              <Text style={dStyles.statCaption}>Lượt từ chối (7 ngày)</Text>
            </Card>
          </View>

          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: colors.indigoSoft }]}>
                <Ionicons name="bar-chart-outline" size={20} color={colors.indigo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Biểu đồ ra vào 7 ngày</Text>
                <Text style={s.caption}>
                  Cho phép {total.granted} · Từ chối {total.denied}
                </Text>
              </View>
            </View>
            {days.length ? (
              <BarChart
                data={days.map((d) => ({
                  label: dayLabel(d.day),
                  values: [d.granted, d.denied],
                }))}
                colors={[colors.success, colors.error]}
                legend={['Cho phép', 'Từ chối']}
              />
            ) : (
              <Text style={s.caption}>Đang tải dữ liệu biểu đồ…</Text>
            )}
          </Card>

          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: colors.skySoft }]}>
                <Ionicons name="wifi-outline" size={20} color={colors.sky} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Sóng Wi-Fi của cửa (24 giờ)</Text>
                <Text style={s.caption}>
                  {latestRssi === undefined
                    ? 'Chưa có dữ liệu'
                    : `Hiện tại ${latestRssi} dBm · Độ mạnh ${rssiStrength(latestRssi)}%`}
                </Text>
              </View>
              {latestRssi !== undefined ? (
                <Badge
                  label={latestRssi >= -67 ? 'Tốt' : latestRssi >= -78 ? 'Trung bình' : 'Yếu'}
                  tone={latestRssi >= -67 ? 'success' : latestRssi >= -78 ? 'warning' : 'error'}
                />
              ) : null}
            </View>
            {rssi.length ? (
              <BarChart
                data={rssi.map((p) => ({
                  label: '',
                  values: [rssiStrength(Number(p.value))],
                }))}
                colors={[colors.primary]}
                max={100}
                height={68}
              />
            ) : null}
            {rssi.length ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Khung giờ: {timeLabel(rssi[0].at)} → {timeLabel(rssi[rssi.length - 1].at)}
              </Text>
            ) : null}
          </Card>

          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: colors.tealSoft }]}>
                <Ionicons name="download-outline" size={20} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Xuất báo cáo dữ liệu</Text>
                <Text style={s.caption}>
                  Lịch sử ra vào 30 ngày gần nhất, tệp CSV mở trực tiếp bằng Excel.
                </Text>
              </View>
            </View>
            <Button
              title="Tải CSV lịch sử"
              icon="document-text-outline"
              variant="ghost"
              onPress={() => {
                void Linking.openURL(statsService.csvUrl(unitId));
              }}
            />
          </Card>
        </>
      ) : null}

      {showRemote ? (
        <>
          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="timer-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Thời gian tự khóa & Cảnh báo</Text>
                <Text style={s.caption}>Đồng bộ trực tiếp xuống bộ điều khiển ESP32</Text>
              </View>
              <Badge
                label={synced ? 'Đã đồng bộ' : 'Chờ xác nhận'}
                tone={synced ? 'success' : 'warning'}
              />
            </View>

            <View style={dStyles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[s.caption, { flex: 1, color: colors.text }]}>
                {settings?.autoLockWaitForClose !== false
                  ? 'Hẹn giờ được lưu trên cửa. Nếu cánh cửa còn mở, chốt chờ cửa đóng ổn định rồi mới khóa.'
                  : 'Servo trở về góc khóa khi hết thời gian, kể cả khi cảm biến còn báo mở. App chỉ báo đã khóa khi cảm biến xác nhận đóng và servo hoàn tất lệnh.'}
              </Text>
            </View>

            <Input
              label="Tự về góc khóa sau (1–30 giây)"
              value={unlock}
              onChangeText={setUnlock}
              keyboardType="numeric"
              placeholder="5"
            />
            <Input
              label="Cảnh báo khi cửa mở quá (10–600 giây)"
              value={openLimit}
              onChangeText={setOpenLimit}
              keyboardType="numeric"
              placeholder="60"
            />
            <Button
              title="Lưu thời gian"
              icon="save-outline"
              disabled={busy || !settings}
              onPress={() => {
                void save({
                  unlockDurationSec: Number(unlock),
                  doorOpenTimeoutSec: Number(openLimit),
                });
              }}
            />
            <Text style={s.caption}>
              {synced && reportedTiming
                ? `Thiết bị đã xác nhận: ${reportedTiming.seconds} giây · ${
                    reportedTiming.waitForClose ? 'chờ cửa đóng' : 'quay về đúng hẹn'
                  }.`
                : 'Đang chờ thiết bị xác nhận thời gian và chế độ tự khóa.'}
            </Text>
          </Card>

          <Card>
            <View style={s.row}>
              <View style={[dStyles.sectionBadgeIcon, { backgroundColor: colors.purpleSoft }]}>
                <Ionicons name="toggle-outline" size={20} color={colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Phương thức & Chính sách mở cửa</Text>
                <Text style={s.caption}>Bật hoặc tắt nhanh các phương thức trên toàn cửa</Text>
              </View>
            </View>
            {settings ? (
              <View style={{ gap: 10 }}>
                {toggles.map((item) => (
                  <View key={item.key} style={dStyles.toggleRow}>
                    <View style={[dStyles.toggleIcon, { backgroundColor: item.bg }]}>
                      <Ionicons name={item.icon} size={19} color={item.tone} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={dStyles.toggleTitle}>{item.label}</Text>
                      <Text style={s.caption}>{item.subtitle}</Text>
                    </View>
                    <Switch
                      accessibilityLabel={item.label}
                      value={
                        item.key === 'autoLockWaitForClose'
                          ? settings[item.key] !== false
                          : Boolean(settings[item.key])
                      }
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
        </>
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
  statSummaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statMiniCard: {
    flex: 1,
    padding: 16,
    gap: 6,
    borderRadius: radius.card,
  },
  statIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBigNumber: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  statCaption: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  sectionBadgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
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
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
});
