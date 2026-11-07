import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockdownCopy } from '../src/utils/lockdown';
import { setApiBaseUrl } from '../src/services/api/client';
import { managerService } from '../src/services/api/managerService';

test('copy for a door working normally', () => {
  assert.deepEqual(lockdownCopy(false), {
    title: 'Cửa đang hoạt động bình thường',
    button: 'Tạm khóa cửa',
    confirm: 'Mọi người sẽ không mở được cửa, trừ vân tay và thẻ của bạn. Tạm khóa?',
  });
});

test('copy for a door locked by its owner', () => {
  assert.deepEqual(lockdownCopy(true), {
    title: 'Cửa đang tạm khóa',
    button: 'Mở khóa cửa',
    confirm: 'Thành viên sẽ mở cửa lại được như bình thường. Mở khóa?',
  });
});

test('lockdown calls hit the owner lockdown endpoint', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  try {
    setApiBaseUrl('http://lockdown.test:8080');
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/auth/csrf')) return Response.json({ token: 'csrf' });
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (!init?.method || init.method === 'GET') return Response.json({ lockedDown: true });
      return Response.json({ commandUuid: 'c-1', status: 'PENDING', resultMessage: null }, { status: 202 });
    };
    assert.deepEqual(await managerService.lockdownStatus(7), { lockedDown: true });
    assert.equal((await managerService.startLockdown(7)).commandUuid, 'c-1');
    assert.equal((await managerService.endLockdown(7)).commandUuid, 'c-1');
    assert.deepEqual(calls, [
      'GET http://lockdown.test:8080/api/manager/units/7/lockdown',
      'POST http://lockdown.test:8080/api/manager/units/7/lockdown',
      'DELETE http://lockdown.test:8080/api/manager/units/7/lockdown',
    ]);
  } finally { globalThis.fetch = original; }
});
