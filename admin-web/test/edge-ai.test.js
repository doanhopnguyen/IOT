import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDevices, isEdge, edgeHealth } from '../src/edge-ai.js';

test('edge nodes appear alongside controllers and retain their identity and transitions', () => {
  const edges = [{deviceUid:'FACE-1', deviceType:'FACE_CAMERA_NODE', allowedTransitions:['SUSPENDED']}];
  const rows = mergeDevices([{deviceUid:'ESP32-1'}], edges);
  assert.equal(rows.length, 2);
  assert.equal(isEdge(rows[0]), false);
  assert.equal(isEdge(rows[1]), true);
  assert.deepEqual(rows[1].allowedTransitions, ['SUSPENDED']);
});

test('heartbeat alone does not mean camera and recognition are ready', () => {
  const now = Date.now();
  const fresh = new Date(now - 1000).toISOString();
  const edge = {lifecycleStatus:'ACTIVE', lastSeenAt:fresh};
  assert.equal(edgeHealth(edge, now), 'Chưa có báo cáo AI mới');
  Object.assign(edge, {reportedAt:fresh, cameraStatus:'READY', recognitionStatus:'READY', lastFrameAt:fresh});
  assert.equal(edgeHealth(edge, now), 'Sẵn sàng nhận diện');
  assert.equal(edgeHealth({...edge, cameraStatus:'NO_SIGNAL'}, now), 'Mất tín hiệu camera');
  assert.equal(edgeHealth({...edge, lastFrameAt:null}, now), 'Đang chờ / chưa sẵn sàng');
  assert.equal(edgeHealth({...edge, lifecycleStatus:'SUSPENDED'}, now), 'Đã tạm ngừng');
  assert.equal(edgeHealth({...edge, lifecycleStatus:'DECOMMISSIONED'}, now), 'Đã thu hồi');
  assert.equal(edgeHealth(edge, now + 100000), 'Mất kết nối');
});

test('admin-issued kit waiting for the owner is not reported as a lost connection', () => {
  const kit = {lifecycleStatus:'REGISTERED', awaitingPairing:true, lastSeenAt:null};
  assert.equal(edgeHealth(kit), 'Chờ chủ cửa ghép');
  assert.equal(edgeHealth({...kit, lifecycleStatus:'DECOMMISSIONED'}), 'Đã thu hồi');
});
