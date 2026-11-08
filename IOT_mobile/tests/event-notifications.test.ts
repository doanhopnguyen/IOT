import assert from 'node:assert/strict';
import test from 'node:test';
import { EventNotifications, isCriticalNotification, nextNotification, updateNotificationQueue } from '../src/services/notificationService';
import type { AlertDto } from '../src/services/api/alertService';

const event = (id: number): AlertDto => ({ id, accessUnit: { id: 3, name: 'Door' }, device: { id: 9, name: 'Device' }, eventType: 'OFFLINE', severity: 'WARNING', status: 'OPEN', message: 'Offline', occurredAt: '2026-10-07T08:00:00' });
test('unread events prompt on opening the app; each event notifies once per session', async () => {
  const service = new EventNotifications();
  assert.deepEqual((await service.observe([event(1)])).map(e => e.id), [1]);
  assert.deepEqual((await service.observe([event(2), event(1)])).map(e => e.id), [2]);
  assert.deepEqual(await service.observe([event(2), event(1)]), []);
  service.reset(); assert.deepEqual((await service.observe([event(3)])).map(e => e.id), [3]);
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
test('unresolved wrong-PIN alerts prompt on the first snapshot, resolved history stays silent', async () => {
  const service = new EventNotifications();
  const pin: AlertDto = { ...event(5), eventType: 'REPEATED_WRONG_PIN', severity: 'CRITICAL' };
  assert.deepEqual((await service.observe([{ ...event(1), status: 'ACKNOWLEDGED' }, pin, { ...pin, id: 6, status: 'RESOLVED' }])).map(e => e.id), [5]);
  assert.deepEqual(await service.observe([pin]), []);
});
test('queued popups retain the current event and every new event without duplicates', () => {
  const current = event(1), next = event(2), third = event(3);
  const pending = updateNotificationQueue([current], [third, next], [third, next, current]);
  assert.deepEqual(pending.map(item => item.id), [1, 2, 3]);
  assert.deepEqual(updateNotificationQueue(pending, [next], [third, next, current]).map(item => item.id), [1, 2, 3]);
  assert.deepEqual(updateNotificationQueue(pending, [], [third, next]).map(item => item.id), [1, 2, 3]);
});
test('a resolved PIN popup is removed while ordinary incident updates stay readable until closed', () => {
  const pin: AlertDto = { ...event(1), eventType: 'REPEATED_WRONG_PIN' };
  const normal = event(2);
  const pending = updateNotificationQueue([pin, normal], [], [{ ...pin, status: 'RESOLVED' }, { ...normal, status: 'RESOLVED' }]);
  assert.deepEqual(pending.map(item => [item.id, item.status]), [[2, 'RESOLVED']]);
});
test('critical incidents interrupt normal banners without dropping the queued notifications', () => {
  const normal = event(1), warning = event(2), critical = { ...event(3), severity: 'CRITICAL' as const };
  const pending = updateNotificationQueue([normal, warning], [critical], [critical, warning, normal]);
  assert.equal(nextNotification(pending)?.id, 3);
  assert.equal(nextNotification(pending.filter(item => item.id !== 3))?.id, 1);
  assert.deepEqual(pending.map(item => item.id), [1, 2, 3]);
  assert.equal(isCriticalNotification(normal), false);
  assert.equal(isCriticalNotification(critical), true);
  assert.equal(isCriticalNotification({ ...event(4), eventType: 'REPEATED_WRONG_PIN' }), true);
});
