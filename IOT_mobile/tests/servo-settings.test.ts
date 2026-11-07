import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertServoRange, displayServoAngle, parseServoAngle, stepServoAngle, validateServoAngles } from '../src/services/api/servoService';
import { ServoPreviewQueue, type ServoJog } from '../src/services/api/servoPreview';
test('servo allows equal angles and crossing them while adjusting', () => {
  for (const pair of [[105, 100], [100, 100], [95, 100], [5, 5], [175, 175]]) {
    assert.equal(validateServoAngles(pair[0], pair[1]), null);
  }
  assert.equal(stepServoAngle('105', -5), '100');
  assert.equal(stepServoAngle('100', -5), '95');
});
test('centered negative angles preserve physical positions and clamp instead of wrapping', () => {
  for (let angle = 5; angle <= 175; angle++) {
    assert.equal(parseServoAngle(displayServoAngle(angle, true), true), angle);
    assert.equal(validateServoAngles(angle, 101), null);
  }
  assert.equal(parseServoAngle('-1', true), 89);
  assert.equal(parseServoAngle('+1', true), 91);
  assert.equal(stepServoAngle('0', -1, true), '-1');
  assert.equal(stepServoAngle('-85', -1, true), '-85');
  assert.equal(stepServoAngle('85', 1, true), '85');
  assert.equal(stepServoAngle('101', 1), '102');
  for (const value of ['', '-', '1.5', '-86', '86', '360', 'Infinity']) assert.equal(parseServoAngle(value, true), null);
});
test('positional 360 profile has distinct 1-degree steps, signed coordinates and matching saved angles', () => {
  for (let angle = 5; angle <= 355; angle++) assert.equal(parseServoAngle(displayServoAngle(angle, true, 360), true, 360), angle);
  assert.equal(parseServoAngle('-1', true, 360), 179);
  assert.equal(stepServoAngle('0', -1, true, 360), '-1');
  assert.equal(stepServoAngle('355', 1, false, 360), '355');
  assert.equal(stepServoAngle('-175', -1, true, 360), '-175');
  assert.equal(validateServoAngles(201, 179, 360), null);
  assert.ok(validateServoAngles(356, 179, 360));
  assert.equal(convertServoRange(100, 180, 360), 200);
  assert.equal(convertServoRange(30, 180, 360), 60);
  assert.equal(convertServoRange(201, 360, 180), 101);
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
test('servo rejects fractions, nonnumbers and angles outside device limits', () => {
  for (const pair of [[4, 90], [90, 176], [90.5, 90], [NaN, 90]]) assert.ok(validateServoAngles(pair[0], pair[1]));
  assert.equal(stepServoAngle('5', -5), '5'); assert.equal(stepServoAngle('175', 5), '175');
  assert.equal(stepServoAngle('', 5), '');
});
