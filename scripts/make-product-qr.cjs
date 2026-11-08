// Create the buyer label from a private factory bundle. Device secret is excluded.
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('../admin-web/node_modules/qrcode');
const root = path.resolve(__dirname, '..');
const source = process.argv[2];
if (!source || process.argv.length > 4) {
  console.error('Usage: node scripts/make-product-qr.cjs <factory.json> [output.png]');
  process.exit(1);
}
const factory = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8').replace(/^\uFEFF/, ''));
if (!/^ESP32-[0-9A-F]{12}$/.test(factory.deviceUid) ||
    ['activationCode', 'setupSsid', 'setupPassword'].some(key => typeof factory[key] !== 'string' || !factory[key])) {
  throw Error('Factory bundle is missing buyer activation data.');
}
const url = new URL('smartdoor://activate');
for (const [key, value] of Object.entries({ code: factory.activationCode, uid: factory.deviceUid, ssid: factory.setupSsid, key: factory.setupPassword })) {
  url.searchParams.set(key, value);
}
const destination = path.resolve(process.argv[3] || path.join(root, '.local', `PRODUCT_QR_${factory.deviceUid}.png`));
QRCode.toFile(destination, url.toString(), { width: 600, margin: 4, errorCorrectionLevel: 'M' })
  .then(() => console.log(`Product QR saved: ${destination}. Keep this buyer activation label private.`))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
