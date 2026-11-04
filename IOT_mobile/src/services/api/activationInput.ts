export function parseActivationCode(input: string): string {
  let code = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(code)) {
    let url: URL;
    try { url = new URL(code); } catch { throw new Error('QR nhận cửa không hợp lệ. Hãy quét QR do admin cấp.'); }
    if (url.protocol !== 'smartdoor:' || url.hostname !== 'activate' || (url.pathname !== '' && url.pathname !== '/') || url.username || url.password)
      throw new Error('Đây không phải QR nhận cửa. Hãy quét QR kích hoạt do admin cấp.');
    code = (url.searchParams.get('code') ?? '').trim();
  }
  if (/^ESP32-/i.test(code) || /^[0-9a-f]{12}$/i.test(code) || /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(code))
    throw new Error('Bạn đang nhập MAC/UID của thiết bị. Admin cần đăng ký chip trên web và cấp mã kích hoạt hoặc QR để nhận cửa.');
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(code))
    throw new Error('Mã kích hoạt chưa hợp lệ. Hãy sao chép đầy đủ mã nhận cửa từ web admin hoặc quét QR được cấp.');
  return code;
}

export function activationClaimInput(code: string, name: string) {
  const doorName = name.trim();
  if (!doorName || doorName.length > 100) throw new Error('Tên cửa cần từ 1 đến 100 ký tự.');
  return { activationCode: parseActivationCode(code), name: doorName };
}

export function productSetup(input: string): { activationCode: string; deviceUid?: string; ssid?: string; password?: string } {
  const activationCode = parseActivationCode(input);
  if (!input.trim().startsWith('smartdoor://')) return { activationCode };
  const url = new URL(input.trim());
  const deviceUid = url.searchParams.get('uid') ?? undefined;
  const ssid = url.searchParams.get('ssid') ?? undefined;
  const password = url.searchParams.get('key') ?? undefined;
  if (deviceUid && !/^ESP32-[0-9A-F]{12}$/.test(deviceUid)) throw new Error('Mã sản phẩm trong QR không hợp lệ.');
  if (ssid && (!/^SmartDoor-[0-9A-F]{6}$/.test(ssid) || (deviceUid && ssid !== `SmartDoor-${deviceUid.slice(-6)}`))) throw new Error('Mạng thiết lập không khớp mã sản phẩm.');
  if (password && !/^[A-Za-z0-9_-]{8,63}$/.test(password)) throw new Error('Thông tin Wi-Fi thiết lập không hợp lệ.');
  return { activationCode, deviceUid, ssid, password };
}
