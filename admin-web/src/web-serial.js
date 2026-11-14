import { ESPLoader, Transport } from 'esptool-js';
import SparkMD5 from 'spark-md5';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeMac = (mac) => String(mac || '').replace(/:/g, '').toUpperCase();

export function serialUnavailable() {
  if (!globalThis.isSecureContext) return 'Mở trang admin bằng HTTPS hoặc localhost để truy cập USB trên máy này.';
  if (!navigator.serial) return 'Trình duyệt chưa hỗ trợ Web Serial. Hãy mở trang admin bằng Chrome hoặc Edge trên máy tính.';
  return '';
}

export function parseInfo(line) {
  if (!line.startsWith('FACTORY_INFO ')) return null;
  return Object.fromEntries(line.slice(13).trim().split(/\s+/).filter((part) => part.includes('='))
    .map((part) => { const index = part.indexOf('='); return [part.slice(0, index), part.slice(index + 1)]; }));
}

/** A bounded line buffer; never print serial traffic because FACTORY carries credentials. */
class SerialLink {
  constructor(port) { this.port = port; this.lines = []; this.pending = ''; this.error = null; }
  async open() {
    await this.port.open({ baudRate: 115200 });
    try {
      await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      this.pump = this.read();
      await sleep(1500);
    } catch (error) { await this.close(); throw error; }
  }
  async read() {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.pending += decoder.decode(value, { stream: true });
        const parts = this.pending.split('\n');
        this.pending = parts.pop().slice(-8192);
        this.lines.push(...parts.map((line) => line.trim()));
        this.lines = this.lines.slice(-100);
      }
    } catch (error) { this.error = error; }
    finally { this.ended = true; }
  }
  async send(text) {
    const bytes = new TextEncoder().encode(text + '\n');
    for (let i = 0; i < bytes.length; i += 64) {
      await this.writer.write(bytes.subarray(i, i + 64));
      await sleep(20);
    }
  }
  async until(match, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      while (this.lines.length) {
        const result = match(this.lines.shift());
        if (result) return result;
      }
      if (this.error || this.ended) throw Error('USB đã ngắt kết nối. Cắm lại chip rồi chọn lại cổng USB.');
      await sleep(50);
    }
    const error = Error('ESP32 chưa phản hồi. Kiểm tra cáp USB và đóng Serial Monitor rồi thử lại.');
    error.code = 'SERIAL_TIMEOUT';
    throw error;
  }
  async close() {
    try { await this.reader?.cancel(); } catch { /* device may reboot */ }
    await this.pump;
    this.reader?.releaseLock();
    this.writer?.releaseLock();
    try { await this.port.close(); } catch { /* already disconnected */ }
  }
}

async function readInfo(port, mac, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (port.connected === false) break;
    const link = new SerialLink(port);
    let connected = false;
    try {
      await link.open();
      // Opening/closing a UART bridge can reset the board. Keep the same link
      // while firmware initializes peripherals, and reuse it to send FACTORY.
      while (Date.now() < deadline) {
        await link.send('INFO');
        try {
          const info = await link.until((line) => {
            const info = parseInfo(line);
            if (!info) return null;
            if (normalizeMac(info.mac) !== normalizeMac(mac)) {
              const error = Error('Cổng USB đang kết nối với chip khác. Chưa gửi danh tính vào chip này.');
              error.code = 'CHIP_MISMATCH';
              throw error;
            }
            return info;
          }, Math.min(12000, Math.max(1, deadline - Date.now())));
          connected = true;
          return { info, link };
        } catch (error) {
          if (error.code !== 'SERIAL_TIMEOUT') throw error;
        }
      }
    } catch (error) {
      if (error.code === 'CHIP_MISMATCH') throw error;
    } finally { if (!connected) await link.close(); }
    await sleep(1000);
  }
  throw Error('Chưa nhận được INFO. Thả nút BOOT, nhấn RESET một lần rồi chọn cổng USB đang chạy firmware để tiếp tục.');
}

/** Keep the ROM connection open between reading MAC and writing the image. */
export class BrowserFlasher {
  constructor(port) {
    this.port = port;
    this.transport = new Transport(port);
    this.loader = new ESPLoader({ transport: this.transport, baudrate: 460800,
      terminal: { clean() {}, write() {}, writeLine() {} } });
  }
  async readMac() {
    await this.loader.main();
    if (this.loader.chip.CHIP_NAME !== 'ESP32-S3') throw Error('Chỉ hỗ trợ nạp firmware cho ESP32-S3.');
    const mac = (await this.loader.chip.readMac(this.loader)).toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)
      || ['000000000000', 'FFFFFFFFFFFF'].includes(normalizeMac(mac))) throw Error('Không đọc được MAC hợp lệ từ chip.');
    return mac;
  }
  async flash(image, sha256, onProgress) {
    const bytes = new Uint8Array(image);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== sha256?.toLowerCase()) throw Error('Factory image tải về không khớp SHA-256. Chưa xoá chip; hãy thử lại.');
    await this.loader.writeFlash({ fileArray: [{ data: bytes, address: 0 }], flashSize: 'keep',
      flashMode: 'keep', flashFreq: 'keep', eraseAll: true, compress: true,
      calculateMD5Hash: (data) => new SparkMD5.ArrayBuffer().append(data).end(),
      reportProgress: (_, written, total) => onProgress(Math.round(written * 100 / total)) });
    await this.loader.after('hard_reset');
    await this.close();
  }
  async close() {
    if (this.port.readable || this.port.writable) await this.transport.disconnect();
  }
  async connectFirmware(mac, onReconnect) {
    const attempted = new Set();
    for (let attempt = 0; attempt < 3; attempt++) {
      attempted.add(this.port);
      try { return await readInfo(this.port, mac); }
      catch (error) {
        if (error.code === 'CHIP_MISMATCH' || attempt === 2) throw error;
        // USB CDC may enumerate as a new SerialPort after the ROM resets.
        // Only try a unique authorized replacement with the same USB vendor;
        // its factory MAC must still match before sending any credentials.
        const vendor = this.port.getInfo().usbVendorId;
        const available = await globalThis.navigator?.serial?.getPorts().catch(() => []) || [];
        const replacements = available.filter((port) => !attempted.has(port) && port.connected !== false
          && vendor !== undefined && port.getInfo().usbVendorId === vendor);
        if (replacements.length === 1) { this.port = replacements[0]; continue; }
        if (!onReconnect) throw error;
        this.port = await onReconnect(error.message);
        if (!this.port) throw Error('Chưa chọn cổng USB sau reset.');
      }
    }
  }
  async provision(payload, onVerify, onReconnect) {
    const { link } = await this.connectFirmware(payload.factoryMac, onReconnect);
    try {
      await link.send('FACTORY ' + JSON.stringify(payload));
      await link.until((line) => {
        if (line === 'FACTORY_REJECTED') throw Error('Chip từ chối gói cấp phát. Hãy nạp lại firmware.');
        if (line === 'FACTORY_STORAGE_FAILED') throw Error('Chip không lưu được danh tính vào bộ nhớ.');
        return line === 'FACTORY_PROVISIONED ' + normalizeMac(payload.factoryMac);
      }, 20000);
    } finally { await link.close(); }
    onVerify();
    await sleep(3000);
    const verified = await this.connectFirmware(payload.factoryMac, onReconnect);
    try {
      if (verified.info.uid !== payload.deviceUid) throw Error('Danh tính đọc lại từ chip không khớp gói vừa nạp.');
      return { factoryMac: normalizeMac(verified.info.mac), uid: verified.info.uid };
    } finally { await verified.link.close(); }
  }
}
