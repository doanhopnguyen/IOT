import type { AccessLogDto } from './api/accessLogService';
import type { PageResponse, Reference } from './api/client';
import { vietnamHistoryFrom } from '../utils/vietnamTime';

export const methodLabels: Record<AccessLogDto['method'], string> = {
  PIN: 'PIN', RFID: 'RFID', FINGERPRINT: 'Vân tay', FACE: 'Khuôn mặt', REMOTE_UNLOCK: 'Mở từ xa',
};
export const resultLabels: Record<AccessLogDto['result'], string> = {
  GRANTED: 'Cho phép', DENIED: 'Từ chối', ERROR: 'Lỗi',
};
const reasonLabels: Record<string, string> = {
  NO_MATCH: 'Không tìm thấy mẫu xác thực phù hợp',
  CREDENTIAL_NOT_ACTIVE: 'Mẫu xác thực chưa hoạt động',
  UNKNOWN_FACE: 'Không nhận diện được khuôn mặt',
  FACE_DISABLED: 'Cửa chưa bật quyền khuôn mặt',
  MODEL_MISMATCH: 'Model nhận diện không khớp',
  BELOW_THRESHOLD: 'Độ tin cậy chưa đạt yêu cầu',
  LIVENESS_REQUIRED: 'Chưa xác minh được người thật',
  ACCESS_REVOKED: 'Quyền truy cập không còn hiệu lực',
  CONTROLLER_OFFLINE: 'Bộ điều khiển cửa đang ngoại tuyến',
  DOOR_BUSY: 'Cửa đang xử lý một lệnh khác',
  LOCKDOWN: 'Cửa đang tạm khóa',
  WAITING_ACK: 'Đang chờ thiết bị xác nhận',
  DEVICE_FAILED: 'Thiết bị báo không thực hiện được lệnh mở cửa',
  SEND_FAILED: 'Không gửi được lệnh đến thiết bị',
  ACK_TIMEOUT: 'Thiết bị không phản hồi kịp thời',
  LOCAL_ACCESS_DENIED: 'Thiết bị từ chối xác thực tại cửa',
  OFFLINE_CREDENTIAL_CHANGED: 'Mẫu xác thực đã thay đổi khi thiết bị mất mạng',
  DEVICE_CLOCK_UNSYNCED: 'Giờ thiết bị chưa đồng bộ, dùng giờ máy chủ',
  DEVICE_CLOCK_INVALID: 'Giờ thiết bị sai, dùng giờ máy chủ',
};
export function reasonText(code: string): string {
  return [...new Set(code.split(',').map(value => value.trim()).filter(Boolean))]
    .map(value => reasonLabels[value] ?? 'Chưa có mô tả cho lý do từ thiết bị')
    .join(' · ');
}
export function actorName(log: AccessLogDto): string {
  if (log.account?.name?.trim()) return log.account.name.trim();
  switch (log.method) {
    case 'PIN': return 'Không xác định người nhập';
    case 'RFID': return 'Thẻ RFID chưa xác định';
    case 'FINGERPRINT': return 'Vân tay chưa xác định';
    case 'FACE': return 'Chưa xác định người xác thực khuôn mặt';
    case 'REMOTE_UNLOCK': return 'Chưa xác định người yêu cầu';
    default: return 'Chưa xác định người thực hiện';
  }
}
export function referenceName(reference: Reference | null | undefined, label: string): string {
  return reference?.name?.trim() || (reference?.id != null ? `${label} #${reference.id}` : `Chưa có thông tin ${label.toLowerCase()}`);
}
export function sourceDeviceName(log: AccessLogDto): string | undefined {
  const device = referenceName(log.device, 'Thiết bị');
  return device.toLocaleLowerCase('vi-VN') === referenceName(log.accessUnit, 'Cửa').toLocaleLowerCase('vi-VN')
    ? undefined : device;
}

interface HistorySnapshot {
  items: AccessLogDto[];
  page: number;
  more: boolean;
  loading: boolean;
  error: string;
}
type LoadPage = (page: number, from: string) => Promise<PageResponse<AccessLogDto>>;

// One feed per door/filter selection. Invalidated requests cannot publish results,
// and the page advances only after success, so a failed page can be retried.
export class AccessHistoryFeed {
  private snapshot: HistorySnapshot = { items: [], page: -1, more: false, loading: true, error: '' };
  private listeners = new Set<() => void>();
  private revision = 0;
  private busy = false;
  private from = '';

  constructor(private readonly days: number, private readonly load: LoadPage) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: HistorySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }
  cancel = () => { this.revision++; this.busy = false; };
  refresh = () => {
    if (this.busy) return;
    this.from = vietnamHistoryFrom(this.days);
    return this.fetchPage(0);
  };
  loadMore = () => {
    if (this.busy || !this.snapshot.more || this.snapshot.page < 0) return;
    return this.fetchPage(this.snapshot.page + 1);
  };
  retry = () => this.snapshot.page < 0 ? this.refresh() : this.loadMore();

  private async fetchPage(page: number) {
    this.busy = true;
    const revision = ++this.revision;
    this.publish({
      ...this.snapshot, ...(page === 0 ? { items: [], page: -1, more: false } : {}),
      loading: true, error: '',
    });
    try {
      // Lets StrictMode cleanup invalidate the first mount before sending a request.
      await Promise.resolve();
      if (revision !== this.revision) return;
      const data = await this.load(page, this.from);
      if (revision !== this.revision) return;
      const items = page === 0 ? data.items : [...this.snapshot.items, ...data.items];
      this.publish({
        items: [...new Map(items.map(item => [item.id, item])).values()],
        page, more: data.hasNext, loading: false, error: '',
      });
    } catch (error: unknown) {
      if (revision !== this.revision) return;
      this.publish({ ...this.snapshot, loading: false,
        error: error instanceof Error ? error.message : 'Không tải được lịch sử.' });
    } finally {
      if (revision === this.revision) this.busy = false;
    }
  }
}
