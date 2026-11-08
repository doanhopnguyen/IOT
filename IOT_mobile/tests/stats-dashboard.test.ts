import assert from 'node:assert/strict';
import test from 'node:test';
import { barHeights, rssiStrength } from '../src/components/chartMath';
import { setApiBaseUrl } from '../src/services/api/client';
import { statsService, validateSettings } from '../src/services/api/statsService';
import { alertService } from '../src/services/api/alertService';

test('cột cao nhất bằng 100% chiều cao, toàn 0 không chia cho 0', () => {
  assert.deepEqual(barHeights([0, 5, 10], 100), [0, 50, 100]);
  assert.deepEqual(barHeights([0, 0, 0], 100), [0, 0, 0]);
  assert.deepEqual(barHeights([], 100), []);
  assert.deepEqual(barHeights([20, -3, Number.NaN], 100, 40), [50, 0, 0]);
});

test('RSSI đổi sang độ mạnh 0..100', () => {
  assert.equal(rssiStrength(-100), 0);
  assert.equal(rssiStrength(-30), 100);
  assert.equal(rssiStrength(-10), 100);
  assert.equal(rssiStrength(Number.NaN), 0);
});

test('kiểm tra khoảng cài đặt giống backend', () => {
  assert.equal(validateSettings({ unlockDurationSec: 5, doorOpenTimeoutSec: 60 }), null);
  assert.match(validateSettings({ unlockDurationSec: 0 }) ?? '', /1 đến 30/);
  assert.match(validateSettings({ unlockDurationSec: 31 }) ?? '', /1 đến 30/);
  assert.match(validateSettings({ doorOpenTimeoutSec: 9 }) ?? '', /10 đến 600/);
  assert.match(validateSettings({ doorOpenTimeoutSec: 601 }) ?? '', /10 đến 600/);
  assert.notEqual(validateSettings({ unlockDurationSec: 2.5 }), null);
  for(const value of [1,3,5,10])assert.equal(validateSettings({pinFailureLimit:value}),null);
  for(const value of [0,11,1.5,Number.NaN])assert.match(validateSettings({pinFailureLimit:value})??'',/1 đến 10/);
});

function recorder(response: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, transport };
}

test('statsService gọi đúng URL thống kê và telemetry', async () => {
  setApiBaseUrl('http://api.test');
  const r = recorder([]);
  await statsService.dailyAccess(3, 7, r.transport);
  await statsService.telemetry(3, 'rssi', undefined, undefined, r.transport);
  assert.equal(r.calls[0].url, 'http://api.test/api/manager/units/3/stats/access?days=7');
  assert.equal(r.calls[1].url, 'http://api.test/api/manager/units/3/telemetry?metric=rssi');
  assert.equal(statsService.csvUrl(3), 'http://api.test/api/manager/units/3/access-logs.csv');
});

test('cập nhật cài đặt và cảnh báo dùng PATCH với body JSON', async () => {
  setApiBaseUrl('http://api2.test');
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ token: 't' }), { status: 200 })) as typeof fetch;
  try {
    const r = recorder({});
    await statsService.updateSettings(3, { doorOpenTimeoutSec: 120, pinFailureLimit: 3 }, r.transport);
    await alertService.setStatus(9, 'RESOLVED', r.transport);
    assert.equal(r.calls[0].url, 'http://api2.test/api/manager/units/3/settings');
    assert.equal(r.calls[0].init.method, 'PATCH');
    assert.equal(r.calls[0].init.body, JSON.stringify({ doorOpenTimeoutSec: 120, pinFailureLimit: 3 }));
    assert.equal(r.calls[1].url, 'http://api2.test/api/alerts/9');
    assert.equal(r.calls[1].init.body, JSON.stringify({ status: 'RESOLVED' }));
    assert.equal(new Headers(r.calls[1].init.headers).get('X-CSRF-TOKEN'), 't');
  } finally { globalThis.fetch = realFetch; }
});
