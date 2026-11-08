import { request } from './client';
import type { CommandDto } from './managerService';

export interface FirmwareRelease {
  id: number; version: string; label: string; hardwareVersion: string; notes: string;
  sha256: string; size: number; publishedAt: string;
}
export interface FirmwareStatus {
  currentVersion: string | null; hardwareVersion: string | null; online: boolean; capable: boolean;
  available: FirmwareRelease[]; update: CommandDto | null; targetVersion: string | null;
}
export function firmwareUpdateState(status: FirmwareStatus) {
  if (status.update?.status === 'PENDING' || status.update?.status === 'SENT') return 'UPDATING';
  if (status.update?.status === 'ACKNOWLEDGED') return status.currentVersion === status.targetVersion ? 'COMPLETE' : 'RECONNECTING';
  if (status.update?.status === 'FAILED' || status.update?.status === 'TIMEOUT') return 'FAILED';
  return 'IDLE';
}
export const firmwareService = {
  status(unitId: number) { return request<FirmwareStatus>(`/api/manager/units/${unitId}/firmware`); },
  install(unitId: number, releaseId: number) {
    return request<CommandDto>(`/api/manager/units/${unitId}/firmware`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ releaseId, consent: true }),
    });
  },
};
