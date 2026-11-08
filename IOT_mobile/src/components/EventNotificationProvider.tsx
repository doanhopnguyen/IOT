import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventNotifications } from '../hooks/useEventNotifications';
import { isCriticalNotification } from '../services/notificationService';
import { colors, fonts } from '../theme/tokens';
import { isPinAlertActionable } from '../services/api/alertService';
import { PinAlertActions } from './PinAlertActions';
import { AppOverlay } from './OverlayProvider';
import { Button } from './ui';

const NotificationContext = createContext<{
  setEnabled: Dispatch<SetStateAction<boolean>>;
  openAlerts: RefObject<(() => void) | undefined>;
} | null>(null);

export function useNotificationBanner() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('Notifications require their root provider.');
  return context;
}

export function EventNotificationProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const openAlerts = useRef<(() => void) | undefined>(undefined);
  const notifications = useEventNotifications(enabled);
  const insets = useSafeAreaInsets();
  const alert = notifications.latest;
  const critical = !!alert && isCriticalNotification(alert);
  const dismiss = () => { if (alert) notifications.dismiss(alert.id); };
  const ink = critical ? colors.error : alert?.severity === 'WARNING' ? colors.warning : colors.primary;
  const soft = critical ? colors.errorSoft : alert?.severity === 'WARNING' ? colors.warningSoft : colors.primarySoft;
  const title = critical ? 'Cảnh báo khẩn cấp' : alert?.severity === 'WARNING' ? 'Cảnh báo mới' : 'Thông báo mới';
  return (
    <NotificationContext.Provider value={{ setEnabled, openAlerts }}>
      {children}
      <AppOverlay visible={enabled && !!alert} priority={critical ? 100 : 50} floating={!critical} onClose={dismiss}>
        {alert && !critical ? <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', paddingHorizontal: 14, paddingTop: Math.max(insets.top + 8, 12) }}>
          <View testID="notification-banner" style={{ flexDirection: 'row', width: '100%', maxWidth: 560, borderRadius: 18,
            padding: 14, gap: 12, backgroundColor: soft, borderWidth: 1, borderColor: colors.border,
            shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 16 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Mở thông báo mới" style={{ flex: 1, gap: 4 }} onPress={() => { dismiss(); openAlerts.current?.(); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Ionicons name="notifications-outline" size={18} color={ink} />
                <Text style={{ fontFamily: fonts.semibold, color: ink, fontSize: 14 }}>{title}</Text>
              </View>
              <Text accessibilityLiveRegion="polite" numberOfLines={2} style={{ fontFamily: fonts.regular, color: colors.text, fontSize: 14, lineHeight: 21 }}>{alert.message ?? alert.eventType.replace(/_/g, ' ')}</Text>
              <Text style={{ fontFamily: fonts.regular, color: colors.muted, fontSize: 11 }}>Chạm để xem chi tiết</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" hitSlop={8} onPress={dismiss} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={21} color={colors.muted} />
            </Pressable>
          </View>
        </View> : alert ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: 20,
          paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }}>
          <View testID="notification-popup" style={{ width: '100%', maxWidth: 480, maxHeight: '100%', flexShrink: 1,
            backgroundColor: colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border,
            shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 24 }}>
            <ScrollView key={alert.id} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: soft }}>
                  <Ionicons name={alert.severity === 'INFO' ? 'notifications-outline' : 'alert-circle-outline'} size={26} color={ink} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, color: ink, fontSize: 18, lineHeight: 25 }}>{title}</Text>
                  {notifications.count > 1 ? <Text style={{ fontFamily: fonts.regular, color: colors.muted, fontSize: 12 }}>Còn {notifications.count} thông báo</Text> : null}
                </View>
              </View>
              <Text accessibilityLiveRegion="assertive" style={{ fontFamily: fonts.medium, color: colors.text, fontSize: 16, lineHeight: 25 }}>
                {alert.message ?? alert.eventType.replace(/_/g, ' ')}
              </Text>
              <Text style={{ fontFamily: fonts.regular, color: colors.muted, fontSize: 13, lineHeight: 20 }}>
                {alert.accessUnit?.name ?? alert.device.name} · {new Date(alert.occurredAt).toLocaleString('vi-VN')}
                {alert.status === 'RESOLVED' ? ' · Đã xử lý' : alert.status === 'ACKNOWLEDGED' ? ' · Đã xem' : ''}
              </Text>
              {isPinAlertActionable(alert) ? <PinAlertActions key={alert.id} alert={alert} onResolved={dismiss} /> : null}
              <Button title="Xem chi tiết cảnh báo" variant="ghost" icon="notifications-outline" onPress={() => { dismiss(); openAlerts.current?.(); }} />
              <Button title="Đóng thông báo" variant="ghost" onPress={dismiss} />
            </ScrollView>
          </View>
        </View> : null}
      </AppOverlay>
    </NotificationContext.Provider>
  );
}
