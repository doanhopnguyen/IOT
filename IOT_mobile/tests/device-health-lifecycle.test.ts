import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceHealthRows, type DeviceHealth } from '../src/services/api/deviceHealth';
import { isDeviceReadOnly, sortUsableDevicesFirst } from '../src/services/api/deviceState';
import { guardDeviceMutation } from '../src/services/api/lifecycleGuard';
import { canRemoteLock, canRemoteUnlock, canManageMembers } from '../src/utils/permissions';
import type { Door } from '../src/models/domain';

const now = Date.now();
const health: DeviceHealth = { online: true, lastSeenAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  metrics: { moduleHealthSupported: 'true', fingerReady: 'true', rfidReady: 'false', doorClosed: 'true', wifiSsid: 'Test network', rssi: '-62' } };
test('health distinguishes module responses, unsupported checks, unverified reed and stale data', () => {
  const rows = deviceHealthRows(health, now);
  assert.match(rows[2][1], /có phản hồi/);
  assert.match(rows[3][1], /Không phản hồi/);
  assert.match(rows[4][1], /Chưa xác định/);
  assert.match(rows[5][1], /Chưa hỗ trợ/);
  assert.match(deviceHealthRows({ ...health, metrics: { fingerReady: 'true' } }, now)[2][1], /Chưa hỗ trợ/);
  for (const stale of [{ ...health, online: false }, { ...health, updatedAt: new Date(now - 90001).toISOString() }]) {
    const values = deviceHealthRows(stale, now);
    assert.match(values[2][1], /Chưa xác định/);
    assert.match(values[3][1], /Chưa xác định/);
    assert.doesNotMatch(values[1][1], /Test network/);
  }
});
test('lifecycle sorting is stable and never removes devices or groups maintenance with suspended devices', () => {
  const input = [
    { id: 1, lifecycleStatus: 'SUSPENDED' as const }, { id: 2, lifecycleStatus: 'MAINTENANCE' as const },
    { id: 3, lifecycleStatus: 'DECOMMISSIONED' as const }, { id: 4, lifecycleStatus: 'ACTIVE' as const }, { id: 5 },
  ];
  assert.deepEqual(sortUsableDevicesFirst(input).map(d => d.id), [2, 4, 5, 1, 3]);
  assert.deepEqual(input.map(d => d.id), [1, 2, 3, 4, 5]);
  assert.equal(isDeviceReadOnly('MAINTENANCE'), false);
});
test('permissions reject disabled lifecycle even with stale remote permission flags', () => {
  const door: Door = { id: '1', name: 'Door', role: 'OWNER', connectivity: 'ONLINE', lockState: 'LOCKED', members: 1, canRemoteUnlock: true, canRemoteLock: true, lastUpdate: '' };
  for (const lifecycleStatus of ['SUSPENDED', 'DECOMMISSIONED'] as const) {
    const disabled = { ...door, lifecycleStatus };
    assert.equal(canRemoteUnlock(disabled), false); assert.equal(canRemoteLock(disabled), false); assert.equal(canManageMembers(disabled), false);
  }
  assert.equal(canRemoteUnlock({ ...door, lifecycleStatus: 'ACTIVE' }), true);
});
test('every owner mutation refreshes lifecycle; read-only actions and cancellation remain accessible', async () => {
  let status = 'SUSPENDED', reads = 0;
  const read = async <T,>(_path: string): Promise<T> => { reads++; return [{ unitId: 4, lifecycleStatus: status }] as T; };
  for (const path of ['unlock', 'lock', 'pin', 'admin-pin', 'servo', 'wifi-setup', 'camera-node/pair', 'firmware', 'settings', 'users/2/fingerprints', 'users/2/rfids']) {
    await assert.rejects(guardDeviceMutation('/api/manager/units/4/' + path, 'POST', read), /tạm ngưng/);
  }
  const count = reads;
  await guardDeviceMutation('/api/manager/units/4/health', 'GET', read);
  await guardDeviceMutation('/api/auth/logout', 'POST', read);
  await guardDeviceMutation('/api/manager/units/4/enrollments/uuid/cancel', 'POST', read);
  assert.equal(reads, count);
  status = 'ACTIVE'; await guardDeviceMutation('/api/manager/units/4/servo', 'PUT', read);
  status = 'DECOMMISSIONED'; await assert.rejects(guardDeviceMutation('/api/manager/units/4/servo', 'PUT', read), /thu hồi/);
});
