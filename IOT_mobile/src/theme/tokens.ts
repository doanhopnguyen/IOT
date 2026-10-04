export const colors = {
  primary: '#4F46E5', secondary: '#6088F0', background: '#F5F7FF', surface: '#FFFFFF',
  text: '#202642', muted: '#8188A3', border: '#E9ECF7', success: '#22C55E',
  warning: '#F59E0B', error: '#EF4444', disabled: '#B8BED1', shadow: '#B9C5E6',
} as const;

export const radius = { card: 22, button: 16, pill: 999 } as const;
export const space = (n: number) => n * 4;
