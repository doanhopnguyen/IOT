import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { InventoryDevice } from './ActivationWizard';
import { resetComplete, resetOnline, resetService, validateReset } from '../services/api/resetService';
import { useConfirm } from './ConfirmationProvider';
import { Button, Card, Input, Notice, styles as s } from './ui';
import { colors } from '../theme/tokens';
import { managerService, type CommandDto } from '../services/api/managerService';

export function FactoryReset({ device, onUpdated }: {
  device: InventoryDevice; onUpdated: (device: InventoryDevice) => void;
}) {
  const confirm = useConfirm();
  const [password, setPassword] = useState(''), [adminPin, setAdminPin] = useState('');
  const [confirmation, setConfirmation] = useState(''), [recipientEmail, setRecipient] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [codeSync, setCodeSync] = useState<'WAITING' | 'CONFIRMED' | 'FAILED'>();
  const resetting = device.state === 'RESETTING', complete = resetComplete(device);
  const online = resetOnline(device);
  const input = { password, adminPin, confirmation, recipientEmail };
  const confirmCode = async (command: CommandDto) => {
    setCodeSync('WAITING');
    const result = await managerService.waitForCommand(command);
    if (result.status !== 'ACKNOWLEDGED') throw new Error('Mã đã cấp trên máy chủ nhưng khóa chưa xác nhận lưu. Kết nối Wi-Fi cho khóa rồi gửi lại đúng mã này.');
    setCodeSync('CONFIRMED');
  };
  const issueCode = async () => {
    setBusy(true); setError('');
    try {
      if (code) await confirmCode(await resetService.syncCode(device.deviceUid, password, code));
      else {
        const issued = await resetService.issueCode(device.deviceUid, password);
        setCode(issued.activationCode);
        await confirmCode(issued.syncCommand);
      }
    } catch (e) { setCodeSync('FAILED'); setError(e instanceof Error ? e.message : 'Chưa đồng bộ được mã nhận cửa.'); }
    finally { setPassword(''); setBusy(false); }
  };

  useEffect(() => {
    if (!resetting) return;
    let active = true;
    const timer = setInterval(() => {
      void resetService.status(device.deviceUid).then(next => {
        if (active) { onUpdated(next); setError(''); }
      }).catch(() => {
        if (active) setError('Chưa lấy được xác nhận reset. Giữ nguồn và mạng cho cửa, rồi cập nhật trạng thái.');
      });
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [resetting, device.deviceUid, onUpdated]);

  const refresh = async () => {
    setBusy(true); setError('');
    try { onUpdated(await resetService.status(device.deviceUid)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chưa cập nhật được trạng thái.'); }
    finally { setBusy(false); }
  };
  const start = async () => {
    const invalid = validateReset(device.deviceUid, input);
    if (invalid) { setError(invalid); return; }
    const ok = await confirm({
      title: 'Khôi phục mặc định nhà sản xuất?',
      message: 'Xóa PIN mở cửa và admin, Wi-Fi, thẻ, mẫu vân tay, hiệu chỉnh cảm ứng/cửa/servo, thành viên, quyền và lịch sử của cửa. Bạn phải kết nối Wi-Fi và thiết lập lại từ đầu. Không thể hoàn tác.',
      confirmLabel: 'Xóa và khôi phục mặc định', destructive: true,
    });
    if (!ok) return;
    setBusy(true); setError('');
    try {
      onUpdated(await resetService.reset(device.deviceUid, input));
      setConfirmation('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa gửi được yêu cầu reset.');
      // A lost response does not prove the destructive request failed.
      try { onUpdated(await resetService.status(device.deviceUid)); } catch { /* Keep the uncertainty visible. */ }
    } finally { setPassword(''); setAdminPin(''); setBusy(false); }
  };

  return <Card style={{ borderColor: '#F1CBD1' }}>
    <Text style={[s.heading, { color: colors.error }]}>Khôi phục mặc định nhà sản xuất</Text>
    {complete ? <>
      <Notice tone="success">Thiết bị đã xác nhận xóa dữ liệu. Cửa trở về trạng thái ban đầu: kết nối Wi-Fi, nhận cửa bằng mã mới, đặt PIN và hiệu chỉnh lại.</Notice>
      <Text style={s.description}>Mã nhận cửa cũ không còn hiệu lực. Tài khoản của bạn và dữ liệu các cửa khác được giữ.</Text>
      <Input label="Mật khẩu tài khoản để cấp mã nhận mới" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Button title={code ? 'Gửi lại mã hiện tại xuống khóa' : 'Cấp mã nhận cửa mới'} disabled={busy || !password || codeSync === 'CONFIRMED'} onPress={() => { void issueCode(); }} />
      {code ? <Text selectable style={s.description}>Mã nhận cửa mới: {code}</Text> : null}
      {codeSync ? <Notice tone={codeSync === 'CONFIRMED' ? 'success' : 'warning'}>{codeSync === 'CONFIRMED'
        ? 'Khóa đã xác nhận lưu mã mới. Quét QR mới trên màn hình khóa để nhận cửa.'
        : codeSync === 'WAITING' ? 'Mã đã cấp trên máy chủ. Đang chờ khóa xác nhận lưu QR mới…'
          : 'Chưa có xác nhận lưu QR mới từ khóa. Giữ lại mã này, kết nối Wi-Fi cho khóa và gửi lại mã.'}</Notice> : null}
    </> : resetting ? <Notice tone="warning">Đang khôi phục mặc định. Giữ nguồn và kết nối mạng cho cửa. App tự cập nhật và chỉ báo hoàn tất khi thiết bị xác nhận đã xóa.</Notice> : <>
      {device.operationUuid ? <Notice tone="warning">Lần reset trước chưa được xác nhận hoàn tất. Cập nhật trạng thái trước khi thử lại.</Notice> : null}
      <Text style={s.description}>Xóa toàn bộ dữ liệu người dùng và thiết lập của cửa: PIN, Wi-Fi, thẻ, vân tay, hiệu chỉnh cảm ứng/cửa/servo, thành viên, quyền khuôn mặt và lịch sử. Thiết bị sẽ khởi động lại để thiết lập từ đầu.</Text>
      <Text style={s.caption}>Cần đúng cả mật khẩu tài khoản quản lý và PIN admin của cửa. Giữ lại danh tính xuất xưởng, firmware và tài khoản để có thể sử dụng lại thiết bị.</Text>
      {!online ? <Notice tone="warning">Cần đưa cửa online trước khi khôi phục mặc định.</Notice> : null}
      <Input label="Mật khẩu tài khoản quản lý" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Input label="PIN admin của cửa · 6 số" value={adminPin} onChangeText={setAdminPin} secureTextEntry keyboardType="numeric" maxLength={6} />
      <Text selectable style={s.caption}>UID thiết bị: {device.deviceUid}</Text>
      <Input label="Nhập UID để xác nhận khôi phục" value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" />
      <Input label="Email nhận bàn giao · không bắt buộc" value={recipientEmail} onChangeText={setRecipient} keyboardType="email-address" autoCapitalize="none" />
      <Button title="Khôi phục mặc định nhà sản xuất" variant="danger" disabled={busy || !online || !!validateReset(device.deviceUid, input)} onPress={() => { void start(); }} />
    </>}
    <Button title="Cập nhật trạng thái khôi phục" variant="ghost" disabled={busy} onPress={() => { void refresh(); }} />
    {error ? <Notice tone="error">{error}</Notice> : null}
  </Card>;
}
