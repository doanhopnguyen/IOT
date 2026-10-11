import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EventNotificationProvider } from '../src/components/EventNotificationProvider';
export default function Layout() {
  return (
    <SafeAreaProvider>
      <EventNotificationProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </EventNotificationProvider>
    </SafeAreaProvider>
  );
}
