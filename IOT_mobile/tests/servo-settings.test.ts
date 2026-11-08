import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServoAngle, stepServoAngle, validateServoAngles, servoDirection, servoService } from '../src/services/api/servoService';
import { ServoPreviewQueue, type ServoJog } from '../src/services/api/servoPreview';
test('lock stays zero and both opening directions support five-degree steps', () => {
  for (const open of [-180, -15, -10, -5, 0, 5, 10, 15, 180]) {
    assert.equal(validateServoAngles(0, open), null);
    assert.equal(parseServoAngle(String(open)), open);
    assert.ok(validateServoAngles(5, open));
  }
  let negative = '0', positive = '0';
  for (let i = 1; i <= 3; i++) {
    negative = stepServoAngle(negative, -5); positive = stepServoAngle(positive, 5);
    assert.equal(negative, String(-5 * i)); assert.equal(positive, String(5 * i));
  }
  assert.equal(stepServoAngle('-180', -5), '-180');
  assert.equal(stepServoAngle('180', 5), '180');
  assert.equal(stepServoAngle('-5', 5), '0');
  assert.equal(stepServoAngle('0', 5), '5');
});

test('zero retains the selected opening direction; mismatched signs and 360 are rejected', () => {
  assert.equal(servoDirection(0, -1), -1);
  assert.equal(servoDirection(0, 1), 1);
  assert.equal(validateServoAngles(0, 0, 180, -1), null);
  assert.ok(validateServoAngles(0, -5, 180, 1));
  assert.ok(validateServoAngles(0, 5, 180, -1));
  assert.ok(validateServoAngles(0, 30, 360));
  assert.throws(() => servoService.preview(7, 'LOCK', 5));
  assert.throws(() => servoService.set(7, 5, -30));
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
test('rapid servo jogs send the first and latest target without replaying obsolete taps', async () => {
  const gate = deferred(), sent: ServoJog[] = [];
  const queue = new ServoPreviewQueue(async jog => { sent.push(jog); if (sent.length === 1) await gate.promise; }, async () => {}, error => assert.fail(String(error)));
  queue.submit({ target: 'LOCK', angle: 101 });
  queue.submit({ target: 'LOCK', angle: 102 });
  queue.submit({ target: 'OPEN', angle: 89 });
  assert.equal(sent.length, 1);
  gate.resolve(); await queue.flush();
  assert.deepEqual(sent, [{ target: 'LOCK', angle: 101 }, { target: 'OPEN', angle: 89 }]);
});
test('leaving cancels unsent motion, waits for the active request, then stops the device', async () => {
  const gate = deferred(), events: string[] = [];
  const queue = new ServoPreviewQueue(async jog => { events.push(String(jog.angle)); await gate.promise; }, async () => { events.push('stop'); }, error => assert.fail(String(error)));
  await queue.stop(); assert.deepEqual(events, []); // Mounting never moves or stops a different session.
  queue.submit({ target: 'LOCK', angle: 101 });
  queue.submit({ target: 'LOCK', angle: 102 });
  const closing = queue.close(); assert.deepEqual(events, ['101']);
  gate.resolve(); await closing;
  queue.submit({ target: 'LOCK', angle: 103 }); await queue.flush();
  assert.deepEqual(events, ['101', 'stop']);
});
test('a failed jog discards queued work and permits a fresh explicit retry', async () => {
  const gate = deferred(), sent: number[] = [], errors: unknown[] = [];
  const queue = new ServoPreviewQueue(async jog => {
    sent.push(jog.angle);
    if (sent.length === 1) { await gate.promise; throw new Error('offline'); }
  }, async () => {}, error => { errors.push(error); });
  queue.submit({ target: 'OPEN', angle: 89 }); queue.submit({ target: 'OPEN', angle: 88 });
  gate.resolve(); await queue.flush(); assert.equal(errors.length, 1); assert.deepEqual(sent, [89]);
  queue.submit({ target: 'OPEN', angle: 87 }); await queue.flush(); assert.deepEqual(sent, [89, 87]);
});
test('servo rejects fractions, nonnumbers and overtravel', () => {
  for (const value of ['', '-', '+', '1.5', '-181', '181', '360', 'Infinity']) assert.equal(parseServoAngle(value), null);
  for (const angle of [-181, 181, 90.5, NaN]) assert.ok(validateServoAngles(0, angle));
  assert.equal(stepServoAngle('', 5), '');
});
