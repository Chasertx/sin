import type { FlawCategory } from './types';

/** Bright, upbeat palette: warm cream base, sunset gradient, candy accents. */
export const colors = {
  bg: '#FFF6F1',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF0E8',
  ink: '#1E1B2E',
  inkSoft: '#3A3550',
  muted: '#7C7690',
  line: '#F1E4DC',
  coral: '#FF5A5F',
  pink: '#FF4E88',
  violet: '#7B5CFF',
  sunshine: '#FFB938',
  mint: '#17C3A0',
  sky: '#3BA3FF',
  white: '#FFFFFF',
} as const;

/** The signature gradient used on hero areas and primary buttons. */
export const sunset = ['#FF8A4C', '#FF4E88', '#7B5CFF'] as const;
export const minty = ['#2EE6B6', '#17C3A0'] as const;
export const coralish = ['#FF8A80', '#FF4D6D'] as const;

export const fonts = {
  regular: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export const radius = { sm: 12, md: 18, lg: 26, xl: 34, pill: 999 } as const;

export const shadow = {
  shadowColor: '#7B3F2A',
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;

export const categoryMeta: Record<FlawCategory, { emoji: string; label: string; color: string }> = {
  Habits: { emoji: '🔁', label: 'Habits', color: colors.violet },
  Baggage: { emoji: '🧳', label: 'Baggage', color: colors.sky },
  Hygiene: { emoji: '🧼', label: 'Hygiene', color: colors.mint },
  Money: { emoji: '💸', label: 'Money', color: '#E59A00' },
  Temper: { emoji: '🌋', label: 'Temper', color: colors.coral },
  Quirks: { emoji: '🌀', label: 'Quirks', color: colors.pink },
  Dealbreaker: { emoji: '🚩', label: 'Dealbreaker', color: '#E2364A' },
  Other: { emoji: '✨', label: 'Other', color: colors.muted },
};

/** Adds alpha to a #RRGGBB color, e.g. tint('#FF0000', 0.1). */
export function tint(hex: string, alpha: number) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}
