import { apiUrl, request } from './client';

export interface DailyAccessDto { day: string; granted: number; denied: number; }
export interface TelemetryPointDto { at: string; value: string; unit: string; }
export interface UnitSettingsDto {
  unlockDurationSec: number; doorOpenTimeoutSec: number; remoteUnlockEnabled: boolean;
  rfidEnabled: boolean; fingerprintEnabled: boolean;
}
/** Khoảng hợp lệ giống backend (UnitSettingsService). */
export const SETTINGS_LIMITS = { unlockDurationSec: [1, 30], doorOpenTimeoutSec: [10, 600] } as const;

type Transport = typeof fetch;
const json = (body: unknown): RequestInit => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const base = (unitId: number) => `/api/manager/units/${unitId}`;

export const statsService = {
  dailyAccess(unitId: number, days = 7, transport?: Transport) {
    return request<DailyAccessDto[]>(`${base(unitId)}/stats/access?days=${days}`, {}, transport);
  },
  telemetry(unitId: number, metric: string, from?: string, to?: string, transport?: Transport) {
    const query = new URLSearchParams({ metric });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    return request<TelemetryPointDto[]>(`${base(unitId)}/telemetry?${query.toString()}`, {}, transport);
  },
  settings(unitId: number, transport?: Transport) {
    return request<UnitSettingsDto>(`${base(unitId)}/settings`, {}, transport);
  },
  updateSettings(unitId: number, patch: Partial<UnitSettingsDto>, transport?: Transport) {
    return request<UnitSettingsDto>(`${base(unitId)}/settings`, json(patch), transport);
  },
  /** Link tải CSV; trình duyệt gửi kèm cookie phiên vì cùng site với backend. */
  csvUrl(unitId: number) { return apiUrl(`${base(unitId)}/access-logs.csv`); },
};

/** Trả thông báo lỗi tiếng Việt nếu giá trị cài đặt ngoài khoảng, ngược lại null. */
export function validateSettings(patch: Partial<UnitSettingsDto>): string | null {
  const [uMin, uMax] = SETTINGS_LIMITS.unlockDurationSec;
  const [dMin, dMax] = SETTINGS_LIMITS.doorOpenTimeoutSec;
  const u = patch.unlockDurationSec, d = patch.doorOpenTimeoutSec;
  if (u !== undefined && (!Number.isInteger(u) || u < uMin || u > uMax)) return `Thời gian mở khóa phải từ ${uMin} đến ${uMax} giây.`;
  if (d !== undefined && (!Number.isInteger(d) || d < dMin || d > dMax)) return `Ngưỡng cảnh báo cửa mở phải từ ${dMin} đến ${dMax} giây.`;
  return null;
}
