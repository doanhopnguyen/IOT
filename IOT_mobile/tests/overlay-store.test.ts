import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OverlayStore } from '../src/services/overlayStore';

test('notifications stay above existing dialogs and dialogs opened or updated afterward', () => {
  const store = new OverlayStore<string>();
  store.set('settings', 0, 'draft');
  store.set('notification', 100, 'wrong PIN');
  store.set('confirmation', 0, 'confirm');
  store.set('settings', 0, 'updated draft');
  assert.equal(store.getSnapshot().at(-1)?.id, 'notification');
  store.remove('notification');
  assert.equal(store.getSnapshot().at(-1)?.id, 'confirmation');
  store.remove('confirmation');
  assert.equal(store.getSnapshot().at(-1)?.value, 'updated draft');
});
test('snapshots stay cached until an actual change and removed dialogs cannot reappear', () => {
  const store = new OverlayStore<object>();
  const value = {}, events: number[] = [];
  const unsubscribe = store.subscribe(() => events.push(store.getSnapshot().length));
  store.set('form', 0, value);
  const snapshot = store.getSnapshot();
  store.set('form', 0, value); store.remove('missing');
  assert.equal(store.getSnapshot(), snapshot);
  store.remove('form');
  assert.deepEqual(events, [1, 0]);
  assert.equal(store.getSnapshot().length, 0);
  unsubscribe();store.set('notification', 100, {});
  assert.deepEqual(events, [1, 0]);
});
