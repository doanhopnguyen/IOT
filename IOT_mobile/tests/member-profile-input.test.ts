import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memberContactLabel, validateMemberProfileInput } from '../src/utils/memberProfileInput';
import { setApiBaseUrl } from '../src/services/api/client';
import { managerService } from '../src/services/api/managerService';

test('trims name and room of a door-only profile', () => {
  assert.deepEqual(validateMemberProfileInput({ fullName: '  Bé Na  ', room: ' P302 ' }), {
    ok: true,
    value: { fullName: 'Bé Na', room: 'P302' },
  });
});

test('blank room is left out', () => {
  const result = validateMemberProfileInput({ fullName: 'Bé Na', room: '   ' });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.room, undefined);
});

test('name is required', () => {
  for (const fullName of ['', '   '])
    assert.deepEqual(validateMemberProfileInput({ fullName, room: '' }), { ok: false, message: 'Vui lòng nhập họ và tên.' });
});

test('name and room length match backend limits', () => {
  assert.deepEqual(validateMemberProfileInput({ fullName: 'a'.repeat(101), room: '' }), {
    ok: false, message: 'Họ và tên tối đa 100 ký tự.',
  });
  assert.equal(validateMemberProfileInput({ fullName: 'a'.repeat(100), room: '' }).ok, true);
  assert.deepEqual(validateMemberProfileInput({ fullName: 'Bé Na', room: 'r'.repeat(51) }), {
    ok: false, message: 'Phòng tối đa 50 ký tự.',
  });
});

test('member subtitle distinguishes app users, door-only profiles and legacy profiles', () => {
  assert.equal(memberContactLabel({ hasAccount: true, contact: 'a@b.vn' }), 'Có tài khoản ứng dụng');
  assert.equal(memberContactLabel({ hasAccount: false, contact: null }), 'Chỉ dùng tại cửa · vân tay, thẻ');
  assert.equal(memberContactLabel({ hasAccount: false, contact: '0912000111' }), 'Chưa đăng nhập ứng dụng · 0912000111');
});

test('creating a door-only profile posts name and room only', async () => {
  const original = globalThis.fetch;
  try {
    setApiBaseUrl('http://member-profile.test:8080');
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/auth/csrf')) return Response.json({ token: 'csrf' });
      assert.equal(String(input), 'http://member-profile.test:8080/api/manager/units/7/member-profiles');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), { fullName: 'Bé Na', room: 'P302' });
      return Response.json({ userId: 44, displayName: 'Bé Na', email: null, phone: null, room: 'P302', hasLoggedIn: false }, { status: 201 });
    };
    const user = await managerService.createMemberProfile(7, { fullName: 'Bé Na', room: 'P302' });
    assert.equal(user.userId, 44); assert.equal(user.email, null);
  } finally { globalThis.fetch = original; }
});
