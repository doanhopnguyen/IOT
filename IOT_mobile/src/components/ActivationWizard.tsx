import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { AppModal, Badge, Button, Card, Input, Notice, styles as s } from './ui';
import { ApiError, request } from '../services/api/client';
import { activationClaimInput, productSetup } from '../services/api/activationInput';

export interface InventoryDevice {
  deviceId: number;
  deviceUid: string;
  unitId: number | null;
  name: string;
  state: string;
  generation: number;
  setupReady: boolean;
  doorClosed: boolean | null;
  latchReleased: boolean | null;
  lastSeenAt: string | null;
  operationUuid: string | null;
}
export function ActivationWizard({
  open,
  close,
  onCreated,
}: {
  open: boolean;
  close: () => void;
  onCreated: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [scanner, setScanner] = useState(false);
  const [permission, ask] = useCameraPermissions();
  const [device, setDevice] = useState<InventoryDevice>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  let setup: ReturnType<typeof productSetup> | undefined;
  try {
    if (code.trim()) setup = productSetup(code);
  } catch {
    /* Show validation when submitting or scanning. */
  }
  useEffect(() => {
    if (!open) {
      setCode('');
      setName('');
      setDevice(undefined);
      setMessage('');
      setScanner(false);
    }
  }, [open]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Chưa thực hiện được. Kiểm tra kết nối Internet rồi thử lại.',
      );
    } finally {
      setBusy(false);
    }
  };
  const claim = async () => {
    const input = activationClaimInput(code, name);
    try {
      const d = await request<InventoryDevice>('/api/activation/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      setDevice(d);
      await onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        throw new Error(
          'Mã nhận cửa không hợp lệ hoặc đã được sử dụng. Kiểm tra QR trên sản phẩm hoặc liên hệ nơi bán.',
        );
      if (e instanceof ApiError && e.status === 400)
        throw new Error(
          'Kiểm tra mã nhận cửa trên sản phẩm và tên cửa. Không dùng mã MAC hoặc PIN thay cho mã nhận cửa.',
        );
      throw e;
    }
  };
  const check = async () => {
    if (device) {
      const d = await request<InventoryDevice>(
        `/api/activation/devices/${encodeURIComponent(device.deviceUid)}`,
      );
      setDevice(d);
      setMessage(
        d.setupReady
          ? 'Cửa đã sẵn sàng sử dụng.'
          : 'Cửa đang hoàn tất thiết lập. Kiểm tra Wi-Fi, PIN và hiệu chỉnh cảm biến theo hướng dẫn trên màn hình cửa.',
      );
    }
  };
  return (
    <AppModal
      visible={open}
      onClose={() => {
        if (!busy) close();
      }}
      title="Thiết lập cửa mới"
    >
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Badge label="1 · QR sản phẩm" tone="primary" />
          <Badge label="2 · Wi-Fi" />
          <Badge label="3 · Nhận cửa" />
        </View>
        {!device ? (
          <View style={{ gap: 14 }}>
            <Text style={s.heading}>1. Quét QR trên sản phẩm</Text>
            <Input
              label="Mã nhận cửa trên sản phẩm"
              autoCapitalize="none"
              value={code}
              onChangeText={setCode}
              placeholder="Mã nhận cửa hoặc nội dung QR"
            />
            {scanner && permission?.granted ? (
              <CameraView
                style={{ height: 200 }}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(event) => {
                  try {
                    productSetup(event.data);
                    setCode(event.data);
                    setScanner(false);
                    setMessage('');
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : 'QR không hợp lệ.');
                  }
                }}
              />
            ) : null}
            <Button
              title="Quét QR sản phẩm"
              icon="qr-code-outline"
              variant="ghost"
              onPress={() => {
                void ask().then((p) => setScanner(p.granted));
              }}
            />
            <Card>
              <Text style={s.heading}>2. Kết nối Wi-Fi cho cửa</Text>
              <Text style={s.caption}>Kết nối Wi-Fi của cửa trước khi mở trang thiết lập.</Text>
              <Text selectable style={s.caption}>
                Mạng thiết lập: {setup?.ssid ?? 'SmartDoor-… (xem trên sản phẩm)'}
              </Text>
              <Text selectable style={s.caption}>
                Mật khẩu: {setup?.password ?? 'Xem trên tem hoặc màn hình cửa'}
              </Text>
              {setup?.deviceUid ? (
                <Text style={s.description}>Mã sản phẩm: {setup.deviceUid}</Text>
              ) : null}
              {Platform.OS === 'android' ? (
                <Button
                  title="Mở cài đặt Wi-Fi"
                  variant="ghost"
                  onPress={() => {
                    void Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() =>
                      setMessage('Mở Cài đặt → Wi-Fi trên điện thoại để chọn mạng của cửa.'),
                    );
                  }}
                />
              ) : null}
              <Button
                title="Mở trang thiết lập của cửa"
                icon="wifi-outline"
                variant="ghost"
                onPress={() => {
                  void Linking.openURL('http://192.168.4.1').catch(() =>
                    setMessage(
                      'Chưa mở được trang thiết lập. Kết nối Wi-Fi riêng của cửa rồi thử lại.',
                    ),
                  );
                }}
              />
              <Text style={s.caption}>Chọn “Hoàn tất” sau khi lưu Wi-Fi.</Text>
            </Card>
            <Text style={s.heading}>3. Nhận cửa vào tài khoản của bạn</Text>
            <Input
              label="Tên cửa của bạn"
              value={name}
              onChangeText={setName}
              placeholder="Đặt tên cửa, ví dụ Cửa nhà"
            />
            <Button
              title={busy ? 'Đang nhận cửa…' : 'Nhận cửa vào tài khoản'}
              disabled={busy || !code.trim() || !name.trim()}
              onPress={() => {
                void run(claim);
              }}
            />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Text style={s.heading}>Đã nhận {device.name}</Text>
            <Text style={s.description}>Mã sản phẩm: {device.deviceUid}</Text>
            <Badge
              label={device.setupReady ? 'Sẵn sàng sử dụng' : 'Chưa hoàn tất thiết lập'}
              tone={device.setupReady ? 'success' : 'warning'}
            />
            <Button
              title="Kiểm tra cửa đã sẵn sàng"
              disabled={busy}
              onPress={() => {
                void run(check);
              }}
            />
            <Button
              title="Về danh sách cửa"
              variant="ghost"
              onPress={() => {
                void onCreated();
                close();
              }}
            />
          </View>
        )}
        {message ? <Notice tone="warning">{message}</Notice> : null}
      </View>
    </AppModal>
  );
}
