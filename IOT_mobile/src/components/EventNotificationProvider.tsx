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
  const banner =
    enabled && notifications.latest ? (
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mở cảnh báo mới"
          onPress={() => {
            notifications.dismiss();
            openAlerts.current?.();
          }}
          style={{
            position: 'absolute',
            top: insets.top + 10,
            left: 14,
            right: 14,
            padding: 16,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: notifications.latest.severity === 'CRITICAL' ? '#F1CBD1' : '#E8D5AD',
            backgroundColor:
              notifications.latest.severity === 'CRITICAL' ? colors.errorSoft : colors.warningSoft,
            shadowColor: colors.shadow,
            shadowOpacity: 0.12,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
            elevation: 12,
          }}
        >
          <Text
            style={{
              color: notifications.latest.severity === 'CRITICAL' ? colors.error : colors.warning,
              fontSize: 14,
              fontWeight: '700',
              marginBottom: 5,
            }}
          >
            {notifications.latest.severity === 'CRITICAL'
              ? 'KHẨN CẤP'
              : notifications.latest.severity === 'WARNING'
                ? 'CẢNH BÁO MỚI'
                : 'THÔNG BÁO MỚI'}
          </Text>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>
            {notifications.latest.message ?? notifications.latest.eventType}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 6 }}>
            Chạm để xem chi tiết
          </Text>
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
