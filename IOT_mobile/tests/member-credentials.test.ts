import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setApiBaseUrl } from '../src/services/api/client';
import { managerService } from '../src/services/api/managerService';

test('owner credentials use the dedicated owner endpoint', async () => {
  const original = globalThis.fetch;
  try {
    setApiBaseUrl('http://owner-credentials.test:8080');
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'http://owner-credentials.test:8080/api/manager/units/7/owner-access');
      return Response.json({ userId: 42, allowFingerprint: true, allowRfid: true });
    };
    const owner = await managerService.ownerAccess(7);
    assert.equal(owner.userId, 42); assert.equal(owner.allowFingerprint, true); assert.equal(owner.allowRfid, true);
  } finally { globalThis.fetch = original; }
});

test('removing a member returns a device command instead of assuming deletion completed', async () => {
  const original = globalThis.fetch;
  try {
    setApiBaseUrl('http://member-removal.test:8080');
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/auth/csrf')) return Response.json({ token: 'csrf' });
      assert.equal(String(input), 'http://member-removal.test:8080/api/manager/units/7/users/43');
      assert.equal(init?.method, 'DELETE');
      return Response.json({ commandUuid: 'removal-uuid', status: 'PENDING', resultMessage: null }, { status: 202 });
    };
    const command = await managerService.removeUser(7, 43);
    assert.equal(command.commandUuid, 'removal-uuid'); assert.equal(command.status, 'PENDING');
  } finally { globalThis.fetch = original; }
});
