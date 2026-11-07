import { Ionicons } from '@expo/vector-icons';
import { ReactNode, type ComponentRef, useEffect, useRef, useState } from 'react';
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

export type IconName = keyof typeof Ionicons.glyphMap;
export type ToneName =
  | 'primary'
  | 'indigo'
  | 'purple'
  | 'teal'
  | 'sky'
  | 'success'
  | 'warning'
  | 'error'
  | 'rose'
  | 'neutral';

const toneMap: Record<ToneName, { ink: string; bg: string; border: string }> = {
  primary: { ink: colors.primary, bg: colors.primarySoft, border: '#DBEAFE' },
  indigo: { ink: colors.indigo, bg: colors.indigoSoft, border: '#E0E7FF' },
  purple: { ink: colors.purple, bg: colors.purpleSoft, border: '#EDE9FE' },
  teal: { ink: colors.teal, bg: colors.tealSoft, border: '#CCFBF1' },
  sky: { ink: colors.sky, bg: colors.skySoft, border: '#E0F2FE' },
  success: { ink: colors.success, bg: colors.successSoft, border: '#D1FAE5' },
  warning: { ink: colors.warning, bg: colors.warningSoft, border: '#FEF3C7' },
  error: { ink: colors.error, bg: colors.errorSoft, border: '#FEE2E2' },
  rose: { ink: colors.rose, bg: colors.roseSoft, border: '#FFE4E6' },
  neutral: { ink: colors.muted, bg: colors.slateSoft, border: colors.border },
};

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

export function FeatureTile({
  icon,
  title,
  subtitle,
  badge,
  tone = 'primary',
  compact = false,
  onPress,
  style,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: ToneName;
  compact?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = toneMap[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.tile,
        compact ? styles.tileCompact : styles.tileGrid,
        pressed && styles.tilePressed,
        style,
      ]}
    >
      <View style={compact ? styles.tileRowHead : styles.tileGridHead}>
        <View style={[styles.tileIconWrap, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <Ionicons name={icon} size={22} color={palette.ink} />
        </View>
        {compact ? (
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.tileTitle}>{title}</Text>
            {subtitle ? (
              <Text style={styles.tileSubtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.tileTrailing}>
          {badge ? (
            <View style={[styles.tileBadge, { backgroundColor: palette.bg }]}>
              <Text style={[styles.tileBadgeText, { color: palette.ink }]}>{badge}</Text>
              {!compact ? (
                <Ionicons name="chevron-forward" size={12} color={palette.ink} />
              ) : null}
            </View>
          ) : null}
          {compact || !badge ? (
            <View style={styles.tileArrow}>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          ) : null}
        </View>
      </View>
      {!compact ? (
        <View style={{ gap: 4, marginTop: 6 }}>
          <Text style={styles.tileTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.tileSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
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
        pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
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
          placeholderTextColor={colors.subtle}
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
  const palette = toneMap[tone];
  return (
    <View style={[styles.status, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.caption, { color: palette.ink, fontWeight: '700', fontSize: 13, flexShrink: 1 }]}>
        {label}
      </Text>
    </View>
  );
}

export function Status({ online }: { online: boolean }) {
  return (
    <View
      style={[
        styles.status,
        {
          backgroundColor: online ? colors.successSoft : colors.slateSoft,
          borderColor: online ? '#D1FAE5' : colors.border,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.subtle }]} />
      <Text
        style={[
          styles.caption,
          { color: online ? colors.success : colors.muted, fontWeight: '700', fontSize: 13 },
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
      <View style={styles.headerTopRow}>
        {back ? (
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.pageTitle}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {action}
      </View>
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
  const palette = tone === 'info' ? toneMap.primary : toneMap[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[
        styles.notice,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Ionicons
        name={
          tone === 'error'
            ? 'alert-circle'
            : tone === 'success'
              ? 'checkmark-circle'
              : tone === 'warning'
                ? 'warning'
                : 'information-circle'
        }
        size={20}
        color={palette.ink}
      />
      <Text style={[styles.description, { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 21 }]}>
        {children}
      </Text>
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
        <Ionicons name={icon} size={30} color={colors.primary} />
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
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.description}>{label}</Text>
    </View>
  );
}

export function AppModal({
  visible,
  title,
  children,
  onClose,
  scrollKey,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  scrollKey?: string;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
      >
        <View style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              style={styles.close}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            ref={scroll}
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
  page: { padding: 20, gap: 18, paddingBottom: 150 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.045,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tileGrid: {
    justifyContent: 'space-between',
    minHeight: 132,
  },
  tileCompact: {
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  tilePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
    borderColor: '#BFDBFE',
  },
  tileGridHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tileRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tileIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tileBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tileArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.slateSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tileSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 22,
  },
  ghost: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  danger: { backgroundColor: colors.error },
  disabled: { backgroundColor: colors.slateSoft, borderColor: colors.border, shadowOpacity: 0 },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginLeft: 2 },
  inputWrap: { position: 'relative' },
  input: {
    minHeight: 52,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.2,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
  },
  inputFocus: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  fieldError: { color: colors.error, fontSize: 13, lineHeight: 19, marginLeft: 2 },
  trailing: { position: 'absolute', right: 4, top: 4, bottom: 4, justifyContent: 'center' },
  status: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  caption: { fontSize: 13, lineHeight: 20, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  header: { gap: 6, marginBottom: 2 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  pageTitle: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heading: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  notice: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: 'flex-start',
  },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 36 },
  emptyIcon: {
    width: 64,
    height: 64,
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  loading: { alignItems: 'center', padding: 32, gap: 12 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  modal: {
    backgroundColor: colors.surface,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    padding: 24,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    gap: 16,
  },
  modalBody: { gap: 16, paddingBottom: 12 },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 },
  close: {
    width: 42,
    height: 42,
    backgroundColor: colors.slateSoft,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
