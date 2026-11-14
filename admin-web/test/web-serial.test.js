import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserFlasher, parseInfo } from '../src/web-serial.js';

const mac = 'AABBCCDDEEFF';
const uid = `ESP32-${mac}`;

// Model stream fragmentation and USB re-enumeration after FACTORY is acknowledged.
class FakePort {
  getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 }; }
  identity = '';
  opens = 0;
  command = '';
  writes = [];
  async open() {
    this.opens++;
    this.readable = new ReadableStream({ start: (controller) => { this.controller = controller; } });
    this.writable = new WritableStream({ write: (bytes) => {
      this.command += new TextDecoder().decode(bytes);
      if (!this.command.endsWith('\n')) return;
      const command = this.command.trim(); this.command = ''; this.writes.push(command);
      if (command === 'INFO') this.reply(`boot log\nFACTORY_INFO mac=${mac} uid=${this.identity} firmware=1.0 gen=0\n`);
      if (command.startsWith('FACTORY ')) {
        this.identity = JSON.parse(command.slice(8)).deviceUid;
        this.reply(`FACTORY_PROVISIONED ${mac}\n`);
        this.controller.close();
      }
    } });
  }
  reply(line) {
    const bytes = new TextEncoder().encode(line);
    this.controller.enqueue(bytes.subarray(0, 17));
    this.controller.enqueue(bytes.subarray(17));
  }
  async setSignals() {}
  async close() { this.readable = null; this.writable = null; }
}

test('parses firmware INFO including empty uid and ignores boot output', () => {
  assert.equal(parseInfo('booting...'), null);
  assert.deepEqual(parseInfo('FACTORY_INFO mac=AABB uid= firmware=1.0 gen=0'),
    { mac: 'AABB', uid: '', firmware: '1.0', gen: '0' });
});

test('rejects a corrupted factory image before erasing flash', async () => {
  const flasher = new BrowserFlasher(new FakePort());
  let writes = 0;
  flasher.loader = { writeFlash: async () => { writes++; } };
  await assert.rejects(flasher.flash(new Uint8Array([1, 2, 3]).buffer, '0'.repeat(64), () => {}), /SHA-256/);
  assert.equal(writes, 0);
});

test('refuses firmware flashing on a different ESP chip', async () => {
  const flasher = new BrowserFlasher(new FakePort());
  flasher.loader = { main: async () => {}, chip: { CHIP_NAME: 'ESP32-C3' } };
  await assert.rejects(flasher.readMac(), /ESP32-S3/);
});

test('provisions over local serial and verifies identity after reboot', async () => {
  const port = new FakePort();
  const flasher = new BrowserFlasher(port);
  let verifying = false;
  const result = await flasher.provision({ factoryMac: mac, deviceUid: uid }, () => { verifying = true; });
  assert.deepEqual(result, { factoryMac: mac, uid });
  assert.equal(verifying, true);
  assert.equal(port.opens, 3);
  assert.deepEqual(port.writes.map((line) => line.split(' ')[0]), ['INFO', 'FACTORY', 'INFO']);
  assert.equal(port.readable, null);
  assert.equal(port.writable, null);
});

test('rejects FACTORY rejection and releases serial stream locks', async () => {
  const port = new FakePort();
  const originalReply = port.reply;
  port.reply = function (line) {
    originalReply.call(this, line.startsWith('FACTORY_PROVISIONED') ? 'FACTORY_REJECTED\n' : line);
  };
  await assert.rejects(new BrowserFlasher(port).provision({ factoryMac: mac, deviceUid: uid }, () => {}), /từ chối/);
  assert.equal(port.readable, null);
  assert.equal(port.writable, null);
});
