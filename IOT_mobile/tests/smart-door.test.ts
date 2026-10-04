import assert from 'node:assert/strict';
import test from 'node:test';
import { Door } from '../src/models/domain';
import { smartDoorService } from '../src/services/mockSmartDoorService';
import { canManageDoor, canRemoteUnlock, canViewAccessHistory } from '../src/utils/permissions';

const ownerDoor: Door = { id: 'owner', name: 'Cửa thử nghiệm', role: 'OWNER', connectivity: 'ONLINE', lockState: 'LOCKED', members: 1, canRemoteUnlock: true, lastUpdate: 'vừa xong' };
const sharedDoor: Door = { ...ownerDoor, id: 'shared', role: 'USER', canRemoteUnlock: false };

test('quyền được xác định theo từng cửa, không phải vai trò toàn cục', () => {
  assert.equal(canManageDoor(ownerDoor), true);
  assert.equal(canManageDoor(sharedDoor), false);
  assert.equal(canViewAccessHistory(ownerDoor), true);
  assert.equal(canViewAccessHistory(sharedDoor), false);
});

test('mở cửa từ xa cần quyền rõ ràng và thiết bị trực tuyến', () => {
  assert.equal(canRemoteUnlock(ownerDoor), true);
  assert.equal(canRemoteUnlock({ ...ownerDoor, connectivity: 'OFFLINE' }), false);
  assert.equal(canRemoteUnlock(sharedDoor), false);
});

test('tạm khóa thành viên không xóa hồ sơ của họ', async () => {
  const before = await smartDoorService.listMembers();
  const target = before.find(member => member.id === 'p-2');
  if (!target) throw new Error('Không tìm thấy thành viên mẫu');
  await smartDoorService.toggleMember(target.id);
  const after = await smartDoorService.listMembers();
  const changed = after.find(member => member.id === target.id);
  assert.equal(after.length, before.length);
  assert.equal(changed?.access, 'SUSPENDED');
  assert.equal(changed?.sync, 'PENDING');
});

test('chấp nhận lời mời mới cấp cửa chia sẻ', async () => {
  const invitations = await smartDoorService.listInvitations();
  const pending = invitations.find(invitation => invitation.status === 'PENDING');
  if (!pending) throw new Error('Không tìm thấy lời mời đang chờ');
  const before = await smartDoorService.listDoors();
  await smartDoorService.respondInvitation(pending.id, true);
  const after = await smartDoorService.listDoors();
  assert.equal((await smartDoorService.listInvitations()).find(i => i.id === pending.id)?.status, 'ACCEPTED');
  assert.equal(after.length, before.length + 1);
});
