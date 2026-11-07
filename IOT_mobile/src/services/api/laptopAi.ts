export function doorPairingCode(unitId: number): string {
  if (!Number.isSafeInteger(unitId) || unitId <= 0) throw new Error('Cửa chưa có mã kết nối.');
  return `SD-${String(unitId).padStart(6, '0')}`;
}
