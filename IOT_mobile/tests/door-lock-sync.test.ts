import assert from 'node:assert/strict';
import test from 'node:test';
import { toDoor, type UnitDto } from '../src/services/api/unitService';
import { canRemoteLock, canRemoteUnlock } from '../src/utils/permissions';
import { sameServoAngles, servoSyncDecision } from '../src/services/api/servoSync';

const unit: UnitDto = { unitId: 2, unitName: 'Door', role: 'OWNER', online: true, memberCount: 0,
  canRemoteUnlock: true, canRemoteLock: true, lastSeenAt: null, doorClosed: true, latchReleased: false };
test('locked requires a closed leaf and a completed lock command, with fresh online state', () => {
  assert.equal(toDoor(unit).lockState, 'LOCKED');
  assert.equal(toDoor({ ...unit, doorClosed: false }).lockState, 'UNLOCKED');
  assert.equal(toDoor({ ...unit, latchReleased: true }).lockState, 'UNLOCKED');
  assert.equal(toDoor({ ...unit, latchReleased: null }).lockState, 'UNKNOWN');
  assert.equal(toDoor({ ...unit, doorClosed: null }).lockState, 'UNKNOWN');
  assert.equal(toDoor({ ...unit, online: false }).lockState, 'UNKNOWN');
});
test('locking keeps its explicit permission even when remote unlocking is disabled', () => {
  const door = toDoor({ ...unit, canRemoteUnlock: false });
  assert.equal(canRemoteUnlock(door), false);
  assert.equal(canRemoteLock(door), true);
  assert.equal(canRemoteLock({ ...door, connectivity: 'OFFLINE' }), false);
  assert.equal(canRemoteLock({ ...door, canRemoteLock: false }), false);
});
test('servo follows device changes unless the owner is editing an unsaved draft', () => {
  const angles = { lockAngle: 201, openAngle: 179, servoRange: 360 as const };
  assert.equal(servoSyncDecision(angles, false), 'FOLLOW');
  assert.equal(servoSyncDecision(angles, true), 'DRAFT');
  assert.equal(servoSyncDecision({ lockAngle: null, openAngle: null }, false), 'DRAFT');
  assert.equal(sameServoAngles(angles, { ...angles, servoRange: 180 }), false);
});
test('a stale heartbeat cannot undo an acknowledged servo save before device confirmation arrives', () => {
  const angles = { lockAngle: 201, openAngle: 179, servoRange: 360 as const };
  const confirmation = { angles, expiresAt: 1000 };
  const old = { lockAngle: 100, openAngle: 30, servoRange: 180 as const };
  assert.equal(servoSyncDecision(old, false, confirmation, 100), 'WAIT');
  assert.equal(servoSyncDecision(angles, false, confirmation, 200), 'FOLLOW');
  assert.equal(servoSyncDecision(old, false, confirmation, 1000), 'CONFLICT');
});
