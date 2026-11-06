import { ApiError, request } from './client';
import type { InventoryDevice } from '../../components/ActivationWizard';

export interface ResetInput { password: string; adminPin: string; confirmation: string; recipientEmail: string; }
export function validateReset(uid: string, input: ResetInput) {
  if (!input.password) return 'Nhập mật khẩu tài khoản quản lý đang đăng nhập.';
  if (!/^[0-9]{6}$/.test(input.adminPin)) return 'Nhập PIN admin của cửa gồm đúng 6 chữ số.';
  if (input.confirmation !== uid) return 'Nhập đúng UID thiết bị để xác nhận xóa.';
  return null;
}
export function resetComplete(device: InventoryDevice) {
  return device.state === 'INVENTORY' && device.unitId === null && !!device.operationUuid;
}
export function resetOnline(device: InventoryDevice, now = Date.now()) {
  const seen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : NaN;
  return Number.isFinite(seen) && now - seen < 90000;
}
export const resetService = {
  status(uid: string) { return request<InventoryDevice>(`/api/activation/devices/${encodeURIComponent(uid)}`); },
  async reset(uid: string, input: ResetInput) {
    const error = validateReset(uid, input);
    if (error) throw new Error(error);
    try {
      return await request<InventoryDevice>(`/api/activation/devices/${encodeURIComponent(uid)}/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403)
        throw new Error('Mật khẩu tài khoản hoặc PIN admin chưa đúng, hoặc bạn không có quyền quản lý cửa này.');
      throw e;
    }
  },
  issueCode(uid: string, password: string) {
    return request<{ activationCode: string }>(`/api/activation/devices/${encodeURIComponent(uid)}/issue-code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    });
  },
};
