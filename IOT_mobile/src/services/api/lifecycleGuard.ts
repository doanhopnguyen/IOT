import { isDeviceReadOnly, lifecycleNotice, type DeviceLifecycle } from './deviceState';

type Read = <T>(path: string) => Promise<T>;
export async function guardUnitMutation(unitId: number, read: Read) {
  const rows = await read<{ unitId: number; lifecycleStatus?: DeviceLifecycle }[]>('/api/units');
  const current = rows.find(row => row.unitId === unitId);
  if (!current) throw new Error('Bạn không còn quyền thao tác cửa này.');
  if (isDeviceReadOnly(current.lifecycleStatus)) throw new Error(lifecycleNotice(current.lifecycleStatus));
}
export function needsLifecycleGuard(path: string, method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method) && !/\/enrollments\/[^/]+\/cancel$/.test(path) &&
    /^\/api\/(?:manager\/units\/\d+(?:\/|$)|activation\/devices\/[^/]+\/)/.test(path);
}
/** Fetch current lifecycle at the callback boundary; never trust a screen's cached device. */
export async function guardDeviceMutation(path: string, method: string, read: Read) {
  if (!needsLifecycleGuard(path, method)) return;
  const unit = /^\/api\/manager\/units\/(\d+)(?:\/|$)/.exec(path);
  const device = /^\/api\/activation\/devices\/([^/]+)\//.exec(path);
  if (!unit && !device) return;
  let status: DeviceLifecycle | undefined;
  if (unit) {
    await guardUnitMutation(Number(unit[1]), read);
    return;
  } else {
    status = (await read<{ lifecycleStatus?: DeviceLifecycle }>(`/api/activation/devices/${device![1]}`)).lifecycleStatus;
  }
  if (isDeviceReadOnly(status)) throw new Error(lifecycleNotice(status));
}
