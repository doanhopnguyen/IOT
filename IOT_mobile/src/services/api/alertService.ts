import { PageResponse, Reference, request } from './client';
import { alertQuery, type AlertFilters } from './alertFilters';
export interface AlertDto {
  id: number; accessUnit: Reference | null; device: Reference; eventType: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL'; status: 'NONE' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string | null; occurredAt: string; relatedUsers?: Reference[];
}
export interface AlertStatistics {
  total: number;
  unread: number;
  urgentUnresolved: number;
  days: { date: string; info: number; warning: number; critical: number }[];
}
export const alertService = {
  users() { return request<Reference[]>('/api/alerts/users'); },
  statistics(filters: AlertFilters) {
    return request<AlertStatistics>(`/api/alerts/statistics?${alertQuery(filters, true)}`);
  },
  list(page = 0, severity?: AlertDto['severity'], filters?: AlertFilters) {
    const query = filters ? `&${alertQuery(filters)}` : severity ? `&severity=${severity}` : '';
    return request<PageResponse<AlertDto>>(`/api/alerts?page=${page}${query}`);
  },
  detail(id: number) { return request<AlertDto>(`/api/alerts/${id}`); },
  /** OPEN→ACKNOWLEDGED (đã xem) hoặc OPEN/ACKNOWLEDGED→RESOLVED (đã xử lý). */
  setStatus(id: number, status: 'ACKNOWLEDGED' | 'RESOLVED', transport?: typeof fetch) {
    return request<AlertDto>(`/api/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }, transport);
  },
};
