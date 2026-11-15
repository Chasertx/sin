import type { FlawCategory } from './types';

/**
 * Palette taken from the logo: its mint-to-emerald green, white, and neutrals tinted the same green.
 * The one colour that isn't green is coral, kept for "no" and for destructive actions.
 */
export const colors = {
  bg: '#F2FBF7',
  surface: '#FFFFFF',
  surfaceAlt: '#E4F6EF',
  ink: '#10261F',
  inkSoft: '#2B4239',
  muted: '#647A72',
  line: '#D8ECE4',
  /** The logo's deep green: dark enough for text and icons on white. */
  primary: '#0B8566',
  /** Deep teal, for a second accent that still sits next to the green. */
  deep: '#0D5B63',
  /** The logo's own green (also the icon and splash background in app.json). */
  mint: '#1EBA92',
  coral: '#FF5A5F',
  white: '#FFFFFF',
} as const;

/**
 * The signature gradient used on hero areas and primary buttons: the logo's gradient, a shade
 * deeper so white text on top of it stays readable.
 */
export const brand = ['#1FC49A', '#149E7C', '#0B7A5E'] as const;
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
  shadowColor: '#0B5A45',
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;

/**
 * Confession categories are told apart by their emoji; the colours all stay in the logo's family,
 * from teal through emerald to leaf green. Dealbreaker is the exception: a red flag is red.
 */
export const categoryMeta: Record<FlawCategory, { emoji: string; label: string; color: string }> = {
  Habits: { emoji: '🔁', label: 'Habits', color: colors.primary },
  Baggage: { emoji: '🧳', label: 'Baggage', color: colors.deep },
  Hygiene: { emoji: '🧼', label: 'Hygiene', color: '#0E9C8A' },
  Money: { emoji: '💸', label: 'Money', color: '#2F8F4E' },
  Temper: { emoji: '🌋', label: 'Temper', color: '#5E8C1F' },
  Quirks: { emoji: '🌀', label: 'Quirks', color: '#178A9E' },
  Dealbreaker: { emoji: '🚩', label: 'Dealbreaker', color: '#E2364A' },
  Other: { emoji: '✨', label: 'Other', color: colors.muted },
};

/** Backgrounds for avatars without a photo: shades of the logo green. */
export const avatarColors = ['#0B8566', '#0D5B63', '#149E7C', '#2F8F4E', '#0E9C8A', '#1B6E55'] as const;

/** Adds alpha to a #RRGGBB color, e.g. tint('#FF0000', 0.1). */
export function tint(hex: string, alpha: number) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}
