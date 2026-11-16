import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOwnerSettings, type UnitDto } from '../src/services/api/unitService';
import type { InventoryDevice } from '../src/services/api/activationService';

const owner: UnitDto = { unitId: 1, unitName: 'Cửa nhà riêng', role: 'OWNER', online: false, memberCount: 2,
  canRemoteUnlock: false, lastSeenAt: null, lifecycleStatus: 'ACTIVE', deviceUid: 'ESP32-DOOR-001' };
const inventory: InventoryDevice = { deviceId: 7, deviceUid: owner.deviceUid!, unitId: owner.unitId, name: owner.unitName,
  state: 'ACTIVE', generation: 1, setupReady: true, doorClosed: null, latchReleased: null, lastSeenAt: null, operationUuid: null,
  lifecycleStatus: 'ACTIVE' };

test('owner settings can show an existing controller when activation inventory is empty', async () => {
  const data = await loadOwnerSettings(1, undefined, async () => [owner], async () => []);
  assert.equal(data.unit, owner);
  assert.equal(data.device, undefined);
  assert.equal(data.unit.online, false);
  assert.equal('setupReady' in data.unit, false); // A visible menu must not invent hardware readiness.
});

test('inventory remains authoritative for setup and reset when a matching record exists', async () => {
  const data = await loadOwnerSettings(1, inventory.deviceUid, async () => [owner], async uid => {
    assert.equal(uid, inventory.deviceUid); return [inventory];
  });
  assert.equal(data.device, inventory);
});

test('latest unit lifecycle is retained even when inventory reports an older active lifecycle', async () => {
  for (const lifecycleStatus of ['SUSPENDED', 'DECOMMISSIONED'] as const) {
    const data = await loadOwnerSettings(1, undefined, async () => [{ ...owner, lifecycleStatus }], async () => [inventory]);
    assert.equal(data.unit.lifecycleStatus, lifecycleStatus);
  }
});

test('member access, removed ownership and unrelated device records cannot supply owner controls', async () => {
  for (const units of [[], [{ ...owner, role: 'USER' as const }]]) {
    await assert.rejects(loadOwnerSettings(1, undefined, async () => units, async () => [inventory]), /quyền quản lý/);
  }
  const data = await loadOwnerSettings(1, undefined, async () => [owner], async () => [{ ...inventory, deviceUid: 'OTHER-CONTROLLER' }]);
  assert.equal(data.device, undefined);
});
