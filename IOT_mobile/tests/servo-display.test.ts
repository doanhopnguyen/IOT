import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandToDemoAngle, demoAngleToCommand, parseDemoServoAngle, stepDemoServoAngle } from '../src/services/api/servoDisplay';

test('demo displays half the command angle while preserving all existing stored positions', () => {
  for (let command = 0; command <= 180; command++) {
    const display = commandToDemoAngle(command);
    assert.equal(display, command / 2);
    assert.equal(demoAngleToCommand(display!), command);
    assert.equal(parseDemoServoAngle(String(display)), display);
  }
  assert.equal(commandToDemoAngle(0), 0);
  assert.equal(commandToDemoAngle(135), 67.5);
  assert.equal(commandToDemoAngle(180), 90);
});
test('demo accepts only the positive 0..90 display scale and five-degree jogs never cross the bounds', () => {
  for (const value of ['-5', '-0', '+5', '90.5', '180', '0.1', '', '-', 'NaN', 'Infinity']) assert.equal(parseDemoServoAngle(value), null);
  for (const value of [-1, 90.5, 180, NaN, Infinity]) assert.equal(demoAngleToCommand(value), null);
  for (const value of [-5, 181, 360, NaN]) assert.equal(commandToDemoAngle(value), null);
  assert.equal(stepDemoServoAngle('0', -5), '0');
  assert.equal(stepDemoServoAngle('90', 5), '90');
  assert.equal(stepDemoServoAngle('0', 5), '5');
  assert.equal(stepDemoServoAngle('90', -5), '85');
  assert.equal(demoAngleToCommand(Number(stepDemoServoAngle('0', 5))), 10);
  assert.equal(stepDemoServoAngle('67.5', 5), '72.5');
});
