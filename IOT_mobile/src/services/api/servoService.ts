import { request } from './client';
import type { CommandDto } from './managerService';
export type ServoRange = 180 | 360;
export interface ServoAngles { lockAngle: number | null; openAngle: number | null; servoRange?: ServoRange; }
export type ServoTarget = 'LOCK' | 'OPEN';
export function parseServoAngle(value: string, centered = false, range: ServoRange = 180): number | null {
  if (!/^[+-]?\d+$/.test(value)) return null;
  const angle = Number(value) + (centered ? range / 2 : 0);
  return Number.isInteger(angle) && angle >= 5 && angle <= range - 5 ? angle : null;
}
export function displayServoAngle(angle: number, centered = false, range: ServoRange = 180): string {
  return String(angle - (centered ? range / 2 : 0));
}
export function convertServoRange(angle: number, from: ServoRange, to: ServoRange): number {
  return Math.max(5, Math.min(to - 5, Math.round(angle * to / from)));
}
export function validateServoAngles(lockAngle: number, openAngle: number, range: ServoRange = 180): string | null {
  return [lockAngle, openAngle].every(value => Number.isInteger(value) && value >= 5 && value <= range - 5)
    ? null : `Mỗi góc cần là số nguyên từ 5° đến ${range - 5}°.`;
}
export function stepServoAngle(value: string, delta: number, centered = false, range: ServoRange = 180): string {
  const physical = parseServoAngle(value, centered, range);
  if (physical == null || !Number.isInteger(delta)) return value;
  return displayServoAngle(Math.max(5, Math.min(range - 5, physical + delta)), centered, range);
}
export const servoService = {
  get(unitId: number) { return request<ServoAngles>(`/api/manager/units/${unitId}/servo`); },
  set(unitId: number, lockAngle: number, openAngle: number, servoRange: ServoRange = 180) {
    const error = validateServoAngles(lockAngle, openAngle, servoRange);
    if (error) throw new Error(error);
    return request<CommandDto>(`/api/manager/units/${unitId}/servo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lockAngle, openAngle, servoRange }),
    });
  },
  preview(unitId: number, target: ServoTarget, angle: number, servoRange: ServoRange = 180) {
    const error = validateServoAngles(angle, angle, servoRange);
    if (error) throw new Error(error);
    return request<CommandDto>(`/api/manager/units/${unitId}/servo/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, angle, servoRange }),
    });
  },
  stopPreview(unitId: number) {
    return request<CommandDto>(`/api/manager/units/${unitId}/servo/preview/stop`, { method: 'POST' });
  },
};
