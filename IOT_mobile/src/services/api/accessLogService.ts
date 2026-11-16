import { PageResponse, Reference, request } from './client';
import { vietnamHistoryFrom } from '../../utils/vietnamTime';
export interface AccessLogDto {
  id: number; accessUnit: Reference; device: Reference; account: Reference | null;
  method: 'FACE' | 'FINGERPRINT' | 'RFID' | 'PIN' | 'REMOTE_UNLOCK';
  result: 'GRANTED' | 'DENIED' | 'ERROR'; reasonCode: string | null; occurredAt: string;
}
export interface AccessLogFilters {
  method?: AccessLogDto['method'];
  result?: AccessLogDto['result'];
  from?: string;
}
export const accessLogService = {
  list(accessUnitId: number, page = 0, days = 1, filters: AccessLogFilters = {}) {
    const query = new URLSearchParams({
      accessUnitId: String(accessUnitId), page: String(page),
      from: filters.from ?? vietnamHistoryFrom(days),
    });
    if (filters.method) query.set('method', filters.method);
    if (filters.result) query.set('result', filters.result);
    return request<PageResponse<AccessLogDto>>(`/api/access-logs?${query}`);
  },
};
