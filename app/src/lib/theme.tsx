import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { FlawCategory } from './types';

/** Every colour a screen may use. Light and dark each provide all of them. */
export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  /** The brand green as it reads on this theme's surfaces: text, icons, small fills. */
  primary: string;
  /** Teal, for a second accent that still sits next to the green. */
  deep: string;
  /** The logo's own green (also the icon and splash background in app.json). */
  mint: string;
  coral: string;
  /** Always white: for text and icons on photos and on the brand gradient, which don't change with the theme. */
  white: string;
  /** Text and icons sitting on a solid `primary`, `deep` or category colour. */
  onAccent: string;
  /** Error text. */
  danger: string;
}

/**
 * Light: taken from the logo. Its mint-to-emerald green, white, and neutrals tinted the same green.
 * The one colour that isn't green is coral, kept for "no" and for destructive actions.
 */
export const lightColors: Palette = {
  bg: '#F2FBF7',
  surface: '#FFFFFF',
  surfaceAlt: '#E4F6EF',
  ink: '#10261F',
  inkSoft: '#2B4239',
  muted: '#647A72',
  line: '#D8ECE4',
  primary: '#0B8566',
  deep: '#0D5B63',
  mint: '#1EBA92',
  coral: '#FF5A5F',
  white: '#FFFFFF',
  onAccent: '#FFFFFF',
  danger: '#C2273A',
};

/**
 * Dark: the same family turned down. Near-black greens for the backgrounds, and the accents lifted
 * (lighter green, lighter teal) so they still read as text on them.
 */
export const darkColors: Palette = {
  bg: '#0A1411',
  surface: '#13211C',
  surfaceAlt: '#1C2F28',
  ink: '#EAF6F1',
  inkSoft: '#C4D9D0',
  muted: '#8FA89E',
  line: '#29433B',
  primary: '#3DD6AB',
  deep: '#6CCBD4',
  mint: '#1EBA92',
  coral: '#FF7B7F',
  white: '#FFFFFF',
  onAccent: '#06231B',
  danger: '#FF8E92',
};

/**
 * The signature gradient used on hero areas and primary buttons: the logo's gradient, a shade
 * deeper so white text on top of it stays readable. The same in both themes.
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

type CategoryMeta = Record<FlawCategory, { emoji: string; label: string; color: string }>;

/**
 * Confession categories are told apart by their emoji; the colours all stay in the logo's family,
 * from teal through emerald to leaf green. Dealbreaker is the exception: a red flag is red.
 */
export const categoryMeta: CategoryMeta = {
  Habits: { emoji: '🔁', label: 'Habits', color: lightColors.primary },
  Baggage: { emoji: '🧳', label: 'Baggage', color: lightColors.deep },
  Hygiene: { emoji: '🧼', label: 'Hygiene', color: '#0E9C8A' },
  Money: { emoji: '💸', label: 'Money', color: '#2F8F4E' },
  Temper: { emoji: '🌋', label: 'Temper', color: '#5E8C1F' },
  Quirks: { emoji: '🌀', label: 'Quirks', color: '#178A9E' },
  Dealbreaker: { emoji: '🚩', label: 'Dealbreaker', color: '#E2364A' },
  Other: { emoji: '✨', label: 'Other', color: lightColors.muted },
};

/** The same categories with their colours lifted to read on dark surfaces. */
export const categoryMetaDark: CategoryMeta = {
  Habits: { ...categoryMeta.Habits, color: darkColors.primary },
  Baggage: { ...categoryMeta.Baggage, color: darkColors.deep },
  Hygiene: { ...categoryMeta.Hygiene, color: '#45D0BF' },
  Money: { ...categoryMeta.Money, color: '#6FCB8B' },
  Temper: { ...categoryMeta.Temper, color: '#A9D25A' },
  Quirks: { ...categoryMeta.Quirks, color: '#5CC6DA' },
  Dealbreaker: { ...categoryMeta.Dealbreaker, color: '#FF7389' },
  Other: { ...categoryMeta.Other, color: darkColors.muted },
};

/** Backgrounds for avatars without a photo: shades of the logo green. */
export const avatarColors = ['#0B8566', '#0D5B63', '#149E7C', '#2F8F4E', '#0E9C8A', '#1B6E55'] as const;

/** Adds alpha to a #RRGGBB color, e.g. tint('#FF0000', 0.1). */
export function tint(hex: string, alpha: number) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

// ---------- Appearance: light, dark, or whatever the phone is set to ----------

export type Appearance = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const APPEARANCES: Appearance[] = ['system', 'light', 'dark'];
export const appearanceLabel = (a: Appearance) => (a === 'system' ? 'Match device' : a === 'light' ? 'Light' : 'Dark');

const KEY = 'ick.appearance';

interface ThemeValue {
  /** What the person chose. */
  appearance: Appearance;
  /** What that works out to right now. */
  scheme: Scheme;
  colors: Palette;
  /** False until the saved choice has been read, so the app doesn't flash the wrong theme. */
  isLoaded: boolean;
  setAppearance: (appearance: Appearance) => void;
}

const ThemeContext = createContext<ThemeValue>({
  appearance: 'system',
  scheme: 'light',
  colors: lightColors,
  isLoaded: true,
  setAppearance: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme();
  const [appearance, setChoice] = useState<Appearance>('system');
  const [isLoaded, setLoaded] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setChoice(saved);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setChoice(next);
    SecureStore.setItemAsync(KEY, next).catch(() => {});
  }, []);

  const scheme: Scheme = appearance === 'system' ? (device === 'dark' ? 'dark' : 'light') : appearance;
  const value = useMemo(
    () => ({ appearance, scheme, colors: scheme === 'dark' ? darkColors : lightColors, isLoaded, setAppearance }),
    [appearance, scheme, isLoaded, setAppearance],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** The colours for the theme in force. Use this, never a fixed palette, anywhere that draws. */
export const useColors = () => useContext(ThemeContext).colors;

export const useCategoryMeta = () => (useContext(ThemeContext).scheme === 'dark' ? categoryMetaDark : categoryMeta);

/**
 * A stylesheet that depends on the theme. Declared once per file like StyleSheet.create, and read
 * inside a component with the hook it returns:
 *
 *   const useStyles = makeStyles((colors) => StyleSheet.create({ card: { backgroundColor: colors.surface } }));
 *   function Card() { const styles = useStyles(); ... }
 *
 * Each palette's sheet is built once and reused.
 */
export function makeStyles<T>(build: (colors: Palette) => T): () => T {
  const built = new Map<Palette, T>();
  return function useStyles() {
    const colors = useColors();
    let sheet = built.get(colors);
    if (!sheet) {
      sheet = build(colors);
      built.set(colors, sheet);
    }
    return sheet;
  };
}
