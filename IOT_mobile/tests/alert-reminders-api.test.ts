import assert from 'node:assert/strict';
import test from 'node:test';
import { alertService, type AlertDto } from '../src/services/api/alertService';
import { setApiBaseUrl } from '../src/services/api/client';

test('reminders load every unresolved page and deduplicate overlapping event IDs without writes', async () => {
  const original = globalThis.fetch;
  setApiBaseUrl('http://reminders.test');
  const requests: number[] = [];
  const event = (id: number): AlertDto => ({ id, severity: 'CRITICAL', status: 'ACKNOWLEDGED', eventType: 'SENSOR_FAULT', occurredAt: '2026-01-01T00:00:00', accessUnit: { id: 1, name: 'Door' }, device: { id: 1, name: 'ESP32' }, message: null });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/alerts/unresolved'); assert.equal(init?.method ?? 'GET', 'GET');
    const page = Number(url.searchParams.get('page')); requests.push(page);
    return Response.json({ items: page === 0 ? Array.from({ length: 100 }, (_, i) => event(i + 1)) : [event(100), event(101)], hasNext: page === 0 });
  };
  try {
    const result = await alertService.unresolved();
    assert.deepEqual(requests, [0, 1]); assert.equal(result.length, 101); assert.equal(result.at(-1)?.id, 101);
  } finally { globalThis.fetch = original; }
});
