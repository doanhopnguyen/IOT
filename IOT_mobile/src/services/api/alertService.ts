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
};
