import assert from 'node:assert/strict';
import test from 'node:test';
import { lifecycleNotice, recentHeartbeat, reconcileSelection, resetAvailable } from '../src/services/api/deviceState';

test('heartbeat freshness rejects missing, stale, invalid and future timestamps', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  assert.equal(recentHeartbeat('2026-11-07T11:59:30Z', now), true);
  for (const seen of [null, 'invalid', '2026-11-07T11:58:00Z', '2026-11-07T13:00:00Z'])
    assert.equal(recentHeartbeat(seen, now), false);
  for (const lifecycleStatus of ['REGISTERED', 'PROVISIONED', 'MAINTENANCE', 'SUSPENDED', 'DECOMMISSIONED'] as const)
    assert.equal(resetAvailable({ lifecycleStatus, lastSeenAt: '2026-11-07T11:59:30Z' }, now), false);
  assert.equal(resetAvailable({ lifecycleStatus: 'ACTIVE', lastSeenAt: '2026-11-07T11:59:30Z' }, now), true);
});

test('suspension and maintenance communicate their different local access behavior', () => {
  assert.match(lifecycleNotice('SUSPENDED'), /chặn cả mở từ xa và mở cục bộ/);
  assert.match(lifecycleNotice('MAINTENANCE'), /vẫn có thể mở cục bộ/);
  assert.match(lifecycleNotice('DECOMMISSIONED'), /xóa quyền cục bộ/);
  assert.equal(lifecycleNotice('ACTIVE'), '');
});

test('revoked or reset doors and removed people cannot remain as stale selections', () => {
  const old = { id: '1', canRemoteUnlock: true };
  const next = { ...old, canRemoteUnlock: false };
  assert.equal(reconcileSelection(old, [next]), next);
  assert.equal(reconcileSelection(old, [{ id: '2', canRemoteUnlock: true }]), null);
  assert.equal(reconcileSelection(old, []), null);
  assert.equal(reconcileSelection(null, [next]), null);
});
