import { request } from './client';
export interface UnitUserDto {
  userId: number; email: string | null; phone: string | null; displayName: string; accountStatus: 'ACTIVE' | 'DISABLED';
  allowFace: boolean; allowFingerprint: boolean; allowRfid: boolean; allowRemoteUnlock: boolean;
  // room/hasLoggedIn/deletableAccount chỉ có ý nghĩa với hồ sơ do chủ cửa tạo
  room: string | null; hasLoggedIn: boolean; deletableAccount: boolean;
}
// Tài khoản tối thiểu do chủ cửa tạo đăng nhập bằng mật khẩu mặc định này
export const DEFAULT_MEMBER_PASSWORD = '123456';
export type CommandStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMEOUT';
export interface CommandDto { commandUuid: string; status: CommandStatus; resultMessage: string | null; }
const post = (body?: unknown): RequestInit => body === undefined
  ? { method: 'POST' }
  : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
export interface UserSearchDto { id: number; email: string | null; displayName: string; status: 'ACTIVE' | 'DISABLED'; }
export const managerService = {
  listUnitUsers(unitId: number) { return request<UnitUserDto[]>(`/api/manager/units/${unitId}/users`); },
  searchUsers(keyword: string) { return request<UserSearchDto[]>(`/api/manager/users/search?keyword=${encodeURIComponent(keyword.trim())}`); },
  addUser(unitId: number, userId: number) { return request<UnitUserDto>(`/api/manager/units/${unitId}/users/${userId}`, post()); },
  // Người chưa có ứng dụng: contact là số điện thoại hoặc email, dùng để đăng nhập sau này
  createMemberProfile(unitId: number, input: { fullName: string; contact: string; room?: string }) {
    return request<UnitUserDto>(`/api/manager/units/${unitId}/member-profiles`, post(input));
  },
  removeUser(unitId: number, userId: number) { return request<void>(`/api/manager/units/${unitId}/users/${userId}`, { method: 'DELETE' }); },
  // Bật/tắt toàn bộ quyền ra vào của thành viên tại cửa này
  setAccess(unitId: number, userId: number, on: boolean) {
    return request<UnitUserDto>(`/api/manager/units/${unitId}/users/${userId}/permissions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowFingerprint: on, allowRfid: on, allowRemoteUnlock: on }),
    });
  },
  enrollFingerprint(unitId: number, userId: number, label: string) {
    return request<CommandDto>(`/api/manager/units/${unitId}/users/${userId}/fingerprints`, post({ label }));
  },
  // Gán thẻ có sẵn cho thành viên, không cần thiết bị quẹt thẻ.
  assignRfid(unitId: number, userId: number, rfidUid: string) {
    return request<{ credentialId: number; rfidUid: string }>(`/api/manager/units/${unitId}/users/${userId}/rfids`, post({ rfidUid }));
  },
  remoteUnlock(unitId: number) { return request<CommandDto>(`/api/manager/units/${unitId}/unlock`, post()); },
  commandStatus(commandUuid: string) { return request<CommandDto>(`/api/manager/commands/${commandUuid}`); },
  // Backend tự đánh TIMEOUT sau 60 giây nếu thiết bị không phản hồi.
  async waitForCommand(command: CommandDto, timeoutMs = 75000) {
    const deadline = Date.now() + timeoutMs;
    let current = command;
    while ((current.status === 'PENDING' || current.status === 'SENT') && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      current = await managerService.commandStatus(command.commandUuid);
    }
    return current;
  },
};
