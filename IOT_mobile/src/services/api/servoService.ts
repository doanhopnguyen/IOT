import { request } from './client';
import type { CommandDto } from './managerService';
export type ServoRange = 180 | 360;
export type ServoDirection = -1 | 1;
export interface ServoAngles { lockAngle: number | null; openAngle: number | null; servoRange?: ServoRange; openDirection?: ServoDirection; }
export type ServoTarget = 'LOCK' | 'OPEN';
export function parseServoAngle(value: string): number | null {
  if (!/^[+-]?\d+$/.test(value)) return null;
  const angle = Number(value);
  return Number.isInteger(angle) && angle >= -180 && angle <= 180 ? angle : null;
}
export function servoDirection(angle: number, current: ServoDirection = 1): ServoDirection {
  return angle === 0 ? current : angle < 0 ? -1 : 1;
}
export function validateServoAngles(lockAngle: number, openAngle: number, range: ServoRange = 180, direction: ServoDirection = servoDirection(openAngle)): string | null {
  return range === 180 && lockAngle === 0 && Number.isInteger(openAngle) && openAngle >= -180 && openAngle <= 180 &&
    (direction === 1 || direction === -1) && servoDirection(openAngle, direction) === direction
    ? null : 'Khóa cố định 0°. Góc mở từ −180° đến +180° và phải đúng chiều đã chọn.';
}
export function stepServoAngle(value: string, delta: number): string {
  const angle = parseServoAngle(value);
  if (angle == null || !Number.isInteger(delta)) return value;
  return String(Math.max(-180, Math.min(180, angle + delta)));
}
export const servoService = {
  get(unitId: number) { return request<ServoAngles>(`/api/manager/units/${unitId}/servo`); },
  set(unitId: number, lockAngle: number, openAngle: number, servoRange: ServoRange = 180, openDirection: ServoDirection = servoDirection(openAngle)) {
    const error = validateServoAngles(lockAngle, openAngle, servoRange, openDirection);
    if (error) throw new Error(error);
    return request<CommandDto>(`/api/manager/units/${unitId}/servo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lockAngle, openAngle, servoRange, openDirection }),
    });
  },
  preview(unitId: number, target: ServoTarget, angle: number, servoRange: ServoRange = 180, openDirection: ServoDirection = servoDirection(angle)) {
    const error = validateServoAngles(0, angle, servoRange, openDirection);
    if (error || (target === 'LOCK' && angle !== 0)) throw new Error(error || 'Góc khóa luôn là 0°.');
    return request<CommandDto>(`/api/manager/units/${unitId}/servo/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, angle, servoRange, openDirection }),
    });
  },
  stopPreview(unitId: number) {
    return request<CommandDto>(`/api/manager/units/${unitId}/servo/preview/stop`, { method: 'POST' });
  },
};
