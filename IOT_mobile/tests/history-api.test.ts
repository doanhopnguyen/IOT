import assert from 'node:assert/strict';
import test from 'node:test';
import { backendDoorId, request, setApiAuthorization } from '../src/services/api/client';

test('mock door IDs never silently request all doors; real IDs remain valid', () => {
  assert.equal(backendDoorId('3'), 3);
  for (const id of ['home', '0', '-1', '1.5', '9007199254740992']) assert.throws(() => backendDoorId(id));
});
test('API reports missing base URL instead of silently returning mock data', async () => {
  setApiAuthorization(undefined);
  if (!process.env.EXPO_PUBLIC_API_BASE_URL) await assert.rejects(request('/api/alerts'), /EXPO_PUBLIC_API_BASE_URL/);
});
