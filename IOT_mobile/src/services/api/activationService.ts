import { ApiError, request } from './client';
import { activationClaimInput } from './activationInput';
import type { ProductSetup } from './productQr';

export interface InventoryDevice {
  deviceId: number; deviceUid: string; unitId: number | null; name: string; state: string;
  generation: number; setupReady: boolean; doorClosed: boolean | null; latchReleased: boolean | null;
  lastSeenAt: string | null; operationUuid: string | null;
}
export interface ClaimPreview { deviceUid: string; name: string; online: boolean; }
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
