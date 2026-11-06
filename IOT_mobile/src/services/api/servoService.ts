import { request } from './client';
import type { CommandDto } from './managerService';
export interface ServoAngles { lockAngle: number | null; openAngle: number | null; }
export function validateServoAngles(lockAngle: number, openAngle: number): string | null {
  return [lockAngle, openAngle].every(value => Number.isInteger(value) && value >= 5 && value <= 175)
    ? null : 'Mỗi góc cần là số nguyên từ 5° đến 175°.';
}
export function stepServoAngle(value: string, delta: number): string {
  if (!/^\d+$/.test(value) || !Number.isInteger(Number(value))) return value;
  return String(Math.max(5, Math.min(175, Number(value) + delta)));
}
export const servoService = {
  get(unitId: number) { return request<ServoAngles>(`/api/manager/units/${unitId}/servo`); },
  set(unitId: number, lockAngle: number, openAngle: number) {
    const error = validateServoAngles(lockAngle, openAngle);
    if (error) throw new Error(error);
    return request<CommandDto>(`/api/manager/units/${unitId}/servo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lockAngle, openAngle }),
    });
  },
};
