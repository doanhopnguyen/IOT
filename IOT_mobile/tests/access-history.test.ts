import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessHistoryFeed, actorName, methodLabels, reasonText, referenceName, resultLabels, sourceDeviceName } from '../src/services/accessHistory';
import { accessLogService, type AccessLogDto } from '../src/services/api/accessLogService';
import { ApiError, getApiBaseUrl, setApiBaseUrl, type PageResponse } from '../src/services/api/client';
import { formatVietnamTime, vietnamHistoryFrom } from '../src/utils/vietnamTime';

const log: AccessLogDto = {
  id: 12, accessUnit: { id: 3, name: 'Cửa chính' }, device: { id: 8, name: 'ESP32 phòng khách' },
  account: { id: 42, name: 'Nguyễn An' }, method: 'RFID', result: 'GRANTED',
  reasonCode: null, occurredAt: '2026-11-16T08:30:10.123',
};
function page(items: AccessLogDto[] = [log], hasNext = false): PageResponse<AccessLogDto> {
  return { items, hasNext, page: 0, size: 30, totalElements: items.length };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('RFID keeps the confirmed account and real source device', () => {
  assert.equal(actorName(log), 'Nguyễn An');
  assert.equal(sourceDeviceName(log), 'ESP32 phòng khách');
  assert.equal(methodLabels[log.method], 'RFID');
  assert.equal(resultLabels[log.result], 'Cho phép');
});

test('PIN without an account never attributes the shared PIN to the door owner', () => {
  assert.equal(actorName({ ...log, method: 'PIN', account: null }), 'Không xác định người nhập');
  assert.equal(actorName({ ...log, method: 'PIN', account: { id: 42, name: '  ' } }), 'Không xác định người nhập');
});

test('denied fingerprint, face, remote unlock and ERROR retain distinct labels', () => {
  assert.equal(actorName({ ...log, method: 'FINGERPRINT', result: 'DENIED', account: null }), 'Vân tay chưa xác định');
  assert.equal(actorName({ ...log, method: 'RFID', account: null }), 'Thẻ RFID chưa xác định');
  for (const result of ['GRANTED', 'DENIED', 'ERROR'] as const) {
    assert.equal(actorName({ ...log, method: 'FACE', result, account: null }), 'Chưa xác định người xác thực khuôn mặt');
  }
  assert.equal(actorName({ ...log, method: 'REMOTE_UNLOCK' }), 'Nguyễn An');
  assert.equal(actorName({ ...log, method: 'REMOTE_UNLOCK', account: null }), 'Chưa xác định người yêu cầu');
  assert.equal(resultLabels.DENIED, 'Từ chối');
  assert.equal(resultLabels.ERROR, 'Lỗi');
});

test('device names are not repeated and missing names only fall back to real IDs', () => {
  assert.equal(sourceDeviceName({ ...log, device: { id: 8, name: ' cửa chính ' } }), undefined);
  assert.equal(sourceDeviceName({ ...log, device: { id: 8, name: '' } }), 'Thiết bị #8');
  assert.equal(referenceName(undefined, 'Thiết bị'), 'Chưa có thông tin thiết bị');
});

test('combined reasons preserve neutral denial and distinguish lockdown', () => {
  assert.equal(reasonText(' LOCAL_ACCESS_DENIED, LOCKDOWN, ,LOCKDOWN'),
    'Thiết bị từ chối xác thực tại cửa · Cửa đang tạm khóa');
  assert.doesNotMatch(reasonText('LOCAL_ACCESS_DENIED'), /Sai PIN|không hợp lệ/);
  assert.equal(reasonText('FUTURE_REASON'), 'Chưa có mô tả cho lý do từ thiết bị');
  // Unknown raw values must not accidentally expose device payloads in the UI.
  assert.doesNotMatch(reasonText('token=secret'), /token|secret/);
  assert.equal(new Set(['DOOR_BUSY', 'CONTROLLER_OFFLINE', 'LOCKDOWN', 'ACCESS_REVOKED',
    'SEND_FAILED', 'ACK_TIMEOUT', 'DEVICE_CLOCK_INVALID', 'DEVICE_CLOCK_UNSYNCED'].map(reasonText)).size, 8);
});

test('Vietnam wall time, UTC and explicit offsets represent the same instant', () => {
  const expected = formatVietnamTime('2026-11-16T00:30:10.123');
  assert.match(expected, /00:30:10/);
  assert.match(expected, /16\/11\/2026/);
  assert.equal(formatVietnamTime('2026-11-15T17:30:10.123Z'), expected);
  assert.equal(formatVietnamTime('2026-11-16T00:30:10.123+07:00'), expected);
  assert.equal(formatVietnamTime('2026-11-15T12:30:10.123-05:00'), expected);
  assert.equal(formatVietnamTime('2026-11-16T00:30:10.123456789'), expected);
  assert.equal(formatVietnamTime('invalid'), 'Không có thời gian hợp lệ');
});

test('date filters use Vietnam calendar days across midnight, years and leap days', () => {
  const midnight = new Date('2026-01-02T17:15:00Z'); // 03/01 in Vietnam.
  assert.equal(vietnamHistoryFrom(1, midnight), '2026-01-03T00:00:00');
  assert.equal(vietnamHistoryFrom(7, midnight), '2025-12-28T00:00:00');
  assert.equal(vietnamHistoryFrom(30, midnight), '2025-12-05T00:00:00');
  assert.equal(vietnamHistoryFrom(7, new Date('2024-03-01T00:00:00Z')), '2024-02-24T00:00:00');
});

test('offline replay displays the event time, not the time the list was fetched', () => {
  const savedDeviceTime = '2023-11-15T05:13:20'; // Backend conversion of epoch 1700000000.
  assert.match(formatVietnamTime(savedDeviceTime), /05:13:20/);
  assert.match(formatVietnamTime(savedDeviceTime), /15\/11\/2023/);
});

test('API sends door, method, result, page and timezone-free from to backend', async () => {
  const originalFetch = globalThis.fetch, originalBase = getApiBaseUrl();
  const urls: URL[] = [];
  setApiBaseUrl('http://history.test');
  globalThis.fetch = async (input, init) => {
    urls.push(new URL(String(input)));
    assert.equal(init?.credentials, 'include');
    return new Response(JSON.stringify(page()), { status: 200 });
  };
  try {
    for (const method of Object.keys(methodLabels) as AccessLogDto['method'][]) {
      for (const result of Object.keys(resultLabels) as AccessLogDto['result'][]) {
        await accessLogService.list(3, 2, 7, { method, result, from: '2026-11-10T00:00:00' });
        const url = urls.at(-1)!;
        assert.equal(url.pathname, '/api/access-logs');
        assert.deepEqual(Object.fromEntries(url.searchParams), {
          accessUnitId: '3', page: '2', from: '2026-11-10T00:00:00', method, result,
        });
      }
    }
    await accessLogService.list(3);
    assert.equal(urls.at(-1)!.searchParams.has('method'), false);
    assert.equal(urls.at(-1)!.searchParams.has('result'), false);
    globalThis.fetch = async () => new Response('{}', { status: 403 });
    await assert.rejects(accessLogService.list(99), error => error instanceof ApiError && error.status === 403);
  } finally {
    globalThis.fetch = originalFetch;
    setApiBaseUrl(originalBase);
  }
});

test('rapid refresh/load more clicks send one request and start with loading, not empty', async () => {
  const pending = deferred<PageResponse<AccessLogDto>>();
  let calls = 0;
  const feed = new AccessHistoryFeed(1, async () => { calls++; return pending.promise; });
  assert.equal(feed.getSnapshot().loading, true);
  const loading = feed.refresh();
  feed.refresh(); feed.loadMore(); feed.retry();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(feed.getSnapshot().loading, true);
  pending.resolve(page());
  await loading;
  assert.equal(feed.getSnapshot().items[0].id, 12);
  assert.equal(feed.getSnapshot().loading, false);
});

test('pagination appends one page, deduplicates IDs and refresh restarts page zero', async () => {
  const pages: number[] = [], ranges: string[] = [];
  const feed = new AccessHistoryFeed(7, async (index, from) => {
    pages.push(index); ranges.push(from);
    return index === 0 ? page([log], true) : page([log, { ...log, id: 13 }]);
  });
  await feed.refresh();
  const loading = feed.loadMore();
  feed.loadMore();
  await loading;
  assert.deepEqual(feed.getSnapshot().items.map(item => item.id), [12, 13]);
  assert.equal(feed.getSnapshot().more, false);
  assert.equal(ranges[0], ranges[1]);
  await feed.loadMore();
  await feed.refresh();
  assert.deepEqual(pages, [0, 1, 0]);
  assert.deepEqual(feed.getSnapshot().items.map(item => item.id), [12]);
});

test('failed next page retains earlier rows and retry requests the same page', async () => {
  const pages: number[] = [];
  let fail = true;
  const feed = new AccessHistoryFeed(30, async index => {
    pages.push(index);
    if (index && fail) throw new Error('Mất kết nối');
    return index ? page([{ ...log, id: 13 }]) : page([log], true);
  });
  await feed.refresh();
  await feed.loadMore();
  assert.equal(feed.getSnapshot().page, 0);
  assert.equal(feed.getSnapshot().items.length, 1);
  assert.equal(feed.getSnapshot().error, 'Mất kết nối');
  fail = false;
  await feed.retry();
  assert.deepEqual(pages, [0, 1, 1]);
  assert.equal(feed.getSnapshot().error, '');
  assert.equal(feed.getSnapshot().items.length, 2);
});

test('initial errors can be retried and empty successful responses clear loading', async () => {
  let fail = true;
  const feed = new AccessHistoryFeed(1, async () => {
    if (fail) throw new Error('Backend không khả dụng');
    return page([]);
  });
  await feed.refresh();
  assert.equal(feed.getSnapshot().loading, false);
  assert.equal(feed.getSnapshot().error, 'Backend không khả dụng');
  fail = false;
  await feed.retry();
  assert.deepEqual(feed.getSnapshot(), { items: [], page: 0, more: false, loading: false, error: '' });
});

test('old success after a filter/door change or cleanup cannot publish rows', async () => {
  const pending = deferred<PageResponse<AccessLogDto>>();
  const old = new AccessHistoryFeed(1, () => pending.promise);
  const loading = old.refresh();
  await Promise.resolve();
  old.cancel();
  const next = new AccessHistoryFeed(7, async () => page([{ ...log, id: 99, method: 'PIN' }]));
  assert.equal(next.getSnapshot().items.length, 0);
  await next.refresh();
  pending.resolve(page());
  await loading;
  assert.equal(old.getSnapshot().items.length, 0);
  assert.deepEqual(next.getSnapshot().items.map(item => item.id), [99]);
});

test('old errors/finally do not replace newer success or release the active request lock', async () => {
  const first = deferred<PageResponse<AccessLogDto>>(), second = deferred<PageResponse<AccessLogDto>>();
  let calls = 0;
  const feed = new AccessHistoryFeed(1, () => ++calls === 1 ? first.promise : second.promise);
  const old = feed.refresh();
  await Promise.resolve();
  feed.cancel();
  const current = feed.refresh();
  await Promise.resolve();
  first.reject(new Error('Stale error'));
  await old;
  feed.refresh();
  assert.equal(calls, 2);
  assert.equal(feed.getSnapshot().error, '');
  assert.equal(feed.getSnapshot().loading, true);
  second.resolve(page());
  await current;
  assert.equal(feed.getSnapshot().items.length, 1);
});

test('StrictMode setup/cleanup/setup sends one request and subscriptions clean up', async () => {
  let calls = 0, updates = 0;
  const feed = new AccessHistoryFeed(1, async () => { calls++; return page(); });
  const unsubscribe = feed.subscribe(() => updates++);
  const first = feed.refresh();
  feed.cancel();
  const second = feed.refresh();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(feed.getSnapshot().items.length, 1);
  unsubscribe();
  const previous = updates;
  await feed.refresh();
  assert.equal(updates, previous);
});
