export type DeviceLifecycle = 'REGISTERED' | 'PROVISIONED' | 'ACTIVE' | 'MAINTENANCE' | 'SUSPENDED' | 'DECOMMISSIONED';

export function recentHeartbeat(lastSeenAt: string | null, now = Date.now()) {
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  return Number.isFinite(seen) && seen <= now + 5000 && now - seen < 90000;
}

export function lifecycleNotice(status?: DeviceLifecycle) {
  if (status === 'SUSPENDED') return 'Thiết bị bị quản trị viên tạm ngưng. Khi nhận cấu hình này, cửa chặn cả mở từ xa và mở cục bộ; cần quản trị viên cho hoạt động lại.';
  if (status === 'MAINTENANCE') return 'Thiết bị đang bảo trì, không nhận lệnh từ xa. Quyền đã lưu trên cửa vẫn có thể mở cục bộ.';
  if (status === 'DECOMMISSIONED') return 'Thiết bị đã thu hồi vĩnh viễn. Khi nhận lệnh thu hồi, cửa xóa quyền cục bộ và ngừng phục vụ.';
  return '';
}

export function resetAvailable(device: { lifecycleStatus?: DeviceLifecycle; lastSeenAt: string | null }, now = Date.now()) {
  return (!device.lifecycleStatus || device.lifecycleStatus === 'ACTIVE') && recentHeartbeat(device.lastSeenAt, now);
}

export function reconcileSelection<T extends { id: string }>(selected: T | null, latest: T[]): T | null {
  return selected ? latest.find(item => item.id === selected.id) ?? null : null;
}
