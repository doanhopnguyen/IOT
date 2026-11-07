import type { ServoAngles } from './servoService';
export interface ServoConfirmation { angles: ServoAngles; expiresAt: number; }
export function sameServoAngles(a: ServoAngles, b: ServoAngles) {
  return a.lockAngle === b.lockAngle && a.openAngle === b.openAngle && (a.servoRange ?? 180) === (b.servoRange ?? 180);
}
export function servoSyncDecision(latest: ServoAngles, dirty: boolean, confirmation?: ServoConfirmation, now = Date.now()) {
  if (confirmation) {
    if (sameServoAngles(latest, confirmation.angles)) return 'FOLLOW';
    return now < confirmation.expiresAt ? 'WAIT' : 'CONFLICT';
  }
  if (dirty || latest.lockAngle == null || latest.openAngle == null) return 'DRAFT';
  return 'FOLLOW';
}
