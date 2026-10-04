import { AccessLog, Door, Invitation, Person, VerificationRequest } from '../models/domain';

let doors: Door[] = [
  { id: 'home', name: 'Cửa nhà riêng', role: 'OWNER', connectivity: 'ONLINE', lockState: 'LOCKED', members: 4, canRemoteUnlock: true, lastUpdate: 'Vừa xong' },
  { id: 'office', name: 'Cửa văn phòng', role: 'USER', connectivity: 'ONLINE', lockState: 'LOCKED', members: 12, canRemoteUnlock: true, lastUpdate: '2 phút trước' },
  { id: 'garage', name: 'Cửa nhà xe', role: 'OWNER', connectivity: 'OFFLINE', lockState: 'LOCKED', members: 2, canRemoteUnlock: false, lastUpdate: '18 phút trước' },
];
let invitations: Invitation[] = [{ id: 'inv-1', owner: 'Nguyễn Văn A', doorName: 'Cửa nhà riêng', status: 'PENDING' }];
let members: Person[] = [
  { id: 'me', name: 'Nguyễn Văn A', hasAccount: true, methods: ['PIN', 'Khuôn mặt'], access: 'ACTIVE', sync: 'SYNCED' },
  { id: 'p-2', name: 'Nguyễn Văn B', hasAccount: true, methods: ['Khuôn mặt'], access: 'ACTIVE', sync: 'SYNCED' },
  { id: 'p-3', name: 'Trần Văn C', hasAccount: false, methods: ['Khuôn mặt'], access: 'SUSPENDED', sync: 'PENDING' },
];
let verificationRequests: VerificationRequest[] = [];
const delay = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
export const smartDoorService = {
  async listDoors() { await delay(); return [...doors]; },
  async listMembers() { await delay(); return [...members]; },
  async listInvitations() { await delay(); return [...invitations]; },
  async toggleMember(id: string) { await delay(); members = members.map(m => m.id === id ? { ...m, access: m.access === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', sync: 'PENDING' } : m); return members; },
  async removeMember(id: string) { await delay(); members = members.filter(m => m.id !== id); return members; },
  async createMember(input: { name: string; hasAccount: boolean }) { await delay(); const member: Person = { id: `person-${Date.now()}`, name: input.name, hasAccount: input.hasAccount, methods: [], access: 'ACTIVE', sync: 'PENDING' }; members = [...members, member]; return member; },
  async registerDevice(input: { code: string; wifi: string; name: string }) { await delay(650); if (input.code.length < 6) throw new Error('Mã đăng ký không hợp lệ'); const door: Door = { id: `door-${Date.now()}`, name: input.name, role: 'OWNER', connectivity: 'ONLINE', lockState: 'LOCKED', members: 1, canRemoteUnlock: true, lastUpdate: 'Vừa đăng ký' }; doors = [...doors, door]; return door; },
  async submitVerification(input: Omit<VerificationRequest, 'id' | 'status' | 'createdAt'>) { await delay(); verificationRequests = [{ ...input, id: `verify-${Date.now()}`, status: 'PENDING', createdAt: 'Vừa xong' }, ...verificationRequests]; return verificationRequests[0]; },
  async listVerificationRequests(doorId?: string) { await delay(); return verificationRequests.filter(request => !doorId || request.doorId === doorId); },
  async resolveVerification(id: string, approved: boolean) { await delay(); verificationRequests = verificationRequests.map(request => request.id === id ? { ...request, status: approved ? 'APPROVED' : 'REJECTED' } : request); return verificationRequests; },
  async respondInvitation(id: string, accepted: boolean) { await delay(); const invitation = invitations.find(item => item.id === id); invitations = invitations.map(i => i.id === id ? { ...i, status: accepted ? 'ACCEPTED' : 'DECLINED' } : i); if (accepted && invitation) doors = [...doors, { id: 'shared-' + id, name: invitation.doorName, role: 'USER', connectivity: 'ONLINE', lockState: 'LOCKED', members: 3, canRemoteUnlock: false, lastUpdate: 'Vừa xong' }]; return invitations; },
  async unlock(door: Door, pin: string): Promise<'SUCCESS' | 'FAILED' | 'OFFLINE'> { await delay(700); if (door.connectivity === 'OFFLINE') return 'OFFLINE'; return pin === '123456' ? 'SUCCESS' : 'FAILED'; },
  async logs(): Promise<AccessLog[]> { await delay(); return [{ id: 'l1', person: 'Nguyễn Văn B', door: 'Cửa nhà riêng', method: 'Khuôn mặt', time: 'Hôm nay, 08:42', success: true }, { id: 'l2', person: 'Trần Văn C', door: 'Cửa nhà riêng', method: 'Khuôn mặt', time: 'Hôm nay, 07:16', success: false }]; },
};
