import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { alertService, AlertDto } from '../services/api/alertService';
import { subscribeUpdates } from '../services/api/realtime';
import { isCriticalNotification, nextNotification, NOTIFICATION_BANNER_MS, notificationService, updateNotificationQueue } from '../services/notificationService';

export function useEventNotifications(enabled: boolean) {
  const [pending, setPending] = useState<AlertDto[]>([]);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const latest = nextNotification(pending);
  const latestId = latest?.id;
  const critical = !!latest && isCriticalNotification(latest);
  useEffect(() => {
    if (!enabled || !foreground || latestId == null || critical) return;
    const timer = setTimeout(() => setPending(items => items.filter(item => item.id !== latestId)), NOTIFICATION_BANNER_MS);
    return () => clearTimeout(timer);
  }, [enabled, foreground, latestId, critical]);
  useEffect(() => {
    notificationService.reset();
    setPending([]);
    if (!enabled) return;
    let active = true;
    let running = false;
    const poll = async () => {
      if (!active || running || AppState.currentState !== 'active') return;
      running = true;
      try {
        const data = await alertService.list();
        if (!active) return;
        const fresh = await notificationService.observe(data.items);
        if (active) setPending(previous => updateNotificationQueue(previous, fresh, data.items));
      } catch {
        // Alert screen provides retry/error details. Keep polling when backend recovers.
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    const unsubscribe = subscribeUpdates(() => { void poll(); });
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'active') void poll();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
      unsubscribe();
    };
  }, [enabled]);
  return { latest, count: pending.length,
    dismiss: (id?: number) => setPending(items => items.filter(item => item.id !== (id ?? nextNotification(items)?.id))) };
}
