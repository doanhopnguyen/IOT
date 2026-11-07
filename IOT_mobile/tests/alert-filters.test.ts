import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertDateRange, alertQuery, parseAlertDate } from '../src/services/api/alertFilters';

test('date presets include today and cross month/year boundaries using local dates', () => {
  const today = new Date(2026, 0, 3, 0, 15);
  assert.deepEqual(alertDateRange(1, today), { from: '2026-01-03', to: '2026-01-03' });
  assert.deepEqual(alertDateRange(7, today), { from: '2025-12-28', to: '2026-01-03' });
  assert.deepEqual(alertDateRange(30, today), { from: '2025-12-05', to: '2026-01-03' });
  assert.equal(parseAlertDate('29/02/2024'), '2024-02-29');
  assert.equal(parseAlertDate('29/02/2025'), undefined);
  assert.equal(parseAlertDate('31/04/2026'), undefined);
});

test('list and statistics send identical user, severity and calendar date filters', () => {
  const filters = { from: '2026-11-01', to: '2026-11-07', relatedUserId: 42, severity: 'CRITICAL' as const };
  const list = new URLSearchParams(alertQuery(filters));
  const stats = new URLSearchParams(alertQuery(filters, true));
  for (const key of ['relatedUserId', 'severity']) assert.equal(list.get(key), stats.get(key));
  assert.equal(list.get('from'), '2026-11-01T00:00:00');
  assert.equal(list.get('to'), '2026-11-07T23:59:59.999');
  assert.equal(stats.get('from'), '2026-11-01');
  assert.equal(stats.get('to'), '2026-11-07');
  assert.equal(new URLSearchParams(alertQuery({ from: filters.from, to: filters.to })).has('relatedUserId'), false);
});
