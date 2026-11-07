export const colors = {
  navy: '#0F172A',
  navyMid: '#1E293B',
  brand: '#4F46E5',
  primary: '#2563EB',
  secondary: '#1D4ED8',
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  text: '#0F172A',
  muted: '#475569',
  subtle: '#64748B',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  disabled: '#94A3B8',
  shadow: '#0F172A',
  primarySoft: '#EFF6FF',
  successSoft: '#ECFDF5',
  warningSoft: '#FFFBEB',
  errorSoft: '#FEF2F2',
  indigo: '#4F46E5',
  indigoSoft: '#EEF2FF',
  purple: '#7C3AED',
  purpleSoft: '#F3E8FF',
  teal: '#0D9488',
  tealSoft: '#F0FDFA',
  sky: '#0284C7',
  skySoft: '#F0F9FF',
  rose: '#E11D48',
  roseSoft: '#FFF1F2',
  slateSoft: '#F1F5F9',
} as const;

export const radius = {
  card: 24,
  hero: 28,
  button: 18,
  input: 16,
  icon: 18,
  pill: 999,
} as const;

export const typography = {
  title: 28,
  heading: 20,
  body: 16,
  caption: 14,
} as const;

export const space = (n: number) => n * 4;
