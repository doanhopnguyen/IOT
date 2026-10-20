import type { Door } from '../../models/domain';
import { request } from './client';
export interface UnitDto {
  unitId: number; unitName: string; role: 'OWNER' | 'USER'; online: boolean;
  memberCount: number; canRemoteUnlock: boolean; lastSeenAt: string | null;
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
// Backend chưa lưu trạng thái khóa, nên mặc định LOCKED.
export function toDoor(unit: UnitDto): Door {
  return {
    id: String(unit.unitId), name: unit.unitName, role: unit.role,
    connectivity: unit.online ? 'ONLINE' : 'OFFLINE', lockState: 'LOCKED',
    members: unit.memberCount, canRemoteUnlock: unit.canRemoteUnlock,
    lastUpdate: unit.lastSeenAt ? new Date(unit.lastSeenAt).toLocaleString('vi-VN') : 'Chưa kết nối',
  };
}
