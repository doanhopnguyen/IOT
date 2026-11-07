import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { managerService, type CommandDto } from '../services/api/managerService';
import { enrollScannedRfid } from '../services/api/rfidEnrollment';
import { AppModal, Button, Card, Notice, styles as s } from './ui';
import { colors } from '../theme/tokens';

type Enrollment = { kind: 'fingerprint' | 'rfid'; status: 'WAITING' | 'SUCCESS' | 'FAILED'; message: string };

export function CredentialEnrollment({ unitId, userId, changed, disabled = false }: {
  unitId: number; userId: number; changed: () => Promise<void>; disabled?: boolean;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const busy = enrollment?.status === 'WAITING';
  const wait = async (command: CommandDto) => {
    const result = await managerService.waitForCommand(command);
    if (result.status !== 'ACKNOWLEDGED') {
      const messages: Record<string, string> = {
        FINGER_ALREADY_ENROLLED: 'Ngón tay này đã được đăng ký trên cảm biến. Chọn ngón khác hoặc xóa mẫu cũ trước.',
        SENSOR_NOT_READY: 'Cảm biến vân tay chưa sẵn sàng. Kiểm tra kết nối cảm biến.',
        ENROLL_TIMEOUT: 'Hết thời gian lấy vân tay. Đặt cùng một ngón tay hai lần theo hướng dẫn.',
        DEVICE_BUSY: 'Cửa đang thực hiện thao tác khác. Chờ hoàn tất rồi thử lại.',
      };
      throw new Error((result.resultMessage && messages[result.resultMessage]) || result.resultMessage || 'Cửa chưa xác nhận. Kiểm tra kết nối rồi thử lại.');
    }
    return result;
  };
  const run = async (kind: Enrollment['kind'], action: (hint: (message: string) => void) => Promise<string>) => {
    const hint = (message: string) => setEnrollment({ kind, status: 'WAITING', message });
    hint(kind === 'rfid' ? 'Đang yêu cầu cửa mở chế độ đọc thẻ…' : 'Đang yêu cầu cửa mở chế độ lấy vân tay…');
    try {
      const message = await action(hint);
      setEnrollment({ kind, status: 'SUCCESS', message });
      try { await changed(); }
      catch { setEnrollment({ kind, status: 'SUCCESS', message: `${message} Chưa tải lại được danh sách; hãy cập nhật sau.` }); }
    } catch (e) {
      setEnrollment({ kind, status: 'FAILED', message: e instanceof Error ? e.message : 'Không thực hiện được.' });
    }
  };
  return <Card>
    <Text style={s.heading}>Thêm phương thức mở cửa</Text>
    <Text style={s.description}>Vân tay: đặt ngón tay lên cảm biến, nhấc hẳn ra rồi đặt lại đúng ngón đó theo màn hình cửa.</Text>
    <Button title="Thêm vân tay" icon="finger-print-outline" disabled={busy || disabled}
      onPress={() => { void run('fingerprint', async hint => {
        const command = await managerService.enrollFingerprint(unitId, userId, `Vân tay ${new Date().toLocaleTimeString('vi-VN')}`);
        hint('Trong 45 giây: đặt ngón tay, nhấc hẳn ra, rồi đặt lại cùng ngón tay theo màn hình cửa.');
        await wait(command);
        return 'Cảm biến đã lưu và xác nhận vân tay.';
      }); }} />
    <Text style={s.description}>Thẻ NFC/RFID: bấm thêm thẻ rồi đưa thẻ sát đầu đọc trên cửa để đăng ký.</Text>
    <Button title="Thêm thẻ NFC/RFID" icon="card-outline" disabled={busy || disabled} variant="ghost"
      onPress={() => { void run('rfid', async hint => {
        await enrollScannedRfid(unitId, userId, () => hint('Đưa thẻ NFC/RFID sát đầu đọc trên cửa trong 30 giây. Giữ thẻ đến khi cửa xác nhận đã đọc.'));
        return 'Đã đọc và đăng ký thẻ NFC/RFID. Chờ cửa nhận đồng bộ rồi thử quẹt thẻ.';
      }); }} />
    <AppModal visible={Boolean(enrollment)} title={enrollment?.kind === 'rfid' ? 'Thêm thẻ NFC/RFID' : 'Thêm vân tay'}
      onClose={() => { if (!busy) setEnrollment(undefined); }}>
      <View style={{ gap: 14, alignItems: 'center' }}>
        {busy ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        <Text style={s.heading}>{busy ? (enrollment?.kind === 'rfid' ? 'Đang chờ bạn đưa thẻ tới đầu đọc…' : 'Đang chờ đặt ngón tay…')
          : enrollment?.status === 'SUCCESS' ? 'Đăng ký thành công' : 'Chưa đăng ký được'}</Text>
        <Notice tone={enrollment?.status === 'FAILED' ? 'error' : enrollment?.status === 'SUCCESS' ? 'success' : 'info'}>
          {enrollment?.message ?? ''}
        </Notice>
      </View>
      {!busy ? <Button title="Đóng" onPress={() => setEnrollment(undefined)} /> : null}
    </AppModal>
  </Card>;
}
