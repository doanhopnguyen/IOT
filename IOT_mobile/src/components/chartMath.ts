/**
 * Chiều cao cột (px) theo giá trị lớn nhất: giá trị lớn nhất = 100% chiều cao.
 * Toàn 0 (hoặc rỗng) trả toàn 0, không chia cho 0. Giá trị âm/không hữu hạn coi như 0.
 */
export function barHeights(values: number[], height: number, max?: number): number[] {
  const clean = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
  const top = max !== undefined && max > 0 ? max : Math.max(0, ...clean);
  if (top <= 0) return clean.map(() => 0);
  return clean.map(v => Math.round((Math.min(v, top) / top) * height));
}

/** RSSI (dBm, −100..−30) → 0..100 để vẽ cột "độ mạnh sóng". */
export function rssiStrength(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0;
  return Math.max(0, Math.min(100, Math.round(((dbm + 100) / 70) * 100)));
}
