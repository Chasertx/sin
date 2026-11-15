import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Appearance, StyleSheet, Text, useColorScheme } from 'react-native';

import {
  APPEARANCES,
  ThemeProvider,
  appearanceLabel,
  categoryMeta,
  categoryMetaDark,
  darkColors,
  lightColors,
  makeStyles,
  useCategoryMeta,
  useTheme,
  type Palette,
} from '../theme';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

/** What the phone itself is set to. */
function setDevice(scheme: 'light' | 'dark') {
  if (jest.isMockFunction(useColorScheme)) (useColorScheme as jest.Mock).mockReturnValue(scheme);
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
}

const useStyles = makeStyles((colors) => StyleSheet.create({ page: { backgroundColor: colors.bg } }));

let theme: ReturnType<typeof useTheme>;
let sheet: ReturnType<typeof useStyles>;
let tags: ReturnType<typeof useCategoryMeta>;
function Probe() {
  theme = useTheme();
  sheet = useStyles();
  tags = useCategoryMeta();
  return <Text testID="state">{theme.isLoaded ? `${theme.appearance}:${theme.scheme}` : 'loading'}</Text>;
}

async function mount() {
  await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('state').props.children).not.toBe('loading'));
}
const state = () => screen.getByTestId('state').props.children;

beforeEach(() => setDevice('light'));

describe('which theme is in force', () => {
  it('follows the phone until told otherwise', async () => {
    await mount();
    expect(state()).toBe('system:light');
    expect(theme.colors).toBe(lightColors);
  });

  it('is dark on a phone set to dark', async () => {
    setDevice('dark');
    await mount();
    expect(state()).toBe('system:dark');
    expect(theme.colors).toBe(darkColors);
  });

  it.each([
    ['dark', 'light', darkColors],
    ['light', 'dark', lightColors],
  ] as const)('a saved choice of %s wins over a phone set to %s', async (saved, device, palette) => {
    setDevice(device);
    store.set('ick.appearance', saved);
    await mount();
    expect(state()).toBe(`${saved}:${saved}`);
    expect(theme.colors).toBe(palette);
  });

  it('changes straight away when chosen, and remembers it', async () => {
    await mount();
    await act(async () => theme.setAppearance('dark'));
    expect(state()).toBe('dark:dark');
    expect(theme.colors).toBe(darkColors);
    expect(store.get('ick.appearance')).toBe('dark');

    await act(async () => theme.setAppearance('system'));
    expect(state()).toBe('system:light');
    expect(store.get('ick.appearance')).toBe('system');
  });

  it('ignores a saved value it does not recognise', async () => {
    store.set('ick.appearance', 'sepia');
    await mount();
    expect(state()).toBe('system:light');
  });

  it('still works if the saved choice cannot be read', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('no storage'));
    await mount();
    expect(state()).toBe('system:light');
  });

  it('offers match device, light and dark', () => {
    expect(APPEARANCES.map(appearanceLabel)).toEqual(['Match device', 'Light', 'Dark']);
  });
});

describe('themed styles', () => {
  it('are rebuilt for the other palette and reused within one', async () => {
    await mount();
    const light = sheet;
    expect(StyleSheet.flatten(light.page)?.backgroundColor).toBe(lightColors.bg);

    await act(async () => theme.setAppearance('dark'));
    expect(StyleSheet.flatten(sheet.page)?.backgroundColor).toBe(darkColors.bg);
    expect(tags).toBe(categoryMetaDark);

    await act(async () => theme.setAppearance('light'));
    expect(sheet).toBe(light); // same object as before: built once per palette
    expect(tags).toBe(categoryMeta);
  });
});

describe('the two palettes', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('define exactly the same colours', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as [string, Palette][])('%s: text can be read on what it sits on', (_name, c) => {
    // Body text: AAA. Quiet text and accents: at least AA for normal text on cards.
    expect(contrast(c.ink, c.bg)).toBeGreaterThan(7);
    expect(contrast(c.ink, c.surface)).toBeGreaterThan(7);
    expect(contrast(c.inkSoft, c.surface)).toBeGreaterThan(7);
    expect(contrast(c.muted, c.surface)).toBeGreaterThan(4.5);
    expect(contrast(c.primary, c.surface)).toBeGreaterThan(4.5);
    expect(contrast(c.deep, c.surface)).toBeGreaterThan(4.5);
    expect(contrast(c.danger, c.surface)).toBeGreaterThan(4.5);
    expect(contrast(c.onAccent, c.primary)).toBeGreaterThan(4.5);
    expect(contrast(c.onAccent, c.deep)).toBeGreaterThan(4.5);
    expect(contrast(c.bg, c.ink)).toBeGreaterThan(7); // the ink-coloured button and its label
  });

  it('dark really is dark, and light really is light', () => {
    expect(luminance(darkColors.bg)).toBeLessThan(0.02);
    expect(luminance(darkColors.surface)).toBeLessThan(0.03);
    expect(luminance(lightColors.bg)).toBeGreaterThan(0.85);
  });

  it('category tags stay readable on a dark card', () => {
    for (const m of Object.values(categoryMetaDark)) expect(contrast(m.color, darkColors.surface)).toBeGreaterThan(4.5);
  });
});
