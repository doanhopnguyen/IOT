import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activationClaimInput, parseActivationCode, productSetup } from '../src/services/api/activationInput';

const code = 'aBcd0123456789_ABCDEFGHIJ-klmnopqr';
test('accept the issued code or activation QR and trim form fields', () => {
  assert.deepEqual(activationClaimInput(`  ${code} `, ' Cửa nhà '), { activationCode: code, name: 'Cửa nhà' });
  assert.equal(parseActivationCode(`smartdoor://activate?code=${code}`), code);
});
test('explain that factory MAC, UID and PIN cannot claim a door', () => {
  for (const input of ['80:B5:4E:C8:14:9C', '80-B5-4E-C8-14-9C', '80B54EC8149C', 'ESP32-80B54EC8149C']) assert.throws(() => parseActivationCode(input), /MAC\/UID/);
  assert.throws(() => parseActivationCode('123456'), /Mã kích hoạt/);
});
test('reject unrelated QR URLs and missing activation codes', () => {
  for (const input of ['exp://100.111.90.116:8081', 'https://example.com/?code='+code, 'smartdoor://activate', 'smartdoor://activate/other?code='+code]) assert.throws(() => parseActivationCode(input));
});
test('validate the door name before sending a claim', () => {
  for (const name of ['', '  ', 'x'.repeat(101)]) assert.throws(() => activationClaimInput(code, name), /Tên cửa/);
});
test('product QR carries setup Wi-Fi but cannot redirect service credentials', () => {
  const uri=`smartdoor://activate?code=${code}&uid=ESP32-80B54EC8149C&ssid=SmartDoor-C8149C&key=Abcd1234_qrs&backend=https://untrusted.invalid`;
  assert.deepEqual(productSetup(uri), { activationCode: code, deviceUid:'ESP32-80B54EC8149C', ssid:'SmartDoor-C8149C', password:'Abcd1234_qrs' });
  assert.throws(()=>productSetup(uri.replace('ssid=SmartDoor-C8149C','ssid=SmartDoor-AABBCC')), /khớp/);
});
