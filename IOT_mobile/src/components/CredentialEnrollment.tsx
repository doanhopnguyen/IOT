import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { managerService, type CommandDto } from '../services/api/managerService';
import { enrollmentStopped, enrollScannedRfid } from '../services/api/rfidEnrollment';
import { AppModal, Button, Card, Notice, styles as s } from './ui';
import { colors } from '../theme/tokens';
import { ApiError } from '../services/api/client';

type Enrollment = { kind: 'fingerprint' | 'rfid'; status: 'WAITING' | 'CANCELLING' | 'UNKNOWN' | 'SUCCESS' | 'FAILED' | 'CANCELLED'; message: string };
type Session = { command?: CommandDto; starting?: Promise<CommandDto>; cancelRequested: boolean; cancelling: boolean; terminal: boolean };

export function CredentialEnrollment({ unitId, userId, changed, disabled = false, closeRequestRef }: {
  unitId: number; userId: number; changed: () => Promise<void>; disabled?: boolean;
  closeRequestRef?: RefObject<(() => Promise<boolean>) | undefined>;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const session = useRef<Session | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = session.current;
      if (current && !current.terminal && !current.cancelling) {
        current.cancelRequested = true;
        // Navigation/unmount does not prove cancellation. Ask the controller to stop; its own timeout remains authoritative offline.
        void Promise.resolve(current.command ?? current.starting).then(command => command && managerService.cancelEnrollment(unitId, command.commandUuid)).catch(() => {});
      }
    };
  }, [unitId]);
  const update = (value: Enrollment) => { if (mounted.current) setEnrollment(value); };
  const busy = !!enrollment && ['WAITING', 'CANCELLING', 'UNKNOWN'].includes(enrollment.status);
  const cancel = async (): Promise<boolean> => {
    const current = session.current;
    if (!current || current.terminal) { setEnrollment(undefined); return true; }
    if (current.cancelling) return false;
    current.cancelRequested = true; current.cancelling = true;
    const kind = enrollment?.kind ?? 'fingerprint';
    update({ kind, status: 'CANCELLING', message: 'Đang hủy... Chờ cửa xác nhận đã thoát chế độ quét.' });
    try {
      const command = current.command ?? await current.starting?.catch(() => undefined) ?? await managerService.currentEnrollment(unitId, userId);
      if (!command) throw new Error('Chưa xác định được phiên đăng ký.');
      current.command = command;
      const requested = await managerService.cancelEnrollment(unitId, command.commandUuid);
      const result = await managerService.waitForCommand(requested);
      if (result.status !== 'ACKNOWLEDGED') throw new Error(result.resultMessage || 'Thiết bị chưa xác nhận.');
      if (result.resultMessage === 'ENROLLMENT_CANCELLED') {
        current.terminal = true;
        update({ kind, status: 'CANCELLED', message: 'Cửa đã xác nhận hủy đăng ký và dừng quét. Bạn có thể đăng ký lại.' });
        return true;
      }
      if (result.resultMessage === 'ENROLLMENT_ALREADY_COMPLETED') {
        const original = await managerService.waitForCommand(await managerService.commandStatus(command.commandUuid));
        if (original.status !== 'ACKNOWLEDGED') throw new Error('Cửa đã hoàn tất nhưng chưa đồng bộ được kết quả.');
        current.terminal = true;
        update({ kind, status: 'SUCCESS', message: 'Đăng ký đã hoàn tất trước khi hủy. Không xóa phương thức đã lưu.' });
        try { await changed(); } catch { /* The completed enrollment is already authoritative. */ }
        return false;
      }
      throw new Error('Phản hồi không xác nhận thiết bị đã dừng.');
    } catch (e) {
      update({ kind, status: 'UNKNOWN', message: 'Chưa xác nhận hủy. ' + (e instanceof Error ? e.message : 'Kiểm tra kết nối.') + ' Giữ phiên này và thử xác nhận hủy lại.' });
      return false;
    } finally { current.cancelling = false; }
  };
  useEffect(() => {
    if (closeRequestRef) closeRequestRef.current = cancel;
    return () => { if (closeRequestRef) closeRequestRef.current = undefined; };
  });

  const run = async (kind: Enrollment['kind']) => {
    if (disabled || (session.current && !session.current.terminal)) return;
    const current: Session = { cancelRequested: false, cancelling: false, terminal: false };
    session.current = current;
    const hint = (message: string) => { if (!current.cancelRequested) update({ kind, status: 'WAITING', message }); };
    hint('Đang yêu cầu cửa mở chế độ đăng ký…');
    try {
      if (kind === 'rfid') {
        const reader = { ...managerService, scanRfid: (unit: number, user: number) => {
          current.starting = managerService.scanRfid(unit, user);
          return current.starting;
        } };
        await enrollScannedRfid(unitId, userId, () => hint('Đưa thẻ sát RC522 trong 30 giây.'), reader,
          { started: command => { current.command = command; }, cancelled: () => current.cancelRequested,
            settled: command => { if (!current.cancelRequested && command.status === 'FAILED' && enrollmentStopped(command)) current.terminal = true; } });
      } else {
        current.starting = managerService.enrollFingerprint(unitId, userId, 'Vân tay ' + new Date().toLocaleTimeString('vi-VN'));
        current.command = await current.starting;
        hint('Trong 45 giây: đặt ngón tay, nhấc hẳn ra rồi đặt lại cùng ngón theo màn hình cửa.');
        const result = await managerService.waitForCommand(current.command);
        if (current.cancelRequested) return;
        if (result.status !== 'ACKNOWLEDGED') {
          if (['TIMEOUT', 'PENDING', 'SENT'].includes(result.status)) throw new Error('Chưa nhận được xác nhận kết thúc từ cửa.');
          current.terminal = enrollmentStopped(result);
          throw new Error(result.resultMessage || 'Cửa báo đăng ký thất bại.');
        }
      }
      if (current.cancelRequested) return;
      current.terminal = true;
      update({ kind, status: 'SUCCESS', message: 'Cửa đã xác nhận đăng ký thành công.' });
      try { await changed(); } catch { /* Enrollment remains confirmed if list refresh fails. */ }
    } catch (e) {
      if (current.cancelRequested) return;
      if (!current.command && e instanceof ApiError && e.status >= 400 && e.status < 500) current.terminal = true;
      update({ kind, status: current.terminal ? 'FAILED' : 'UNKNOWN', message: e instanceof Error ? e.message : 'Chưa xác nhận được kết quả đăng ký.' });
    }
  };
  const close = () => { void cancel().then(closed => { if (closed) setEnrollment(undefined); }); };
  return <Card>
    <Text style={s.heading}>Thêm phương thức mở cửa</Text>
    <Text style={s.description}>Vân tay: đặt cùng ngón tay hai lần. Thẻ: đưa sát đầu đọc trên cửa.</Text>
    <Button title="Thêm vân tay" icon="finger-print-outline" disabled={busy || disabled} onPress={() => { void run('fingerprint'); }} />
    <Button title="Thêm thẻ NFC/RFID" icon="card-outline" variant="ghost" disabled={busy || disabled} onPress={() => { void run('rfid'); }} />
    <AppModal visible={!!enrollment} title={enrollment?.kind === 'rfid' ? 'Thêm thẻ NFC/RFID' : 'Thêm vân tay'} onClose={close}>
      <View style={{ gap: 14, alignItems: 'center' }}>
        {busy ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        <Text style={s.heading}>{enrollment?.status === 'CANCELLING' ? 'Đang hủy...' : enrollment?.status === 'UNKNOWN' ? 'Chưa xác nhận kết quả' : enrollment?.status === 'WAITING' ? 'Đang chờ quét…' : enrollment?.status === 'SUCCESS' ? 'Đăng ký thành công' : enrollment?.status === 'CANCELLED' ? 'Đã hủy đăng ký' : 'Chưa đăng ký được'}</Text>
        <Notice tone={enrollment?.status === 'UNKNOWN' || enrollment?.status === 'FAILED' ? 'error' : 'info'}>{enrollment?.message ?? ''}</Notice>
      </View>
      {busy ? <Button title={enrollment?.status === 'CANCELLING' ? 'Đang hủy...' : enrollment?.status === 'UNKNOWN' ? 'Xác nhận hủy lại' : 'Hủy đăng ký'} disabled={enrollment?.status === 'CANCELLING'} onPress={() => { void cancel(); }} />
        : <Button title="Đóng" onPress={close} />}
    </AppModal>
  </Card>;
}
