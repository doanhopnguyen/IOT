import { Linking, Platform } from 'react-native';
import SetupWifi from '../../modules/smartdoor-wifi';
import type { ProductSetup } from './api/productQr';

export const canJoinSetupWifi = Boolean(SetupWifi?.available);
export async function openWifiSettings() {
  if (Platform.OS === 'android') await Linking.sendIntent('android.settings.WIFI_SETTINGS');
  else if (Platform.OS === 'ios') await Linking.openSettings();
  else throw new Error('Dùng cài đặt Wi-Fi trên điện thoại để kết nối mạng của cửa.');
}
export async function connectSetupWifi(product: ProductSetup): Promise<'saved' | 'manual'> {
  if (product.ssid && product.password && SetupWifi?.available) return SetupWifi.connect(product.ssid, product.password);
  await openWifiSettings(); return 'manual';
}
export async function openSetupPortal() { await Linking.openURL('http://192.168.4.1'); }
