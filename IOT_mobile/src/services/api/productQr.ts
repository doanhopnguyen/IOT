export interface ProductSetup {
  activationCode: string;
  deviceUid?: string;
  ssid?: string;
  password?: string;
  name?: string;
}
const codePattern = /^[A-Za-z0-9_-]{24,128}$/;
export function deviceDisplayName(uid?: string, name?: string): string {
  const label = name?.trim();
  if (label && label.length <= 60 && !/[:/\\]|^ESP32-|^API\b/i.test(label)) return label;
  return uid && /^ESP32-[0-9A-F]{12}$/.test(uid) ? `Smart Door ${uid.slice(-6)}` : 'Khóa Smart Door';
}
function validateCode(code: string): string {
  if (/^ESP32-/i.test(code) || /^[0-9a-f]{12}$/i.test(code) || /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(code))
    throw new Error('Bạn đang nhập MAC/UID của thiết bị. Hãy dùng mã nhận cửa hoặc QR sản phẩm.');
  if (!codePattern.test(code)) throw new Error('Mã kích hoạt chưa hợp lệ. Hãy nhập đầy đủ mã nhận cửa hoặc quét QR sản phẩm.');
  return code;
}
function validateProduct(product: ProductSetup): ProductSetup {
  validateCode(product.activationCode);
  if (product.deviceUid && !/^ESP32-[0-9A-F]{12}$/.test(product.deviceUid)) throw new Error('Mã sản phẩm trong QR không hợp lệ.');
  if (product.ssid && (!/^SmartDoor-[0-9A-F]{6}$/.test(product.ssid) || (product.deviceUid && product.ssid !== `SmartDoor-${product.deviceUid.slice(-6)}`)))
    throw new Error('Mạng thiết lập không khớp mã sản phẩm.');
  if (Boolean(product.ssid) !== Boolean(product.password) || (product.password && !/^[A-Za-z0-9_-]{8,63}$/.test(product.password)))
    throw new Error('Thông tin Wi-Fi thiết lập không hợp lệ.');
  if (product.name) product.name = deviceDisplayName(product.deviceUid, product.name);
  return product;
}
// WIFI fields use backslash escaping; splitting on ';' would corrupt passwords
// or labels containing escaped delimiters. Reject duplicates instead of guessing.
export function wifiQrFields(input: string): Map<string, string> {
  const fields = new Map<string, string>();
  let token = '', escaped = false;
  for (const character of input.slice(5)) {
    if (escaped) { token += character; escaped = false; }
    else if (character === '\\') escaped = true;
    else if (character === ';') {
      if (token) {
        const colon = token.indexOf(':');
        if (colon < 1) throw new Error('QR Wi-Fi không hợp lệ.');
        const key = token.slice(0, colon);
        if (fields.has(key)) throw new Error('QR có thông tin trùng lặp. Hãy dùng QR sản phẩm gốc.');
        fields.set(key, token.slice(colon + 1)); token = '';
      }
    } else token += character;
  }
  if (escaped || token) throw new Error('QR Wi-Fi chưa đầy đủ.');
  return fields;
}
export function parseProductQr(input: string): ProductSetup {
  const raw = input.trim();
  if (raw.length > 2048 || /[\u0000-\u001f]/.test(raw)) throw new Error('QR sản phẩm không hợp lệ.');
  if (raw.startsWith('WIFI:')) {
    const fields = wifiQrFields(raw);
    if (!fields.get('C')) throw new Error('Đây là QR Wi-Fi. Hãy quét QR sản phẩm Smart Door có mã nhận cửa.');
    if (fields.get('T') !== 'WPA' || !fields.get('S') || !fields.get('P')) throw new Error('Thông tin Wi-Fi thiết lập không hợp lệ.');
    return validateProduct({ activationCode: fields.get('C')!, deviceUid: fields.get('U'), ssid: fields.get('S'), password: fields.get('P'),
      ...(fields.get('N') ? { name: fields.get('N') } : {}) });
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error('QR nhận cửa không hợp lệ.'); }
    if (url.protocol !== 'smartdoor:' || url.hostname !== 'activate' || (url.pathname !== '' && url.pathname !== '/') || url.username || url.password || url.hash)
      throw new Error('Đây không phải QR nhận cửa. Hãy quét QR sản phẩm Smart Door.');
    for (const key of ['code', 'uid', 'ssid', 'key', 'name']) if (url.searchParams.getAll(key).length > 1) throw new Error('QR có thông tin trùng lặp.');
    return validateProduct({ activationCode: (url.searchParams.get('code') ?? '').trim(),
      ...(url.searchParams.has('uid') ? { deviceUid: url.searchParams.get('uid')! } : {}),
      ...(url.searchParams.has('ssid') ? { ssid: url.searchParams.get('ssid')! } : {}),
      ...(url.searchParams.has('key') ? { password: url.searchParams.get('key')! } : {}),
      ...(url.searchParams.has('name') ? { name: url.searchParams.get('name')! } : {}) });
  }
  return { activationCode: validateCode(raw) };
}
export function parseScannedProductQr(result: { data: string; raw?: string | null }): ProductSetup {
  // Android's display value for a WIFI barcode omits custom activation fields.
  // Preserve the original payload; platforms without raw already put it in data.
  return parseProductQr(result.raw || result.data);
}
const escapeWifi = (value: string) => value.replace(/[\\;,:\"]/g, character => `\\${character}`);
export function createProductQr(product: ProductSetup): string {
  validateProduct(product);
  if (!product.ssid || !product.password) {
    const uri = new URL('smartdoor://activate'); uri.searchParams.set('code', product.activationCode);
    if (product.deviceUid) uri.searchParams.set('uid', product.deviceUid);
    return uri.toString();
  }
  const fields = { T: 'WPA', S: product.ssid, P: product.password, H: 'false', C: product.activationCode,
    ...(product.deviceUid ? { U: product.deviceUid } : {}), N: deviceDisplayName(product.deviceUid, product.name) };
  return 'WIFI:' + Object.entries(fields).map(([key, value]) => `${key}:${escapeWifi(value)};`).join('') + ';';
}
