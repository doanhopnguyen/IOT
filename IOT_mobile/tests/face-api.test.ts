import assert from 'node:assert/strict';
import test from 'node:test';
import { createFaceService, faceRequestLabel } from '../src/services/api/faceService';

const sample = { model: 'buffalo_l/w600k_r50:v1', embedding: Array.from({length: 512}, (_, i) => i === 0 ? 1 : 0) };

test('face enrollment requires explicit consent and real account/unit IDs before transport', () => {
  let called = false;
  const service = createFaceService(async <T>() => { called = true; return {} as T; });
  assert.throws(() => service.create({ ...sample, unitId: 1, consent: false }), /đồng ý/);
  assert.throws(() => service.create({ ...sample, unitId: 0, consent: true }), /không hợp lệ/);
  assert.throws(() => service.create({ ...sample, unitId: 1, accountId: -1, consent: true }), /không hợp lệ/);
  assert.equal(called, false);
});

test('app enrollment sends a 512D vector and consent, never photos', async () => {
  const calls: { path: string; method?: string; body?: unknown }[] = [];
  const service = createFaceService(async <T>(path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return { id: 31 } as T;
  });
  const created = await service.create({ ...sample, unitId: 2, accountId: 7, consent: true });
  await service.decide(created.id, true);
  assert.deepEqual(calls, [
    { path: '/api/faces/requests', method: 'POST', body: { ...sample, unitId: 2, accountId: 7, consent: true } },
    { path: '/api/faces/requests/31/decision', method: 'POST', body: { approved: true } },
  ]);
});

test('API denial is surfaced; the frontend does not mark a request successful or use mock data', async () => {
  const service = createFaceService(async () => { throw new Error('Access denied'); });
  await assert.rejects(service.list(2), /Access denied/);
  await assert.rejects(service.memberProfile(2, 9), /Access denied/);
});

test('profile reuse and revocation are global while a manager views a member within one unit', async () => {
  const calls: { path: string; method?: string }[] = [];
  const service = createFaceService(async <T>(path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method });
    return { hasTemplate: true, credentialId: 4, model: 'buffalo_l/w600k_r50:v1' } as T;
  });
  assert.equal((await service.profile()).hasTemplate, true);
  await service.memberProfile(2, 9);
  await service.revoke();
  assert.deepEqual(calls, [
    { path: '/api/faces/me', method: undefined },
    { path: '/api/faces/accounts/9?unitId=2', method: undefined },
    { path: '/api/faces/me', method: 'DELETE' },
  ]);
});

test('approval activates the sample already captured by the app', () => {
  assert.match(faceRequestLabel({status: 'PENDING'}), /chờ chủ cửa duyệt/);
  assert.match(faceRequestLabel({status: 'APPROVED'}), /quét lại trong app/);
  assert.equal(faceRequestLabel({status: 'COMPLETED'}), 'Đã duyệt đăng ký khuôn mặt');
  assert.equal(faceRequestLabel({status: 'REJECTED'}), 'Đã từ chối hoặc hủy');
});
