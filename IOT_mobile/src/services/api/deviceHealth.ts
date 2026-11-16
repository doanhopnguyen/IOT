import { recentHeartbeat } from './deviceState';
export interface DeviceHealth {
  online: boolean; lastSeenAt: string | null; updatedAt: string | null; metrics: Record<string, string>;
}
export function deviceHealthRows(health?: DeviceHealth, now = Date.now()) {
  const fresh = !!health?.online && recentHeartbeat(health.lastSeenAt, now) && recentHeartbeat(health.updatedAt, now);
  const m = fresh ? health!.metrics : {};
  const responsive = (name: string) => !fresh ? 'Chưa xác định (dữ liệu cũ hoặc mất kết nối)'
    : m.moduleHealthSupported !== 'true' ? 'Chưa hỗ trợ kiểm tra'
    : m[name] === 'true' ? 'Sẵn sàng · có phản hồi' : m[name] === 'false' ? 'Không phản hồi' : 'Chưa xác định';
  return [
    ['ESP32', health?.online && recentHeartbeat(health.lastSeenAt, now) ? 'Online' : 'Offline / chưa có heartbeat'],
    ['Wi-Fi', fresh ? `${m.wifiSsid ?? 'Chưa xác định SSID'}${m.rssi ? ` · ${m.rssi} dBm` : ''}` : 'Chưa xác định'],
    ['AS608 · Vân tay', responsive('fingerReady')],
    ['RC522 · RFID/NFC', responsive('rfidReady')],
    ['Cảm biến cửa', m.doorCalibrated === 'true' && ['true', 'false'].includes(m.doorClosed)
      ? m.doorClosed === 'true' ? 'Đang đóng' : 'Đang mở' : 'Chưa xác định / chưa xác nhận cảm biến'],
    ['Servo', 'Chưa hỗ trợ kiểm tra phản hồi cơ khí'],
    ['TFT / Touch', 'Chưa hỗ trợ kiểm tra'],
  ];
}
