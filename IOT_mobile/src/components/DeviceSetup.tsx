import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  setupInstruction,
  setupPage,
  setupService,
  validateSetupPins,
  validateSinglePin,
  type SetupPage,
  type SetupStatus,
} from '../services/api/setupService';
import { managerService, type CommandDto } from '../services/api/managerService';
import { openSetupPortal, openWifiSettings } from '../services/setupWifi';
import { Badge, Button, Card, FeatureTile, Input, Notice, styles as s } from './ui';
import { ServoSettings } from './ServoSettings';
import { SetupProgress } from './SetupProgress';
import { LaptopAiSetup } from './LaptopAiSetup';
import { colors } from '../theme/tokens';

async function acknowledged(command: CommandDto) {
  const result = await managerService.waitForCommand(command);
  if (result.status === 'FAILED' && result.resultMessage?.includes('STORAGE'))
    throw new Error(
      'Cửa chưa lưu được cấu hình. Nếu vừa lưu Wi-Fi lần đầu, nhấn/thả RST/EN hoặc rút nguồn 5 giây rồi cấp lại; chờ cửa online và thử lưu PIN lại. Không khôi phục mặc định.',
    );
  if (result.status === 'FAILED' && result.resultMessage?.startsWith('DEVICE_BUSY'))
    throw new Error('Cửa đang bận. Hoàn tất thao tác trên màn hình cửa rồi thử lại.');
  if (result.status !== 'ACKNOWLEDGED')
    throw new Error('Chưa nhận xác nhận từ cửa. Kiểm tra kết nối; app sẽ tiếp tục khi cửa phản hồi.');
}

const pages: Record<SetupPage, { title: string; position: number }> = {
  PINS: { title: 'Tạo hai mã PIN', position: 1 },
  TOUCH: { title: 'Hiệu chỉnh cảm ứng', position: 2 },
  DOOR_CLOSED: { title: 'Xác nhận cánh cửa đóng', position: 3 },
  DOOR_OPEN: { title: 'Xác nhận cánh cửa mở', position: 4 },
  VERIFY: { title: 'Chờ cửa hoàn tất', position: 4 },
  COMPLETE: { title: 'Cửa đã sẵn sàng', position: 4 },
};

export type SetupSubView = 'home' | 'door-pin' | 'admin-pin' | 'calibrate' | 'pins' | 'servo' | 'wifi';

interface Props {
  unitId: number;
  onComplete?: () => void;
  onStepChange?: (page: SetupPage) => void;
  stepOffset?: number;
  initialView?: SetupSubView;
  standaloneSubView?: boolean;
}

export function DeviceSetup(props: Props) {
  return <DeviceSetupFlow key={`${props.unitId}:${props.initialView ?? 'home'}`} {...props} />;
}

function DeviceSetupFlow({
  unitId,
  onComplete,
  onStepChange,
  stepOffset = 0,
  initialView = 'home',
  standaloneSubView = false,
}: Props) {
  const [status, setStatus] = useState<SetupStatus>();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pinsAcknowledged, setPinsAcknowledged] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [view, setView] = useState<SetupSubView>(initialView);

  const reload = useCallback(async () => {
    const next = await setupService.status(unitId);
    setStatus(next);
    setLoadError('');
    if (!next.ready) setRestarting(false);
  }, [unitId]);

  useEffect(() => {
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const next = await setupService.status(unitId);
        if (active) {
          setStatus(next);
          setLoadError('');
          if (!next.ready) setRestarting(false);
        }
      } catch (e) {
        if (active)
          setLoadError(e instanceof Error ? e.message : 'Chưa nhận được trạng thái cửa.');
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [unitId]);

  const effective =
    status && restarting && status.ready
      ? { ...status, ready: false, touchCalibrated: false, stage: 'TOUCH_1' }
      : status;
  const page = effective ? setupPage(effective, pinsAcknowledged) : undefined;
  useEffect(() => {
    if (page) onStepChange?.(page);
  }, [page, onStepChange]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thực hiện được.');
    } finally {
      setBusy(false);
    }
  };

  const clearPins = () => {
    setPin('');
    setConfirmPin('');
    setAdminPin('');
    setConfirmAdminPin('');
  };
  const pins = { pin, confirmPin, adminPin, confirmAdminPin };
  const pinForm = (
    <>
      <Text style={s.description}>
        Dùng PIN mở cửa hằng ngày. PIN quản trị dành cho quản lý trực tiếp tại cửa; hai mã phải
        khác nhau.
      </Text>
      <Input
        label="PIN mở cửa · 6 số"
        value={pin}
        onChangeText={setPin}
        secureTextEntry
        keyboardType="numeric"
        maxLength={6}
        editable={!busy}
        placeholder="••••••"
      />
      <Input
        label="Nhập lại PIN mở cửa"
        value={confirmPin}
        onChangeText={setConfirmPin}
        secureTextEntry
        keyboardType="numeric"
        maxLength={6}
        editable={!busy}
        placeholder="••••••"
      />
      <Input
        label="PIN quản trị · 6 số khác PIN mở cửa"
        value={adminPin}
        onChangeText={setAdminPin}
        secureTextEntry
        keyboardType="numeric"
        maxLength={6}
        editable={!busy}
        placeholder="••••••"
      />
      <Input
        label="Nhập lại PIN quản trị"
        value={confirmAdminPin}
        onChangeText={setConfirmAdminPin}
        secureTextEntry
        keyboardType="numeric"
        maxLength={6}
        editable={!busy}
        placeholder="••••••"
      />
      <Button
        title={
          busy
            ? 'Đang chờ cửa xác nhận…'
            : view === 'pins'
              ? 'Lưu hai PIN'
              : 'Lưu PIN và tiếp tục'
        }
        icon="checkmark-circle-outline"
        disabled={busy || !status?.online || Boolean(validateSetupPins(pins))}
        onPress={() => {
          void act(async () => {
            await acknowledged(await setupService.credentials(unitId, pins));
            clearPins();
            if (view === 'pins') {
              if (!standaloneSubView) setView('home');
              setMessage('Đã cập nhật hai mã PIN thành công.');
            } else {
              setPinsAcknowledged(true);
            }
            await reload();
          });
        }}
      />
    </>
  );

  if (!effective || !page)
    return (
      <Card>
        <Text style={s.heading}>Đang lấy tiến độ thiết lập…</Text>
        {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      </Card>
    );

  const feedback = (
    <>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loadError ? <Notice tone="warning">{loadError}</Notice> : null}
    </>
  );

  if (page !== 'COMPLETE')
    return (
      <Card>
        <SetupProgress
          step={pages[page].position + stepOffset}
          total={4 + stepOffset}
          title={pages[page].title}
        />
        {!effective.online ? (
          <Notice tone="warning">
            Cửa đang mất kết nối. Giữ nguồn ổn định; tiếp tục theo màn hình cửa, app sẽ tự cập nhật
            khi kết nối lại.
          </Notice>
        ) : null}
        {page === 'PINS' ? (
          <>
            <Notice tone="info">
              Sau khi trang Wi-Fi báo Đã lưu, hãy khởi động lại cửa một lần trước lần lưu PIN đầu
              tiên: nhấn/thả RST/EN hoặc rút nguồn 5 giây rồi cấp lại. Chờ cửa online. Không khôi
              phục mặc định.
            </Notice>
            {pinForm}
          </>
        ) : (
          <>
            <Text style={s.description}>
              {page === 'VERIFY'
                ? 'Các bước đã được xác nhận. Đang chờ cửa báo sẵn sàng…'
                : setupInstruction({
                    ...effective,
                    online: true,
                    doorPinSet: true,
                    adminPinSet: true,
                  })}
            </Text>
            <View
              style={{
                padding: 18,
                borderRadius: 18,
                backgroundColor: colors.primarySoft,
                gap: 8,
              }}
            >
              <Text style={s.heading}>
                {page === 'TOUCH'
                  ? `Điểm ${effective.stage.startsWith('TOUCH_') ? effective.stage.slice(6) : '1'} / 4`
                  : page === 'DOOR_CLOSED'
                    ? 'Đóng cánh cửa'
                    : page === 'DOOR_OPEN'
                      ? 'Mở cánh cửa'
                      : 'Đang xác nhận'}
              </Text>
              <Text style={s.description}>
                Thực hiện trên màn hình thiết bị. App tự chuyển sang bước tiếp theo khi cửa xác
                nhận.
              </Text>
            </View>
          </>
        )}
        <Button
          title="Kiểm tra tiến độ"
          variant="ghost"
          icon="refresh-outline"
          disabled={busy}
          onPress={() => {
            void act(reload);
          }}
        />
        {feedback}
      </Card>
    );

  if (onComplete)
    return (
      <Card>
        <Badge label="Hoàn tất" tone="success" />
        <Text style={s.heading}>Cửa đã sẵn sàng</Text>
        <Text style={s.description}>
          Đã lưu PIN và xác nhận cảm ứng, cảm biến cửa. Bạn có thể thêm thẻ, vân tay và thành viên.
          Góc servo có thể chỉnh riêng trong Cài đặt cửa khi cần.
        </Text>
        <LaptopAiSetup unitId={unitId} />
        <Button title="Về danh sách cửa" icon="checkmark-circle-outline" onPress={onComplete} />
        {feedback}
      </Card>
    );

  if (view === 'servo')
    return (
      <>
        {!standaloneSubView ? (
          <Button
            title="Quay lại thiết lập cửa"
            variant="ghost"
            icon="arrow-back-outline"
            onPress={() => setView('home')}
          />
        ) : null}
        <ServoSettings key={unitId} unitId={unitId} online={effective.online} />
      </>
    );

  if (view === 'door-pin')
    return (
      <Card>
        <View style={s.row}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              backgroundColor: colors.warningSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="keypad-outline" size={21} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>Mã PIN mở cửa</Text>
            <Text style={s.caption}>Mã 6 chữ số mở cửa hằng ngày</Text>
          </View>
          <Badge
            label={effective.doorPinSet ? 'Đã đặt' : 'Chưa đặt'}
            tone={effective.doorPinSet ? 'success' : 'warning'}
          />
        </View>
        <Text style={s.description}>
          Dùng để mở cửa trực tiếp trên bàn phím cảm ứng của khóa. Mã phải gồm đúng 6 chữ số và khác
          PIN Admin.
        </Text>
        <Input
          label="PIN mở cửa mới · 6 số"
          value={pin}
          onChangeText={setPin}
          secureTextEntry
          keyboardType="numeric"
          maxLength={6}
          editable={!busy}
          placeholder="••••••"
        />
        <Input
          label="Nhập lại PIN mở cửa"
          value={confirmPin}
          onChangeText={setConfirmPin}
          secureTextEntry
          keyboardType="numeric"
          maxLength={6}
          editable={!busy}
          placeholder="••••••"
        />
        <Button
          title={busy ? 'Đang chờ cửa xác nhận…' : 'Lưu mã PIN mở cửa'}
          icon="checkmark-circle-outline"
          disabled={busy || !effective.online || Boolean(validateSinglePin(pin, confirmPin))}
          onPress={() => {
            void act(async () => {
              await acknowledged(await setupService.doorPin(unitId, { pin, confirmPin }));
              clearPins();
              if (!standaloneSubView) setView('home');
              setMessage('Đã cập nhật mã PIN mở cửa thành công.');
              await reload();
            });
          }}
        />
        {!standaloneSubView ? (
          <Button
            title="Quay lại"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              clearPins();
              setView('home');
            }}
          />
        ) : null}
        {feedback}
      </Card>
    );

  if (view === 'admin-pin')
    return (
      <Card>
        <View style={s.row}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              backgroundColor: colors.roseSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="key-outline" size={21} color={colors.rose} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>Mã PIN Admin</Text>
            <Text style={s.caption}>Mã 6 chữ số quản trị trực tiếp trên khóa</Text>
          </View>
          <Badge
            label={effective.adminPinSet ? 'Đã đặt' : 'Chưa đặt'}
            tone={effective.adminPinSet ? 'success' : 'warning'}
          />
        </View>
        <Text style={s.description}>
          Dùng để mở menu quản trị trên màn hình khóa, xác nhận đổi Wi-Fi hoặc khôi phục cài đặt
          gốc. Phải gồm 6 chữ số và khác PIN mở cửa.
        </Text>
        <Input
          label="PIN Admin mới · 6 số"
          value={adminPin}
          onChangeText={setAdminPin}
          secureTextEntry
          keyboardType="numeric"
          maxLength={6}
          editable={!busy}
          placeholder="••••••"
        />
        <Input
          label="Nhập lại PIN Admin"
          value={confirmAdminPin}
          onChangeText={setConfirmAdminPin}
          secureTextEntry
          keyboardType="numeric"
          maxLength={6}
          editable={!busy}
          placeholder="••••••"
        />
        <Button
          title={busy ? 'Đang chờ cửa xác nhận…' : 'Lưu mã PIN Admin'}
          icon="shield-checkmark-outline"
          disabled={
            busy || !effective.online || Boolean(validateSinglePin(adminPin, confirmAdminPin))
          }
          onPress={() => {
            void act(async () => {
              await acknowledged(
                await setupService.adminPin(unitId, {
                  pin: adminPin,
                  confirmPin: confirmAdminPin,
                }),
              );
              clearPins();
              if (!standaloneSubView) setView('home');
              setMessage('Đã cập nhật mã PIN Admin thành công.');
              await reload();
            });
          }}
        />
        {!standaloneSubView ? (
          <Button
            title="Quay lại"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              clearPins();
              setView('home');
            }}
          />
        ) : null}
        {feedback}
      </Card>
    );

  if (view === 'calibrate')
    return (
      <Card>
        <View style={s.row}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              backgroundColor: colors.indigoSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="locate-outline" size={21} color={colors.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>Hiệu chỉnh phần cứng</Text>
            <Text style={s.caption}>Cảm ứng màn hình và cảm biến đóng/mở cửa</Text>
          </View>
          <Badge
            label={effective.touchCalibrated && effective.doorCalibrated ? 'Đã chuẩn' : 'Cần căn'}
            tone={effective.touchCalibrated && effective.doorCalibrated ? 'success' : 'warning'}
          />
        </View>
        <View
          style={{
            backgroundColor: colors.surfaceAlt,
            borderRadius: 16,
            padding: 14,
            gap: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={s.row}>
            <Ionicons
              name={effective.touchCalibrated ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={effective.touchCalibrated ? colors.success : colors.muted}
            />
            <Text style={[s.caption, { flex: 1, color: colors.text }]}>
              Cảm ứng màn hình 4 góc
            </Text>
            <Text style={s.caption}>
              {effective.touchCalibrated ? 'Đã hiệu chỉnh' : 'Chưa hiệu chỉnh'}
            </Text>
          </View>
          <View style={s.row}>
            <Ionicons
              name={effective.doorCalibrated ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={effective.doorCalibrated ? colors.success : colors.muted}
            />
            <Text style={[s.caption, { flex: 1, color: colors.text }]}>
              Cảm biến từ đóng / mở cửa
            </Text>
            <Text style={s.caption}>
              {effective.doorCalibrated ? 'Đã hiệu chỉnh' : 'Chưa hiệu chỉnh'}
            </Text>
          </View>
        </View>
        <Text style={s.description}>
          Sử dụng khi bạn di dời cảm biến từ hoặc cần căn lại màn hình cảm ứng. Góc khóa/mở
          được giữ nguyên; bạn có thể chỉnh riêng tại mục Góc Servo.
        </Text>
        <Button
          title={busy ? 'Đang gửi lệnh…' : 'Bắt đầu hiệu chỉnh trên cửa'}
          icon="construct-outline"
          disabled={busy || !effective.online}
          onPress={() => {
            void act(async () => {
              await acknowledged(await setupService.calibrate(unitId));
              setRestarting(true);
              await reload();
            });
          }}
        />
        {!standaloneSubView ? (
          <Button
            title="Quay lại"
            variant="ghost"
            disabled={busy}
            onPress={() => setView('home')}
          />
        ) : null}
        {feedback}
      </Card>
    );

  if (view === 'pins')
    return (
      <View style={{ gap: 16 }}>
        <Card>
          <View style={s.row}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 15,
                backgroundColor: colors.warningSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="keypad-outline" size={21} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>Đổi hai mã PIN</Text>
              <Text style={s.caption}>Cập nhật PIN mở cửa và PIN quản trị 6 chữ số</Text>
            </View>
          </View>
          {pinForm}
          {!standaloneSubView ? (
            <Button
              title="Quay lại"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                clearPins();
                setView('home');
              }}
            />
          ) : null}
        </Card>
        {feedback}
      </View>
    );

  if (view === 'wifi')
    return (
      <Card>
        <View style={s.row}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              backgroundColor: colors.skySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="wifi-outline" size={22} color={colors.sky} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>Đổi Wi-Fi của cửa</Text>
            <Text style={s.caption}>Mạng đã lưu: {effective.wifiSsid || 'Chưa có thông tin'}</Text>
          </View>
          <Badge
            label={effective.online ? 'Đang kết nối' : 'Ngoại tuyến'}
            tone={effective.online ? 'success' : 'neutral'}
          />
        </View>
        <Text style={s.description}>
          Mở Wi-Fi của cửa, quét QR trên màn hình bằng camera điện thoại để tham gia mạng. Chọn
          Wi-Fi mới trên trang thiết lập; với cửa đã nhận, trang yêu cầu PIN quản trị.
        </Text>
        <Button
          title="Mở Wi-Fi thiết lập trên cửa"
          icon="radio-outline"
          disabled={busy || !effective.online}
          onPress={() => {
            void act(async () => {
              await acknowledged(await setupService.wifi(unitId));
              setMessage('Đã mở Wi-Fi thiết lập. Quét QR trên màn hình cửa để kết nối.');
            });
          }}
        />
        <Button
          title="Mở cài đặt Wi-Fi điện thoại"
          variant="ghost"
          icon="settings-outline"
          onPress={() => {
            void act(openWifiSettings);
          }}
        />
        <Button
          title="Mở trang chọn Wi-Fi"
          variant="ghost"
          icon="globe-outline"
          onPress={() => {
            void act(openSetupPortal);
          }}
        />
        {!standaloneSubView ? (
          <Button
            title="Quay lại"
            variant="ghost"
            disabled={busy}
            onPress={() => setView('home')}
          />
        ) : null}
        {feedback}
      </Card>
    );

  return (
    <Card>
      <View style={s.row}>
        <Text style={[s.heading, { flex: 1 }]}>Thiết lập cửa</Text>
        <Badge label="Đã hoàn tất" tone="success" />
      </View>
      <FeatureTile
        compact
        icon="options-outline"
        tone="purple"
        title="Chỉnh góc khóa / mở Servo"
        subtitle="Tinh chỉnh hành trình 180°/360° và góc đóng/mở"
        onPress={() => {
          setError('');
          setMessage('');
          setView('servo');
        }}
      />
      <FeatureTile
        compact
        icon="keypad-outline"
        tone="warning"
        title="Mã PIN mở cửa"
        subtitle="Đổi mã 6 số mở cửa hằng ngày"
        onPress={() => {
          setError('');
          setMessage('');
          setView('door-pin');
        }}
      />
      <FeatureTile
        compact
        icon="key-outline"
        tone="rose"
        title="Mã PIN Admin"
        subtitle="Đổi mã 6 số quản trị trên khóa"
        onPress={() => {
          setError('');
          setMessage('');
          setView('admin-pin');
        }}
      />
      <FeatureTile
        compact
        icon="locate-outline"
        tone="indigo"
        title="Hiệu chỉnh phần cứng"
        subtitle="Cảm ứng màn hình & cảm biến cửa"
        onPress={() => {
          setError('');
          setMessage('');
          setView('calibrate');
        }}
      />
      <FeatureTile
        compact
        icon="wifi-outline"
        tone="sky"
        title="Đổi Wi-Fi của cửa"
        subtitle={`SSID hiện tại: ${effective.wifiSsid || 'Đang kết nối'}`}
        onPress={() => {
          setError('');
          setMessage('');
          setView('wifi');
        }}
      />
      {feedback}
    </Card>
  );
}
