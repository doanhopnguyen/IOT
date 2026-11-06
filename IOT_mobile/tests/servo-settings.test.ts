import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepServoAngle, validateServoAngles } from '../src/services/api/servoService';
test('servo allows equal angles and crossing them while adjusting', () => {
  for (const pair of [[105, 100], [100, 100], [95, 100], [5, 5], [175, 175]]) {
    assert.equal(validateServoAngles(pair[0], pair[1]), null);
  }
  assert.equal(stepServoAngle('105', -5), '100');
  assert.equal(stepServoAngle('100', -5), '95');
});
test('servo rejects fractions, nonnumbers and angles outside device limits', () => {
  for (const pair of [[4, 90], [90, 176], [90.5, 90], [NaN, 90]]) assert.ok(validateServoAngles(pair[0], pair[1]));
  assert.equal(stepServoAngle('5', -5), '5'); assert.equal(stepServoAngle('175', 5), '175');
  assert.equal(stepServoAngle('', 5), '');
});
