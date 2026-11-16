import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { authService } from '../src/services/api/authService';
import { ApiError, clearCsrf, getApiBaseUrl, refreshCsrf, request, setApiBaseUrl } from '../src/services/api/client';

const originalFetch = globalThis.fetch;
const originalBase = getApiBaseUrl();
const account = { accountId: 42, fullName: 'Nguyễn An', email: 'an@example.test', phone: null, admin: false, status: 'ACTIVE' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stalledFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'));
  if (init?.signal?.aborted) abort();
  else init?.signal?.addEventListener('abort', abort, { once: true });
});

beforeEach(() => { setApiBaseUrl('http://auth.test:8080'); clearCsrf(); });
afterEach(() => { globalThis.fetch = originalFetch; setApiBaseUrl(originalBase); clearCsrf(); });

test('CSRF acquisition times out instead of keeping login/register pending forever', async () => {
  globalThis.fetch = stalledFetch;
  await assert.rejects(refreshCsrf(20), /Dịch vụ chưa phản hồi/);
  globalThis.fetch = async () => response({ token: 'fresh-token' });
  await refreshCsrf(1000); // A timeout must not prevent an explicit retry.
});

test('POST waiting for its first CSRF token also has a timeout and never submits credentials', async () => {
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    paths.push(new URL(String(input)).pathname);
    return stalledFetch(input, init);
  };
  await assert.rejects(request('/api/auth/login', { method: 'POST' }, fetch, 20), /Dịch vụ chưa phản hồi/);
  assert.deepEqual(paths, ['/api/auth/csrf']);
});

test('switching servers aborts pending CSRF and does not reuse its token', async () => {
  let oldSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (input, init) => { oldSignal = init?.signal; return stalledFetch(input, init); };
  const pending = refreshCsrf();
  setApiBaseUrl('http://new-auth.test:8080');
  await assert.rejects(pending, /Máy chủ đã thay đổi/);
  assert.equal(oldSignal?.aborted, true);
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(url.host, 'new-auth.test:8080');
    if (url.pathname === '/api/auth/csrf') return response({ token: 'new-server-token' });
    assert.equal(new Headers(init?.headers).get('X-CSRF-TOKEN'), 'new-server-token');
    return response(account);
  };
  await request('/api/auth/login', { method: 'POST' });
  assert.deepEqual(paths, ['/api/auth/csrf', '/api/auth/login']);
});

test('login sends session cookies and CSRF, then refreshes the rotated token', async () => {
  const paths: string[] = [];
  let csrfCount = 0;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    assert.equal(init?.credentials, 'include');
    if (path === '/api/auth/csrf') return response({ token: ++csrfCount === 1 ? 'before-login' : 'after-login' });
    assert.equal(path, '/api/auth/login');
    assert.equal(new Headers(init?.headers).get('X-CSRF-TOKEN'), 'before-login');
    assert.deepEqual(JSON.parse(String(init?.body)), { identifier: 'an@example.test', password: 'TestPassword123!' });
    return response(account);
  };
  assert.deepEqual(await authService.login(' an@example.test ', 'TestPassword123!'), account);
  assert.deepEqual(paths, ['/api/auth/csrf', '/api/auth/login', '/api/auth/csrf']);
});

test('register submits trimmed fields after CSRF and surfaces duplicate-account errors', async () => {
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).pathname === '/api/auth/csrf') return response({ token: 'register-token' });
    assert.equal(init?.credentials, 'include');
    assert.equal(new Headers(init?.headers).get('X-CSRF-TOKEN'), 'register-token');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      fullName: 'Nguyễn An', email: 'an@example.test', phone: null, password: 'TestPassword123!',
    });
    return response(account);
  };
  const input = { fullName: ' Nguyễn An ', email: ' an@example.test ', phone: ' ', password: 'TestPassword123!' };
  assert.deepEqual(await authService.register(input), account);
  globalThis.fetch = async input => new URL(String(input)).pathname === '/api/auth/csrf'
    ? response({ token: 'register-token' }) : response({ message: 'Duplicate account' }, 409);
  await assert.rejects(authService.register(input), /đã được sử dụng/);
});

test('missing/invalid CSRF and network errors fail clearly instead of submitting an unprotected POST', async () => {
  for (const body of [{}, { token: '' }, { token: ' ' }]) {
    globalThis.fetch = async () => response(body);
    await assert.rejects(refreshCsrf(), /mã bảo vệ phiên hợp lệ/);
  }
  globalThis.fetch = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(refreshCsrf(), /Không kết nối được máy chủ/);
  globalThis.fetch = async () => response({}, 403);
  await assert.rejects(refreshCsrf(), error => error instanceof ApiError && error.status === 403);
});
