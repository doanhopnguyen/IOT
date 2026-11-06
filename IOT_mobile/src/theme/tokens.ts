export const colors = {
  navy: '#14263D',
  brand: '#4F46E5',
  primary: '#2563EB',
  secondary: '#1D4ED8',
  background: '#F7F9FC',
  surface: '#FFFFFF',
  text: '#14263D',
  muted: '#334155',
  border: '#D5DFEA',
  success: '#15803D',
  warning: '#B45309',
  error: '#B91C1C',
  disabled: '#64748B',
  shadow: '#14263D',
  primarySoft: '#EFF5FF',
  successSoft: '#F0FDF4',
  warningSoft: '#FFFBEB',
  errorSoft: '#FEF2F2',
} as const;

export const radius = { card: 16, button: 12, input: 12, pill: 999 } as const;
export const typography = { title: 28, heading: 20, body: 16, caption: 14 } as const;
export const space = (n: number) => n * 4;
