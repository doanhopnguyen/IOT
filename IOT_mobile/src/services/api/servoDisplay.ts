// Demo calibration: the existing 0..180 command scale produces 0..90 degrees
// of observed travel. Keep commands and stored settings unchanged at the API.
export const DEMO_SERVO_MAX = 90;
export function parseDemoServoAngle(value: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const angle = Number(value);
  return angle >= 0 && angle <= DEMO_SERVO_MAX && Number.isInteger(angle * 2) ? angle : null;
}
export function commandToDemoAngle(command: number): number | null {
  return Number.isInteger(command) && command >= 0 && command <= 180 ? command / 2 : null;
}
export function demoAngleToCommand(angle: number): number | null {
  return Number.isFinite(angle) && angle >= 0 && angle <= DEMO_SERVO_MAX && Number.isInteger(angle * 2) ? angle * 2 : null;
}
export function stepDemoServoAngle(value: string, delta: number): string {
  const angle = parseDemoServoAngle(value);
  if (angle == null || !Number.isInteger(delta)) return value;
  return String(Math.max(0, Math.min(DEMO_SERVO_MAX, angle + delta)));
}
