import { requireOptionalNativeModule } from 'expo';

export interface SetupWifiModule {
  available: boolean;
  connect(ssid: string, password: string): Promise<'saved' | 'manual'>;
}
// Expo Go and web can still scan the product and run the complete setup flow.
// The optional module adds the OS Wi-Fi confirmation in a compiled app.
export default requireOptionalNativeModule<SetupWifiModule>('SmartDoorWifi');
