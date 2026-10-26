import assert from 'node:assert/strict';
import test from 'node:test';
import { alignment, averageSamples, detections, normalize, similarity, type Point } from '../src/services/face/faceMath';

test('alignment recovers a rotated and scaled face without mirroring landmarks', () => {
  const target: Point[] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
  const source = target.map(([x, y]) => [2 * x - y + 150, x + 2 * y + 60] as Point);
  const transform = alignment(source);
  source.forEach(([x, y], i) => {
    assert.ok(Math.abs(transform.a * x - transform.b * y + transform.tx - target[i][0]) < 1e-8);
    assert.ok(Math.abs(transform.b * x + transform.a * y + transform.ty - target[i][1]) < 1e-8);
  });
});

test('three consistent samples normalize together and samples from different people are rejected', () => {
  const first = normalize(Array.from({length: 512}, (_, i) => i === 0 ? 1 : 0));
  const near = normalize(first.map((x, i) => x + (i === 1 ? .1 : 0)));
  const other = normalize(first.map((_, i) => i === 2 ? 1 : 0));
  const average = averageSamples([first, near, first]);
  assert.ok(similarity(average, first) > .99);
  assert.ok(Math.abs(similarity(average, average) - 1) < 1e-6);
  assert.throws(() => averageSamples([first, near, other]), /cùng một người/);
  assert.throws(() => normalize(new Array(512).fill(0)), /đặc trưng/);
  assert.throws(() => normalize(new Array(512).fill(NaN)), /không hợp lệ/);
});

test('SCRFD suppresses duplicate anchors while retaining a second person', () => {
  const outputs = [8, 16, 32].map(stride => new Float32Array((640 / stride) ** 2 * 2));
  for (const stride of [8, 16, 32]) outputs.push(new Float32Array((640 / stride) ** 2 * 2 * 4));
  for (const stride of [8, 16, 32]) outputs.push(new Float32Array((640 / stride) ** 2 * 2 * 10));
  for (const index of [(20 * 80 + 20) * 2, (20 * 80 + 20) * 2 + 1, (50 * 80 + 50) * 2]) {
    outputs[0][index] = .9;
    outputs[3].fill(5, index * 4, index * 4 + 4);
  }
  assert.equal(detections(outputs, 1).length, 2);
  assert.equal(detections(outputs.map(x => new Float32Array(x.length)), 1).length, 0);
});
