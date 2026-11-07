import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activationClaimInput, parseActivationCode, productSetup } from '../src/services/api/activationInput';
import { createProductQr, deviceDisplayName, parseScannedProductQr, wifiQrFields } from '../src/services/api/productQr';
import { activationPage, checkRestartConnection, inspectProduct } from '../src/services/api/activationService';

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
test('one product QR is a Wi-Fi QR for system cameras and an activation QR for the app', () => {
  const product = { activationCode: code, deviceUid: 'ESP32-80B54EC8149C', ssid: 'SmartDoor-C8149C', password: 'Abcd1234_qrs', name: 'Cửa nhà' };
  const qr = createProductQr(product);
  assert.match(qr, /^WIFI:T:WPA;S:SmartDoor-C8149C;P:Abcd1234_qrs;/);
  assert.deepEqual(productSetup(qr), product);
  assert.equal(parseActivationCode(qr), code);
  assert.deepEqual(activationClaimInput(qr, 'Cửa nhà'), { activationCode: code, name: 'Cửa nhà' });
  assert.equal(wifiQrFields(qr).get('S'), product.ssid);
  assert.ok(!qr.includes('http') && !qr.includes('backend') && !qr.includes('api='));
});

test('Android Wi-Fi scanner uses raw payload instead of the human-readable Wi-Fi display value', () => {
  const product = { activationCode: code, deviceUid: 'ESP32-80B54EC8149C', ssid: 'SmartDoor-C8149C', password: 'Abcd1234_qrs', name: 'Smart Door C8149C' };
  const raw = createProductQr(product);
  assert.deepEqual(parseScannedProductQr({ data: 'SmartDoor-C8149C\nAbcd1234_qrs\nWPA', raw }), product);
  assert.deepEqual(parseScannedProductQr({ data: raw }), product);
  assert.equal(parseScannedProductQr({ data: code, raw: '' }).activationCode, code);
  assert.throws(() => parseScannedProductQr({ data: code, raw: 'WIFI:T:WPA;S:Home;P:Abcd1234;;' }), /QR Wi-Fi/);
});
test('Wi-Fi fields handle escaped labels and reject duplicates, unrelated networks and missing credentials', () => {
  assert.equal(wifiQrFields('WIFI:S:SmartDoor-C8149C;P:Abcd1234;N:Front\\;Door\\,Right;;').get('N'), 'Front;Door,Right');
  const qr = createProductQr({ activationCode: code, deviceUid: 'ESP32-80B54EC8149C', ssid: 'SmartDoor-C8149C', password: 'Abcd1234_qrs' });
  for (const invalid of [qr.replace(';H:', ';S:Other;H:'), qr.replace('SmartDoor-C8149C', 'CoffeeShop'), qr.replace('P:Abcd1234_qrs;', ''), 'WIFI:T:WPA;S:Home;P:Abcd1234;;'])
    assert.throws(() => productSetup(invalid));
});
test('short device labels never expose URI or API names and old activation-only labels still work', () => {
  assert.equal(deviceDisplayName('ESP32-80B54EC8149C', 'http://server:8080/api'), 'Smart Door C8149C');
  assert.equal(deviceDisplayName('ESP32-80B54EC8149C', 'ESP32-80B54EC8149C'), 'Smart Door C8149C');
  assert.equal(deviceDisplayName('ESP32-80B54EC8149C', 'Cửa nhà'), 'Cửa nhà');
  assert.deepEqual(productSetup(createProductQr({ activationCode: code })), { activationCode: code });
});
test('activation inspection rejects a valid code paired with another device identity', async () => {
  const product = { activationCode: code, deviceUid: 'ESP32-80B54EC8149C' };
  await assert.rejects(inspectProduct(product, async () => ({ deviceUid: 'ESP32-AABBCCDDEEFF', name: 'Other', online: true })), /không khớp/);
  assert.equal((await inspectProduct(product, async () => ({ deviceUid: product.deviceUid, name: 'Door', online: false }))).online, false);
});
test('first online connection stops at the restart guide before claiming the door', () => {
  const state = { hasDevice: false, hasProduct: true, online: false, restartConfirmed: false };
  assert.equal(activationPage({ ...state, hasProduct: false }), 'SCAN');
  assert.equal(activationPage(state), 'WIFI');
  assert.equal(activationPage({ ...state, online: true }), 'RESTART');
  assert.equal(activationPage({ ...state, online: true, restartConfirmed: true }), 'NAME');
  assert.equal(activationPage({ ...state, hasDevice: true }), 'SETUP');
});
test('restart confirmation checks the connection again and stays pending on offline or errors', async () => {
  const product = { activationCode: code, deviceUid: 'ESP32-80B54EC8149C' };
  let checked = 0;
  await assert.rejects(checkRestartConnection(product, async () => {
    checked++; return { deviceUid: product.deviceUid, name: 'Door', online: false };
  }), /chưa kết nối lại/);
  await assert.rejects(checkRestartConnection(product, async () => { throw new Error('Không kết nối được'); }), /Không kết nối được/);
  assert.equal((await checkRestartConnection(product, async () => {
    checked++; return { deviceUid: product.deviceUid, name: 'Door', online: true };
  })).online, true);
  assert.equal(checked, 2);
});
