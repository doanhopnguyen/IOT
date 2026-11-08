import type { AlertDto } from './api/alertService';
import { isPinAlertActionable } from './api/alertService';

type LocalNotifier = (event: AlertDto) => Promise<void>;
export class EventNotifications {
  private initialized = false;
  private seen = new Set<number>();
  private localNotifier?: LocalNotifier;
  // Optional integration point. TODO: add Expo local scheduling when required;
  // server push also needs authenticated push tokens and a producer infrastructure.
  setLocalNotifier(notifier?: LocalNotifier) {
    this.localNotifier = notifier;
  }
  reset() {
    this.initialized = false;
    this.seen.clear();
  }
  async observe(events: AlertDto[]): Promise<AlertDto[]> {
    const fresh = this.initialized ? events.filter(e => !this.seen.has(e.id)) : events.filter(e => e.status === 'OPEN' || isPinAlertActionable(e));
    for (const e of events) this.seen.add(e.id);
    this.initialized = true;
    // Keep IDs for the entire session so an older event cannot notify again.
    if (this.localNotifier) await Promise.allSettled(fresh.map(e => this.localNotifier!(e)));
    return fresh;
  }
}
export const notificationService = new EventNotifications();

export const NOTIFICATION_BANNER_MS = 6000;
export function isCriticalNotification(event: AlertDto): boolean {
  return event.severity === 'CRITICAL' || isPinAlertActionable(event);
}
export function nextNotification(pending: AlertDto[]): AlertDto | undefined {
  return pending.find(isCriticalNotification) ?? pending[0];
}

export function updateNotificationQueue(pending: AlertDto[], fresh: AlertDto[], latest: AlertDto[]): AlertDto[] {
  const reported = new Map(latest.map(event => [event.id, event]));
  const queued = new Map(pending.map(event => [event.id, reported.get(event.id) ?? event]));
  for (const event of [...fresh].reverse()) if (!queued.has(event.id)) queued.set(event.id, event);
  return [...queued.values()].filter(event => event.eventType !== 'REPEATED_WRONG_PIN' || isPinAlertActionable(event));
}
