import type { Door } from '../../models/domain';
import { ApiError, request } from './client';
import type { InventoryDevice } from './activationService';
import type { DeviceLifecycle } from './deviceState';
import { isDeviceReadOnly } from './deviceState';
export interface UnitDto {
  unitId: number; unitName: string; role: 'OWNER' | 'USER'; online: boolean;
  memberCount: number; canRemoteUnlock: boolean; lastSeenAt: string | null;
  canRemoteLock?: boolean;
  lifecycleStatus?: DeviceLifecycle;
  doorClosed?: boolean | null; latchReleased?: boolean | null; activationState?: string; deviceUid?: string;
}
export const unitService = {
  listMine() { return request<UnitDto[]>('/api/units'); },
  create(unitName: string, deviceCode: string) {
    return request<UnitDto>('/api/units', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitName, deviceCode }),
    });
  },
  leave(unitId: number) { return request<void>(`/api/units/${unitId}/membership`, { method: 'DELETE' }); },
};

/** Existing doors can have a controller without an activation inventory record. Keep both sources distinct. */
export async function loadOwnerSettings(unitId: number, deviceUid?: string,
  readUnits: () => Promise<UnitDto[]> = unitService.listMine,
  readDevices: (uid?: string) => Promise<InventoryDevice[]> = uid => uid
    ? request<InventoryDevice>(`/api/activation/devices/${encodeURIComponent(uid)}`).then(device => [device])
    : request<InventoryDevice[]>('/api/activation/mine')) {
  const [units, devices] = await Promise.all([readUnits(), readDevices(deviceUid)]);
  const unit = units.find(row => row.unitId === unitId && row.role === 'OWNER');
  if (!unit) throw new ApiError('Bạn không còn quyền quản lý cửa này.', 403);
  const device = devices.find(row => row.unitId === unitId && (!unit.deviceUid || row.deviceUid === unit.deviceUid));
  return { unit, device };
}
// A closed leaf and a completed lock command are both required for LOCKED.
export function toDoor(unit: UnitDto): Door {
  const online = unit.online;
  const writable = !isDeviceReadOnly(unit.lifecycleStatus);
  return {
    id: String(unit.unitId), name: unit.unitName, role: unit.role,
    connectivity: online ? 'ONLINE' : 'OFFLINE', lockState: !online ? 'UNKNOWN' : unit.doorClosed === true && unit.latchReleased === false ? 'LOCKED' : unit.doorClosed === false || unit.latchReleased === true ? 'UNLOCKED' : 'UNKNOWN',
    doorClosed: unit.doorClosed ?? null, activationState: unit.activationState, deviceUid: unit.deviceUid,
    latchReleased: unit.latchReleased ?? null,
    lifecycleStatus: unit.lifecycleStatus,
    members: unit.memberCount, canRemoteUnlock: writable && unit.canRemoteUnlock,
    canRemoteLock: writable && (unit.canRemoteLock ?? unit.canRemoteUnlock),
    lastUpdate: unit.lastSeenAt ? new Date(unit.lastSeenAt).toLocaleString('vi-VN') : 'Chưa kết nối',
  };
}
