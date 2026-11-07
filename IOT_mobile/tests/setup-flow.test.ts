import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupInstruction, setupPage, validateSetupPins, type SetupStatus } from '../src/services/api/setupService';
const status: SetupStatus = { online: true, ready: false, stage: 'PINS', doorPinSet: false, adminPinSet: false, touchCalibrated: false, doorCalibrated: false, wifiSsid: '', deviceUid: 'ESP32-AABBCCDDEEFF' };
test('setup requires distinct confirmed six digit pins', () => {
  const pins = { pin: '123456', confirmPin: '123456', adminPin: '654321', confirmAdminPin: '654321' };
  assert.equal(validateSetupPins(pins), null);
  assert.ok(validateSetupPins({ ...pins, adminPin: pins.pin, confirmAdminPin: pins.pin }));
  assert.ok(validateSetupPins({ ...pins, confirmPin: '000000' }));
  assert.ok(validateSetupPins({ ...pins, pin: '12345' }));
});
test('offline doors do not instruct users to proceed with setup', () => {
  assert.match(setupInstruction({ ...status, online: false }), /chưa kết nối dịch vụ/);
});
test('guides every touch point and separates closed/open sensor samples', () => {
  const pinsReady = { ...status, doorPinSet: true, adminPinSet: true };
  for (let i = 1; i < 4; i++) assert.match(setupInstruction({ ...pinsReady, stage: `TOUCH_${i}` }), new RegExp(`dấu cộng số ${i}`));
  assert.match(setupInstruction({ ...pinsReady, stage: 'TOUCH_4' }), /giữa màn hình cửa/);
  assert.match(setupInstruction({ ...pinsReady, stage: 'DOOR_CLOSED' }), /Đóng cánh cửa/);
  assert.match(setupInstruction({ ...pinsReady, stage: 'DOOR_OPEN' }), /Mở cánh cửa/);
  assert.match(setupInstruction({ ...pinsReady, stage: 'SERVO_LOCK', doorCalibrated: true }), /TEST LOCK POSITION/);
  assert.match(setupInstruction({ ...pinsReady, stage: 'SERVO_OPEN', doorCalibrated: true }), /CONFIRM OPEN \/ FINISH/);
  assert.match(setupInstruction({ ...pinsReady, ready: true, touchCalibrated: true, doorCalibrated: true, servoCalibrated: true, stage: 'READY' }), /Đã hoàn tất/);
});
test('offline instructions retain local authentication and allow on-chip calibration to continue', () => {
  const text = setupInstruction({ ...status, online: false });
  assert.match(text,/PIN\/thẻ\/vân tay đã lưu vẫn mở được/);
  assert.match(text,/tiếp tục theo màn hình chip/);
});
test('wizard advances only after each confirmed stage and resumes at the current hardware step', () => {
  assert.equal(setupPage(status), 'PINS');
  assert.equal(setupPage(status, true), 'TOUCH'); // PIN ACK arrives before heartbeat.
  let next = { ...status, doorPinSet: true, adminPinSet: true, touchCalibrated: true, stage: 'DOOR_CLOSED' };
  assert.equal(setupPage(next), 'DOOR_CLOSED');
  assert.equal(setupPage({ ...next, stage: 'DOOR_OPEN' }), 'DOOR_OPEN');
  next = { ...next, doorCalibrated: true, stage: 'SERVO_LOCK' };
  assert.equal(setupPage(next), 'SERVO_LOCK');
  assert.equal(setupPage({ ...next, stage: 'SERVO_OPEN' }), 'SERVO_OPEN');
  const calibrated = { ...next, servoCalibrated: true, stage: 'READY' };
  assert.equal(setupPage(calibrated), 'VERIFY'); // Calibrated is not backend-ready yet.
  assert.equal(setupPage({ ...calibrated, ready: true }), 'COMPLETE');
  assert.equal(setupPage({ ...next, online: false }), 'SERVO_LOCK');
});
test('a calibration stage arriving before an updated ready flag never displays a completion instruction', () => {
  const next = { ...status, ready: true, doorPinSet: true, adminPinSet: true, touchCalibrated: true, stage: 'TOUCH_1' };
  assert.equal(setupPage(next), 'TOUCH');
  assert.match(setupInstruction(next), /dấu cộng số 1/);
  assert.doesNotMatch(setupInstruction(next), /Đã hoàn tất/);
});
