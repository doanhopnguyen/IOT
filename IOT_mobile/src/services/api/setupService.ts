import { request } from './client';
import type { CommandDto } from './managerService';
export interface SetupStatus {
  online: boolean; ready: boolean; stage: string; doorPinSet: boolean; adminPinSet: boolean;
  touchCalibrated: boolean; doorCalibrated: boolean; wifiSsid: string; deviceUid: string;
  servoCalibrated?: boolean; servoCommandAngle?: number | null; servoDirection?: string;
}
export interface SetupPins { pin: string; confirmPin: string; adminPin: string; confirmAdminPin: string; }
export interface SinglePinInput { pin: string; confirmPin: string; }
const post = (body?: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const put = (body: unknown): RequestInit => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const setupService = {
  status(unitId: number) { return request<SetupStatus>(`/api/manager/units/${unitId}/setup`); },
  credentials(unitId: number, pins: SetupPins) { return request<CommandDto>(`/api/manager/units/${unitId}/setup/credentials`, post(pins)); },
  doorPin(unitId: number, input: SinglePinInput) { return request<CommandDto>(`/api/manager/units/${unitId}/pin`, put(input)); },
  adminPin(unitId: number, input: SinglePinInput) { return request<CommandDto>(`/api/manager/units/${unitId}/admin-pin`, put(input)); },
  calibrate(unitId: number) { return request<CommandDto>(`/api/manager/units/${unitId}/setup/calibrate`, post()); },
  wifi(unitId: number) { return request<CommandDto>(`/api/manager/units/${unitId}/wifi-setup`, post()); },
};
export function validateSinglePin(pin: string, confirmPin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'Mã PIN cần đủ 6 chữ số.';
  if (pin !== confirmPin) return 'PIN xác nhận chưa trùng khớp.';
  return null;
}
export function validateSetupPins(pins: SetupPins): string | null {
  if (!/^\d{6}$/.test(pins.pin) || !/^\d{6}$/.test(pins.adminPin)) return 'Mỗi PIN cần đủ 6 chữ số.';
  if (pins.pin !== pins.confirmPin || pins.adminPin !== pins.confirmAdminPin) return 'PIN xác nhận chưa trùng khớp.';
  if (pins.pin === pins.adminPin) return 'PIN mở cửa và PIN quản trị cần khác nhau.';
  return null;
}
export type SetupPage = 'PINS' | 'TOUCH' | 'DOOR_CLOSED' | 'DOOR_OPEN' | 'SERVO_LOCK' | 'SERVO_OPEN' | 'VERIFY' | 'COMPLETE';
export function setupPage(status: SetupStatus, pinsAcknowledged = false): SetupPage {
  if ((!status.doorPinSet || !status.adminPinSet) && !pinsAcknowledged) return 'PINS';
  if (!status.touchCalibrated || status.stage.startsWith('TOUCH_')) return 'TOUCH';
  if (status.stage === 'DOOR_OPEN') return 'DOOR_OPEN';
  if (!status.doorCalibrated) return 'DOOR_CLOSED';
  if (status.stage === 'SERVO_OPEN') return 'SERVO_OPEN';
  if (!status.servoCalibrated) return 'SERVO_LOCK';
  return status.ready ? 'COMPLETE' : 'VERIFY';
}
export function setupInstruction(status: SetupStatus): string {
  if (!status.online) return 'Cửa chưa kết nối dịch vụ. Sau khi đã thiết lập xong, PIN/thẻ/vân tay đã lưu vẫn mở được ngay trên cửa. Nếu đang hiệu chỉnh, tiếp tục theo màn hình chip; app sẽ cập nhật tiến độ khi kết nối lại.';
  if (status.ready && setupPage(status) === 'COMPLETE') return 'Đã hoàn tất. Bạn có thể thêm thành viên và phương thức mở cửa.';
  if (!status.doorPinSet || !status.adminPinSet) return 'Đặt PIN mở cửa và PIN quản trị trong app. Chờ cửa xác nhận rồi bắt đầu hiệu chỉnh.';
  if (status.stage.startsWith('TOUCH_')) {
    const point = Number(status.stage.slice(6));
    return point === 4 ? 'Chạm và nhấc ngón tay ở dấu cộng giữa màn hình cửa để xác nhận cảm ứng.'
      : `Trên màn hình cửa, giữ ngón tay tại dấu cộng số ${point}, chờ báo đã nhận rồi nhấc ra. Không chạm vào màn hình điện thoại để hiệu chỉnh.`;
  }
  if (status.stage === 'DOOR_OPEN') return 'Mở cánh cửa hoặc đưa nam châm ra xa cảm biến. Giữ ổn định rồi bấm CONFIRM STATE trên màn hình cửa.';
  if (status.stage === 'SERVO_LOCK') return 'Đóng cánh cửa. Trên chip, nhích LOCK bằng ±1° hoặc ±5°; servo quay ngay theo góc vừa chỉnh. Quan sát chốt vào đúng vị trí khóa, chờ servo dừng rồi bấm CONFIRM LOCK. TEST LOCK POSITION cho phép thử lại góc hiện tại.';
  if (status.stage === 'SERVO_OPEN') return 'Trên chip, nhích OPEN bằng ±1° hoặc ±5°; servo quay ngay. Quan sát chốt nhả đúng vị trí, chờ servo dừng rồi bấm CONFIRM OPEN / FINISH để lưu cả hai góc. Chiều quay nhìn thực tế phụ thuộc cách lắp servo.';
  if (!status.doorCalibrated) return 'Đóng cánh cửa, đặt nam châm đúng vị trí cảm biến. Chờ ổn định rồi bấm CONFIRM STATE trên màn hình cửa; sau đó làm theo bước mở cửa.';
  return 'Đang chờ cửa báo kết quả. Giữ nguồn ổn định và làm theo hướng dẫn trên màn hình cửa.';
}
