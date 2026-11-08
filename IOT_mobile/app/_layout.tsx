import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmationProvider } from '../src/components/ConfirmationProvider';
import { EventNotificationProvider } from '../src/components/EventNotificationProvider';
import { OverlayHost, OverlayProvider } from '../src/components/OverlayProvider';

export default function Layout() {
  useFonts({
    ...Ionicons.font,
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
    'Be Vietnam Pro': BeVietnamPro_400Regular,
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!document.getElementById('be-vietnam-pro-google-font')) {
      const link = document.createElement('link');
      link.id = 'be-vietnam-pro-google-font';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('be-vietnam-pro-global-style')) {
      const style = document.createElement('style');
      style.id = 'be-vietnam-pro-global-style';
      style.textContent = `
        html, body, #root, input, textarea, button, select, div[dir="auto"], span {
          font-family: 'Be Vietnam Pro', 'BeVietnamPro_400Regular', 'ionicons', 'Ionicons', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <OverlayProvider>
      <EventNotificationProvider>
        <ConfirmationProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <OverlayHost />
        </ConfirmationProvider>
      </EventNotificationProvider>
      </OverlayProvider>
    </SafeAreaProvider>
  );
}
