import { managerService, type CommandDto } from './managerService';

type Reader = Pick<typeof managerService, 'scanRfid' | 'waitForCommand' | 'assignRfid'>;

export function rfidScanError(command: CommandDto): string {
  const messages: Record<string, string> = {
    RFID_SCAN_TIMEOUT: 'Hết thời gian đọc thẻ. Bấm thêm thẻ và đưa thẻ sát đầu đọc trên cửa trong 30 giây.',
    RFID_SCAN_EXPIRED: 'Phiên đọc thẻ đã hết hạn. Bấm thêm thẻ để bắt đầu lại.',
    RFID_BUSY_OR_NOT_READY: 'Đầu đọc thẻ chưa sẵn sàng. Hoàn tất thiết lập và đưa màn hình cửa về bàn phím rồi thử lại.',
    DEVICE_BUSY: 'Cửa đang thực hiện thao tác khác. Chờ hoàn tất rồi thử lại.',
  };
  if (command.resultMessage && messages[command.resultMessage]) return messages[command.resultMessage];
  if (['TIMEOUT', 'PENDING', 'SENT'].includes(command.status)) return 'Chưa nhận xác nhận đọc thẻ từ cửa. Kiểm tra kết nối rồi thử lại.';
  return command.resultMessage || 'Cửa chưa đọc được thẻ. Bấm thêm thẻ để thử lại.';
}

/** Register only a UID acknowledged by the ESP32 reader for this enrollment session. */
export async function enrollScannedRfid(unitId: number, userId: number, waiting: () => void,
  reader: Reader = managerService) {
  const command = await reader.scanRfid(unitId, userId);
  waiting();
  const result = await reader.waitForCommand(command);
  if (result.status !== 'ACKNOWLEDGED') throw new Error(rfidScanError(result));
  const match = /^RFID_UID:([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/i.exec(result.resultMessage ?? '');
  if (!match) throw new Error('Đầu đọc chưa trả về mã thẻ hợp lệ. Bấm thêm thẻ để đọc lại.');
  return reader.assignRfid(unitId, userId, match[1].toUpperCase());
}
