import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  icon?: IconName;
  loading?: boolean;
}) {
  const ink = disabled || loading ? colors.muted : variant === 'ghost' ? colors.primary : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' ? styles.ghost : variant === 'danger' ? styles.danger : styles.primary,
        (disabled || loading) && styles.disabled,
        pressed && { opacity: 0.9 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} size="small" />
      ) : icon ? (
        <Ionicons name={icon} color={ink} size={19} />
      ) : null}
      <Text style={[styles.buttonText, { color: ink }]}>{title}</Text>
    </Pressable>
  );
}
type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};
export function Input({ label, error, hint, trailing, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel || label || props.placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize={
            props.autoCapitalize ??
            (props.secureTextEntry || props.keyboardType === 'email-address' ? 'none' : 'sentences')
          }
          style={[
            styles.input,
            focused && styles.inputFocus,
            error ? styles.inputError : undefined,
            trailing ? { paddingRight: 52 } : undefined,
          ]}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'error' | 'primary' | 'neutral';
}) {
  const ink = tone === 'neutral' ? colors.muted : colors[tone];
  const background = tone === 'neutral' ? '#EEF2F6' : colors[`${tone}Soft`];
  return (
    <View style={[styles.status, { backgroundColor: background }]}>
      <Text style={[styles.caption, { color: ink, fontWeight: '600', flexShrink: 1 }]}>
        {label}
      </Text>
    </View>
  );
}
export function Status({ online }: { online: boolean }) {
  return (
    <View style={[styles.status, { backgroundColor: online ? colors.successSoft : '#EEF2F6' }]}>
      <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.muted }]} />
      <Text
        style={[
          styles.caption,
          { color: online ? colors.success : colors.muted, fontWeight: '600' },
        ]}
      >
        {online ? 'Trực tuyến' : 'Ngoại tuyến'}
      </Text>
    </View>
  );
}
export function PageHeader({
  title,
  description,
  back,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  back?: () => void;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <Text style={[styles.pageTitle, { flex: 1 }]}>{title}</Text>
        {action}
      </View>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error' | 'success' | 'warning';
}) {
  const ink = tone === 'info' ? colors.primary : colors[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[
        styles.notice,
        { backgroundColor: tone === 'info' ? colors.primarySoft : colors[`${tone}Soft`] },
      ]}
    >
      <Ionicons
        name={
          tone === 'error'
            ? 'alert-circle-outline'
            : tone === 'success'
              ? 'checkmark-circle-outline'
              : 'information-circle-outline'
        }
        size={19}
        color={ink}
      />
      <Text style={[styles.description, { flex: 1, color: ink }]}>{children}</Text>
    </View>
  );
}
export function EmptyState({
  title,
  description,
  icon = 'folder-open-outline',
  action,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.heading}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { textAlign: 'center', maxWidth: 340 }]}>
          {description}
        </Text>
      ) : null}
      {action}
    </Card>
  );
}
export function LoadingState({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.description}>{label}</Text>
    </View>
  );
}
export function AppModal({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
      >
        <View style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              style={styles.close}
            >
              <Ionicons name="close" size={23} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  page: { padding: 20, gap: 20, paddingBottom: 150 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  button: {
    minHeight: 50,
    paddingVertical: 13,
    paddingHorizontal: 17,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.primary },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 24,
  },
  ghost: { borderColor: colors.border, backgroundColor: colors.surface },
  danger: { backgroundColor: colors.error },
  disabled: { backgroundColor: '#EDF2F7', borderColor: colors.border },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  inputWrap: { position: 'relative' },
  input: {
    minHeight: 51,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#7C8DA5',
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  inputFocus: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.error },
  fieldError: { color: colors.error, fontSize: 14, lineHeight: 21 },
  trailing: { position: 'absolute', right: 3, top: 3, bottom: 3, justifyContent: 'center' },
  status: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 4 },
  caption: { fontSize: 14, lineHeight: 21, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  header: { gap: 9, marginBottom: 2 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  heading: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  eyebrow: { color: colors.success, fontSize: 14, fontWeight: '700', letterSpacing: 1.7 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 12,
    padding: 15,
    alignItems: 'flex-start',
  },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyIcon: {
    width: 60,
    height: 60,
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  loading: { alignItems: 'center', padding: 28, gap: 12 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(13,35,61,.5)',
  },
  modal: {
    backgroundColor: colors.surface,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    padding: 22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
  },
  modalBody: { gap: 16, paddingBottom: 8 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 4,
    alignSelf: 'center',
    backgroundColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '700', flex: 1 },
  close: {
    width: 44,
    height: 44,
    backgroundColor: colors.background,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
