export interface AlertFilters {
  from: string;
  to: string;
  relatedUserId?: number;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function alertDateRange(days: number, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - days + 1);
  return { from: localDate(start), to: localDate(today) };
}

export function parseAlertDate(text: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  if (Number(year) < 1000) return undefined;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const iso = `${year}-${month}-${day}`;
  return localDate(date) === iso ? iso : undefined;
}

export function alertQuery(filters: AlertFilters, statistics = false): string {
  const query = new URLSearchParams({
    from: statistics ? filters.from : `${filters.from}T00:00:00`,
    to: statistics ? filters.to : `${filters.to}T23:59:59.999`,
  });
  if (filters.severity) query.set('severity', filters.severity);
  if (filters.relatedUserId !== undefined) query.set('relatedUserId', String(filters.relatedUserId));
  return query.toString();
}
