import assert from 'node:assert/strict';
import test from 'node:test';
import { EventNotifications } from '../src/services/notificationService';
import type { AlertDto } from '../src/services/api/alertService';

const event = (id: number): AlertDto => ({ id, accessUnit: { id: 3, name: 'Door' }, device: { id: 9, name: 'Device' }, eventType: 'OFFLINE', severity: 'WARNING', status: 'OPEN', message: 'Offline', occurredAt: '2026-10-07T08:00:00' });
test('first snapshot is silent; a new event notifies only once; reset starts a new session', async () => {
  const service = new EventNotifications();
  assert.deepEqual(await service.observe([event(1)]), []);
  assert.deepEqual((await service.observe([event(2), event(1)])).map(e => e.id), [2]);
  assert.deepEqual(await service.observe([event(2), event(1)]), []);
  service.reset(); assert.deepEqual(await service.observe([event(3)]), []);
});
test('failure of optional local notifier does not suppress in-app notification', async () => {
  const service = new EventNotifications(); service.setLocalNotifier(async () => { throw new Error('No OS permissions'); });
  await service.observe([]);
  assert.equal((await service.observe([event(4)]))[0].id, 4);
});
test('events remain deduplicated after more than 1000 IDs in one session', async () => {
  const service = new EventNotifications();
  await service.observe([event(1)]);
  await service.observe(Array.from({ length: 1001 }, (_, index) => event(index + 2)));
  assert.deepEqual(await service.observe([event(1)]), []);
});
