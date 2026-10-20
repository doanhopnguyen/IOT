const baseUrl = resolveBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, ''));
// Trên trình duyệt, cookie phiên (SameSite=Lax) chỉ được gửi khi backend cùng site với trang,
// nên dùng hostname trang đang mở (localhost:8081 → localhost:8080) thay cho IP LAN trong .env.
function resolveBaseUrl(configured?: string) {
  if (!configured || typeof document === 'undefined' || typeof window === 'undefined') return configured;
  try {
    const url = new URL(configured);
    url.hostname = window.location.hostname;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}
let authorization: string | undefined;
// Backend dùng session cookie JSESSIONID + CSRF token cho mọi request ghi dữ liệu.
let csrfToken: string | undefined;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Backend không dùng header Authorization; giữ lại cho tương thích.
export function setApiAuthorization(value?: string) {
  authorization = value;
}
export function apiUrl(path: string) {
  if (!baseUrl) throw new Error('Chưa cấu hình EXPO_PUBLIC_API_BASE_URL tới backend.');
  return `${baseUrl}${path}`;
}
// Token đổi sau khi đăng nhập, nên gọi lại sau login.
export async function refreshCsrf() {
  const response = await fetch(apiUrl('/api/auth/csrf'), { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new ApiError(`Không lấy được CSRF token (lỗi ${response.status})`, response.status);
  const body = await response.json() as { token: string };
  csrfToken = body.token;
}
export function clearCsrf() {
  csrfToken = undefined;
}
function errorMessage(body: unknown, status: number) {
  if (body && typeof body === 'object') {
    if ('message' in body && typeof body.message === 'string') return body.message;
    if ('detail' in body && typeof body.detail === 'string') return body.detail;
  }
  return `Backend trả lỗi ${status}`;
}
export async function request<T>(path: string, init: RequestInit = {}, transport: typeof fetch = fetch): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (authorization) headers.set('Authorization', authorization);
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      if (!csrfToken) await refreshCsrf();
      if (csrfToken) headers.set('X-CSRF-TOKEN', csrfToken);
    }
    const response = await transport(apiUrl(path), { ...init, headers, credentials: 'include', signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ApiError('Chưa có phiên backend hợp lệ hoặc bạn không có quyền truy cập.', response.status);
      const body: unknown = await response.json().catch(() => null);
      throw new ApiError(errorMessage(body, response.status), response.status);
    }
    if (response.status === 204) return undefined as T;
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
