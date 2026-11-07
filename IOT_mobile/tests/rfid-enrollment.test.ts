import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrollScannedRfid } from '../src/services/api/rfidEnrollment';
import type { CommandDto } from '../src/services/api/managerService';

const sent: CommandDto = { commandUuid: 'reader-session', status: 'SENT', resultMessage: null };
const acknowledged = (message = 'RFID_UID:A1B2C3D4'): CommandDto => ({ ...sent, status: 'ACKNOWLEDGED', resultMessage: message });

test('card enrollment waits for the reader ACK before saving the UID for the selected person', async () => {
  let complete!: (value: CommandDto) => void;
  let saved = false, prompted = false;
  const pending = new Promise<CommandDto>(resolve => { complete = resolve; });
  const operation = enrollScannedRfid(7, 42, () => { prompted = true; }, {
    scanRfid: async (unit, user) => { assert.equal(unit, 7); assert.equal(user, 42); return sent; },
    waitForCommand: async command => { assert.equal(command.commandUuid, sent.commandUuid); return pending; },
    assignRfid: async (unit, user, uid) => {
      assert.equal(unit, 7); assert.equal(user, 42); assert.equal(uid, 'A1B2C3D4'); saved = true;
      return { credentialId: 11, rfidUid: uid };
    },
  });
  await Promise.resolve();
  assert.equal(prompted, true); assert.equal(saved, false);
  complete(acknowledged());
  assert.equal((await operation).credentialId, 11); assert.equal(saved, true);
});

test('timeout and reader failures never save a card', async () => {
  for (const result of [
    { ...sent, status: 'FAILED' as const, resultMessage: 'RFID_SCAN_TIMEOUT' },
    { ...sent, status: 'FAILED' as const, resultMessage: 'RFID_BUSY_OR_NOT_READY' },
    { ...sent, status: 'TIMEOUT' as const },
  ]) {
    let saved = false;
    await assert.rejects(enrollScannedRfid(7, 42, () => {}, {
      scanRfid: async () => sent, waitForCommand: async () => result,
      assignRfid: async () => { saved = true; throw new Error('must not save'); },
    }));
    assert.equal(saved, false);
  }
});

test('an acknowledged command without a valid reader UID never saves a card', async () => {
  for (const message of ['OK', 'RFID_UID:', 'RFID_UID:ZZZZZZZZ', 'RFID_UID:A1B2C3D4 extra']) {
    let saved = false;
    await assert.rejects(enrollScannedRfid(7, 42, () => {}, {
      scanRfid: async () => sent, waitForCommand: async () => acknowledged(message),
      assignRfid: async () => { saved = true; throw new Error('must not save'); },
    }), /hợp lệ/);
    assert.equal(saved, false);
  }
});

test('reader accepts the supported four, seven and ten byte card UIDs', async () => {
  for (const uid of ['a1b2c3d4', 'A1B2C3D4E5F607', 'A1B2C3D4E5F607182930']) {
    const result = await enrollScannedRfid(7, 42, () => {}, {
      scanRfid: async () => sent, waitForCommand: async () => acknowledged(`RFID_UID:${uid}`),
      assignRfid: async (_unit, _user, captured) => ({ credentialId: 11, rfidUid: captured }),
    });
    assert.equal(result.rfidUid, uid.toUpperCase());
  }
});

test('a rejected scan request does not prompt a reader session or save a card', async () => {
  let prompted = false, saved = false;
  await assert.rejects(enrollScannedRfid(7, 42, () => { prompted = true; }, {
    scanRfid: async () => { throw new Error('offline'); }, waitForCommand: async () => acknowledged(),
    assignRfid: async () => { saved = true; throw new Error('must not save'); },
  }), /offline/);
  assert.equal(prompted, false); assert.equal(saved, false);
});
