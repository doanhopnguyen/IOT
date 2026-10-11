import { PageResponse, Reference, request } from './client';
export interface AccessLogDto {
  id: number; accessUnit: Reference; device: Reference; account: Reference | null;
  method: 'FACE' | 'FINGERPRINT' | 'RFID' | 'PIN' | 'REMOTE_UNLOCK';
  result: 'GRANTED' | 'DENIED' | 'ERROR'; reasonCode: string | null; occurredAt: string;
}
export const accessLogService = {
  list(accessUnitId: number, page = 0, days = 1) {
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    // Backend stores local DATETIME, without timezone. Preserve the local wall clock.
    const local = new Date(from.getTime() - from.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    return request<PageResponse<AccessLogDto>>(`/api/access-logs?accessUnitId=${accessUnitId}&page=${page}&from=${encodeURIComponent(local)}`);
  },
};
