import { ApiError, request } from './client';
import { activationClaimInput } from './activationInput';
import type { ProductSetup } from './productQr';
import type { DeviceLifecycle } from './deviceState';

export interface InventoryDevice {
  deviceId: number; deviceUid: string; unitId: number | null; name: string; state: string;
  generation: number; setupReady: boolean; doorClosed: boolean | null; latchReleased: boolean | null;
  lastSeenAt: string | null; operationUuid: string | null;
  lifecycleStatus?: DeviceLifecycle;
}
export interface ClaimPreview { deviceUid: string; name: string; online: boolean; }
export function activationPage(state: { hasDevice: boolean; hasProduct: boolean; online: boolean; restartConfirmed: boolean }) {
  return state.hasDevice ? 'SETUP' : !state.hasProduct ? 'SCAN' : !state.online ? 'WIFI' : state.restartConfirmed ? 'NAME' : 'RESTART';
}
export async function checkRestartConnection(product: ProductSetup,
  inspect: (product: ProductSetup) => Promise<ClaimPreview> = inspectProduct) {
  const info = await inspect(product);
  if (info.online !== true) throw new Error('Cửa chưa kết nối lại dịch vụ. Chờ Wi-Fi ổn định sau khi khởi động lại rồi kiểm tra tiếp.');
  return info;
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export async function inspectProduct(product: ProductSetup,
  inspect: (code: string) => Promise<ClaimPreview> = code => request('/api/activation/inspect', post({ activationCode: code }), fetch, 5000)) {
  const preview = await inspect(product.activationCode);
  if (product.deviceUid && preview.deviceUid !== product.deviceUid) throw new ApiError('Mã nhận cửa và thiết bị trong QR không khớp. Hãy quét lại QR sản phẩm gốc.', 400);
  return preview;
}
export async function claimProduct(product: ProductSetup, name: string) {
  try { return await request<InventoryDevice>('/api/activation/claim', post(activationClaimInput(product.activationCode, name))); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) throw new Error('Mã nhận cửa không hợp lệ hoặc đã được sử dụng. Kiểm tra QR sản phẩm.');
    throw error;
  }
}
