import test from 'node:test';
import assert from 'node:assert/strict';
import { resetComplete, resetOnline, resetService, validateReset } from '../src/services/api/resetService';
import { setApiBaseUrl } from '../src/services/api/client';
import type { InventoryDevice } from '../src/components/ActivationWizard';

const uid = 'ESP32-AABBCCDDEEFF';
const input = { password: 'AccountPassword!', adminPin: '654321', confirmation: uid, recipientEmail: '' };
const device: InventoryDevice = { deviceId: 1, deviceUid: uid, unitId: 7, name: 'Door', state: 'ACTIVE', generation: 1,
  setupReady: true, doorClosed: true, latchReleased: false, lastSeenAt: '2026-11-06T14:00:00Z', operationUuid: null };

test('factory reset requires account password, a six-digit admin PIN and exact device confirmation', () => {
  assert.equal(validateReset(uid, input), null);
  for (const adminPin of ['', '12345', '1234567', 'abcdef', ' 654321', '６５４３２１'])
    assert.ok(validateReset(uid, { ...input, adminPin }));
  assert.ok(validateReset(uid, { ...input, password: '' }));
  assert.ok(validateReset(uid, { ...input, confirmation: 'another door' }));
});
test('factory reset never reports completion from a queued request, timeout or released unit alone', () => {
  assert.equal(resetComplete({ ...device, state: 'RESETTING', operationUuid: 'reset' }), false);
  assert.equal(resetComplete({ ...device, state: 'CLAIMED', operationUuid: 'reset' }), false);
  assert.equal(resetComplete({ ...device, state: 'INVENTORY', unitId: null }), false);
  assert.equal(resetComplete({ ...device, state: 'INVENTORY', operationUuid: 'reset' }), false);
  assert.equal(resetComplete({ ...device, state: 'INVENTORY', operationUuid: 'reset', unitId: null }), true);
});
test('offline and stale devices cannot start reset from the app', () => {
  const now = Date.parse('2026-11-06T14:00:30Z');
  assert.equal(resetOnline(device, now), true);
  assert.equal(resetOnline(device, now + 90000), false);
  assert.equal(resetOnline({ ...device, lastSeenAt: null }, now), false);
  assert.equal(resetOnline({ ...device, lastSeenAt: 'bad timestamp' }, now), false);
});
test('reset API sends both credentials only in the POST body and surfaces a wrong credential error', async () => {
  setApiBaseUrl('http://reset.test');
  const oldFetch = globalThis.fetch;
  const seen: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => {
    seen.push({ url: String(url), init });
    return String(url).endsWith('/csrf') ? new Response(JSON.stringify({ token: 'test-csrf' }), { status: 200 })
      : new Response('{}', { status: 403 });
  }) as typeof fetch;
  try {
    await assert.rejects(resetService.reset(uid, input), /Mật khẩu tài khoản hoặc PIN admin chưa đúng/);
    const call = seen.find(c => c.url.endsWith('/reset'))!;
    assert.ok(call); assert.equal(call.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(call.init?.body)), input);
    assert.ok(!call.url.includes(input.password) && !call.url.includes(input.adminPin));
  } finally { globalThis.fetch = oldFetch; }
});
