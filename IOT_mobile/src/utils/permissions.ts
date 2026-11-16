import { Door } from '../models/domain';
import { isDeviceReadOnly } from '../services/api/deviceState';
export const canManageDoor = (door: Door) => door.role === 'OWNER';
export const canManageMembers = (door: Door) => canManageDoor(door) && !isDeviceReadOnly(door.lifecycleStatus);
export const canRemoteUnlock = (door: Door) => !isDeviceReadOnly(door.lifecycleStatus) && door.canRemoteUnlock && door.connectivity === 'ONLINE';
export const canRemoteLock = (door: Door) => !isDeviceReadOnly(door.lifecycleStatus) && (door.canRemoteLock ?? door.canRemoteUnlock) && door.connectivity === 'ONLINE';
export const canViewAccessHistory = (door: Door) => door.role === 'OWNER' || door.canRemoteUnlock;
