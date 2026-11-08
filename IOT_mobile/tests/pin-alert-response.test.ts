import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setApiBaseUrl } from '../src/services/api/client';
import { isPinAlertActionable, respondToPinAlert, type AlertDto } from '../src/services/api/alertService';

test('PIN responses only apply to open or acknowledged PIN incidents with a door', () => {
  const pin: AlertDto = { id: 7, accessUnit: { id: 1, name: 'Door' }, device: { id: 2, name: 'ESP' }, eventType: 'REPEATED_WRONG_PIN', severity: 'CRITICAL', status: 'OPEN', message: '', occurredAt: '' };
  assert.equal(isPinAlertActionable(pin), true);
  assert.equal(isPinAlertActionable({ ...pin, status: 'ACKNOWLEDGED' }), true);
  assert.equal(isPinAlertActionable({ ...pin, status: 'RESOLVED' }), false);
  assert.equal(isPinAlertActionable({ ...pin, eventType: 'DOOR_LEFT_OPEN' }), false);
  assert.equal(isPinAlertActionable({ ...pin, accessUnit: null }), false);
});
test('both choices use the PIN endpoint and device failures never report success', async () => {
  const original = globalThis.fetch;
  let status = 'ACKNOWLEDGED';
  const choices: unknown[] = [];
  try {
    setApiBaseUrl('http://pin-alert.test');
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/auth/csrf')) return Response.json({ token: 'csrf' });
      assert.equal(String(input), 'http://pin-alert.test/api/alerts/7/pin-response');
      assert.equal(init?.method, 'POST');
      choices.push(JSON.parse(String(init?.body)));
      return Response.json({ commandUuid: 'pin-response', status, resultMessage: status === 'FAILED' ? 'STORAGE_ERROR' : null });
    };
    await respondToPinAlert(7, 'SAFE');
    await respondToPinAlert(7, 'LOCKDOWN');
    assert.deepEqual(choices, [{ action: 'SAFE' }, { action: 'LOCKDOWN' }]);
    status = 'FAILED';
    await assert.rejects(respondToPinAlert(7, 'SAFE'), /STORAGE_ERROR/);
    status = 'TIMEOUT';
    await assert.rejects(respondToPinAlert(7, 'LOCKDOWN'), /Chưa nhận được xác nhận/);
  } finally { globalThis.fetch = original; }
});
