import { PageResponse, Reference, request } from './client';
import { alertQuery, type AlertFilters } from './alertFilters';
import { managerService, type CommandDto } from './managerService';
export type PinAlertAction = 'SAFE' | 'LOCKDOWN';
export function isPinAlertActionable(alert: AlertDto) {
  return alert.eventType === 'REPEATED_WRONG_PIN' && !!alert.accessUnit && (alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED');
}
export async function respondToPinAlert(id: number, action: PinAlertAction) {
  const command = await request<CommandDto>(`/api/alerts/${id}/pin-response`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
  const result = await managerService.waitForCommand(command, 15000, 500);
  if (result.status !== 'ACKNOWLEDGED') {
    const code = result.resultMessage;
    if (code === 'UNSUPPORTED_COMMAND') throw new Error('Cập nhật firmware 1.16.0 hoặc 2.0.3-demo để xử lý cảnh báo PIN từ app.');
    if (code === 'PIN_ALERT_ALREADY_LOCKED') throw new Error('Cửa đang tạm khóa. Gỡ tạm khóa trong cài đặt cửa trước khi cho nhập PIN trở lại.');
    throw new Error(code || 'Chưa nhận được xác nhận từ cửa. Kiểm tra kết nối rồi thử lại; thao tác chưa được xác nhận.');
  }
}
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
