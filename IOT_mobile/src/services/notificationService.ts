import type { AlertDto } from './api/alertService';

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
    const fresh = this.initialized ? events.filter(e => !this.seen.has(e.id)) : [];
    for (const e of events) this.seen.add(e.id);
    this.initialized = true;
    // Keep IDs for the entire session so an older event cannot notify again.
    if (this.localNotifier) await Promise.allSettled(fresh.map(e => this.localNotifier!(e)));
    return fresh;
  }
}
export const notificationService = new EventNotifications();
