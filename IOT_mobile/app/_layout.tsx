import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EventNotificationProvider } from '../src/components/EventNotificationProvider';
import { ConfirmationProvider } from '../src/components/ConfirmationProvider';
export default function Layout() {
  return (
    <SafeAreaProvider>
      <EventNotificationProvider>
        <ConfirmationProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ConfirmationProvider>
      </EventNotificationProvider>
    </SafeAreaProvider>
  );
}
