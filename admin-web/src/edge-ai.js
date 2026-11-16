export const isEdge = (device) => device.deviceType === 'FACE_CAMERA_NODE';

export function mergeDevices(inventory, edges) {
  return [...inventory.map(d => ({ ...d, deviceType: 'DOOR_CONTROLLER' })), ...edges];
}

export function edgeHealth(device, now = Date.now()) {
  if (device.lifecycleStatus === 'DECOMMISSIONED') return 'Đã thu hồi';
  if (device.lifecycleStatus === 'SUSPENDED') return 'Đã tạm ngừng';
  if (device.awaitingPairing) return 'Chờ chủ cửa ghép';
  const age = value => value ? now - new Date(value).getTime() : Infinity;
  const fresh = value => Number.isFinite(age(value)) && age(value) >= -5000 && age(value) < 90000;
  if (!fresh(device.lastSeenAt)) return 'Mất kết nối';
  if (!fresh(device.reportedAt)) return 'Chưa có báo cáo AI mới';
  if (device.cameraStatus === 'NO_SIGNAL') return 'Mất tín hiệu camera';
  if (device.recognitionStatus === 'ERROR') return 'AI gặp lỗi';
  if (device.cameraStatus === 'READY' && device.recognitionStatus === 'READY' && fresh(device.lastFrameAt))
    return 'Sẵn sàng nhận diện';
  return 'Đang chờ / chưa sẵn sàng';
}
