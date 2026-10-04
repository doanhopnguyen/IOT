import { Door } from '../models/domain';
export const canManageDoor = (door: Door) => door.role === 'OWNER';
export const canManageMembers = canManageDoor;
export const canRemoteUnlock = (door: Door) => door.canRemoteUnlock && door.connectivity === 'ONLINE';
export const canViewAccessHistory = (door: Door) => door.role === 'OWNER' || door.canRemoteUnlock;
