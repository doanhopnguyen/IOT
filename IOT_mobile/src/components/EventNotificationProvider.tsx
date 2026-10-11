import { createContext, useContext, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { useEventNotifications } from '../hooks/useEventNotifications';
import { colors } from '../theme/tokens';

const NotificationContext = createContext<{
  setEnabled: Dispatch<SetStateAction<boolean>>;
  openAlerts: RefObject<(() => void) | undefined>;
} | null>(null);

export function useNotificationBanner() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('Notification banner requires its root provider.');
  return context;
}

export function EventNotificationProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const openAlerts = useRef<(() => void) | undefined>(undefined);
  const notifications = useEventNotifications(enabled);
  const insets = useSafeAreaInsets();
  const banner = enabled && notifications.latest ? (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mở cảnh báo mới"
        onPress={() => { notifications.dismiss(); openAlerts.current?.(); }}
        style={{ position: 'absolute', top: insets.top, left: 0, right: 0, padding: 12, backgroundColor: '#FFF5E5' }}>
        <Text style={{ color: colors.text }}>Cảnh báo mới · {notifications.latest.severity}: {notifications.latest.message ?? notifications.latest.eventType}</Text>
      </Pressable>
    </View>
  ) : null;
  return (
    <NotificationContext.Provider value={{ setEnabled, openAlerts }}>
      {children}
      {banner && (Platform.OS === 'ios' ? <FullWindowOverlay>{banner}</FullWindowOverlay> : banner)}
    </NotificationContext.Provider>
  );
}
