import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupInstruction, validateSetupPins, type SetupStatus } from '../src/services/api/setupService';
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
  assert.match(setupInstruction({ ...pinsReady, ready: true }), /Đã hoàn tất/);
});
test('offline instructions retain local authentication and allow on-chip calibration to continue', () => {
  const text = setupInstruction({ ...status, online: false });
  assert.match(text,/PIN\/thẻ\/vân tay đã lưu vẫn mở được/);
  assert.match(text,/tiếp tục theo màn hình chip/);
});
