import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { alertService, AlertDto } from '../services/api/alertService';
import { notificationService } from '../services/notificationService';

export function useEventNotifications(enabled: boolean) {
  const [latest, setLatest] = useState<AlertDto>();
  useEffect(() => {
    if (!latest) return;
    const timer = setTimeout(() => setLatest(undefined), 6000);
    return () => clearTimeout(timer);
  }, [latest]);
  useEffect(() => {
    notificationService.reset();
    setLatest(undefined);
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
        if (active && fresh.length) setLatest(fresh[0]);
      } catch {
        // Alert screen provides retry/error details. Keep polling when backend recovers.
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void poll();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [enabled]);
  return { latest, dismiss: () => setLatest(undefined) };
}
