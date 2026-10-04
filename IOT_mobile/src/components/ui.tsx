import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/tokens';

export function Screen({ children }: { children: ReactNode }) { return <SafeAreaView style={styles.screen} edges={['top']}><View style={styles.content}>{children}</View></SafeAreaView>; }
export function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Button({ title, onPress, variant = 'primary', disabled = false, icon }: { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const content = <><>{icon && <Ionicons name={icon} color={variant === 'ghost' ? colors.primary : '#fff'} size={20} />}</><Text style={[styles.buttonText, variant === 'ghost' && styles.ghostText]}>{title}</Text></>;
  if (variant === 'primary') return <Pressable disabled={disabled} onPress={onPress} style={disabled && { opacity: .5 }}><LinearGradient colors={[colors.primary, colors.secondary]} style={styles.button}>{content}</LinearGradient></Pressable>;
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, variant === 'ghost' ? styles.ghost : styles.danger]}>{content}</Pressable>;
}
export function Input({ value, onChangeText, placeholder, secureTextEntry, keyboardType = 'default' }: { value: string; onChangeText: (v: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'numeric' }) { return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} style={styles.input} />; }
export function Status({ online }: { online: boolean }) { return <View style={[styles.status, { backgroundColor: online ? '#EAF9EF' : '#FFF5E5' }]}><View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} /><Text style={[styles.caption, { color: online ? '#16853A' : '#AC6800' }]}>{online ? 'Trực tuyến' : 'Ngoại tuyến'}</Text></View>; }
export function AppModal({ visible, title, children, onClose }: { visible: boolean; title: string; children: ReactNode; onClose: () => void }) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.modal}><View style={styles.handle} /><View style={styles.modalHeader}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={onClose} accessibilityLabel="Đóng"><Ionicons name="close" size={24} color={colors.text} /></Pressable></View>{children}</View></View></Modal>; }
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flex: 1 }, card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, shadowColor: colors.shadow, shadowOpacity: .18, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  button: { height: 54, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' }, ghost: { borderWidth: 1, borderColor: '#DDE2FA', backgroundColor: '#F8F9FF' }, ghostText: { color: colors.primary }, danger: { backgroundColor: colors.error },
  input: { height: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, fontSize: 14, color: colors.text }, status: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, dot: { width: 7, height: 7, borderRadius: 7 }, caption: { fontSize: 12, fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(32,38,66,.35)' }, modal: { backgroundColor: colors.surface, padding: 20, paddingBottom: 36, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 16 }, handle: { width: 42, height: 4, borderRadius: 4, alignSelf: 'center', backgroundColor: '#DDE2F0' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
});
