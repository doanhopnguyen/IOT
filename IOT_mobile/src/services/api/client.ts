const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
let authorization: string | undefined;

// TODO auth owner: call this with the session Authorization value after login and clear on logout.
export function setApiAuthorization(value?: string) {
  authorization = value;
}
export function apiUrl(path: string) {
  if (!baseUrl) throw new Error('Chưa cấu hình EXPO_PUBLIC_API_BASE_URL tới backend.');
  return `${baseUrl}${path}`;
}
export async function request<T>(path: string, init: RequestInit = {}, transport: typeof fetch = fetch): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (authorization) headers.set('Authorization', authorization);
    const response = await transport(apiUrl(path), { ...init, headers, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Chưa có phiên backend hợp lệ hoặc bạn không có quyền truy cập.');
      const body: unknown = await response.json().catch(() => null);
      const message = body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string' ? body.detail : `Backend trả lỗi ${response.status}`;
      throw new Error(message);
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Backend không phản hồi trong 20 giây. Vui lòng thử lại.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export interface PageResponse<T> { items: T[]; page: number; size: number; totalElements: number; hasNext: boolean; }
export interface Reference { id: number; name: string; }
export function backendDoorId(id: string): number {
  let value = id;
  // Explicit temporary demo mapping only; leave other screens and their mock doors untouched.
  if (!/^[1-9]\d*$/.test(value) && process.env.EXPO_PUBLIC_DEMO_DOOR_IDS && typeof __DEV__ !== 'undefined' && __DEV__) {
    const mapping: unknown = JSON.parse(process.env.EXPO_PUBLIC_DEMO_DOOR_IDS);
    if (mapping && typeof mapping === 'object' && id in mapping) value = String((mapping as Record<string, unknown>)[id]);
  }
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Cửa này đang dùng ID mock. Cần module thiết bị cung cấp accessUnitId thật để lấy lịch sử.');
  return Number(value);
}
