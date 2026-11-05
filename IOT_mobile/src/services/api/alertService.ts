import { PageResponse, Reference, request } from './client';
export interface AlertDto {
  id: number; accessUnit: Reference | null; device: Reference; eventType: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL'; status: 'NONE' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string | null; occurredAt: string;
}
export const alertService = {
  list(page = 0, severity?: AlertDto['severity']) {
    return request<PageResponse<AlertDto>>(`/api/alerts?page=${page}${severity ? `&severity=${severity}` : ''}`);
  },
  detail(id: number) { return request<AlertDto>(`/api/alerts/${id}`); },
  /** OPEN→ACKNOWLEDGED (đã xem) hoặc OPEN/ACKNOWLEDGED→RESOLVED (đã xử lý). */
  setStatus(id: number, status: 'ACKNOWLEDGED' | 'RESOLVED', transport?: typeof fetch) {
    return request<AlertDto>(`/api/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }, transport);
  },
};
