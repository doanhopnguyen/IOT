const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const formatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// API LocalDateTime values are Vietnam wall time, not UTC or the phone's timezone.
export function formatVietnamTime(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return 'Không có thời gian hợp lệ';
  const date = new Date(`${match[1]}.${(match[2] ?? '').padEnd(3, '0').slice(0, 3)}${match[3] ?? '+07:00'}`);
  return Number.isFinite(date.getTime()) ? formatter.format(date) : 'Không có thời gian hợp lệ';
}

export function vietnamHistoryFrom(days: number, now = new Date()): string {
  const date = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return `${date.toISOString().slice(0, 10)}T00:00:00`;
}
