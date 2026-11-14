import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { categoryMeta, colors, fonts, radius, shadow, brand, tint } from '@/lib/theme';
import type { FlawCategory } from '@/lib/types';

// ---------- Text ----------
type Variant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label';

const variantStyle: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.black, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.heavy, fontSize: 19, lineHeight: 25 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
};

export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text {...rest} style={[{ color: colors.ink }, variantStyle[variant], style]} />;
}

// ---------- Buttons ----------
interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'gradient' | 'white' | 'ghost' | 'dark';
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'gradient', icon, loading, disabled, style }: ButtonProps) {
  const textColor = variant === 'gradient' || variant === 'dark' ? colors.white : colors.ink;
  const content = (
    <View style={styles.btnInner}>
      {loading ? <ActivityIndicator testID="button-spinner" color={textColor} /> : icon}
      <Text style={[styles.btnText, { color: textColor }]}>{title}</Text>
    </View>
  );

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        variant === 'white' && [styles.btnWhite, shadow],
        variant === 'ghost' && styles.btnGhost,
        variant === 'dark' && styles.btnDark,
        { opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        style,
      ]}>
      {variant === 'gradient' ? (
        <LinearGradient colors={brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

// ---------- Inputs ----------
export function Field({ label, style, ...rest }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label ?? rest.placeholder}
        {...rest}
        style={[styles.input, rest.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }, style]}
      />
    </View>
  );
}

// ---------- Chips ----------
export function Chip({
  label,
  selected,
  onPress,
  color = colors.deep,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: color, borderColor: color } : { borderColor: tint(color, 0.3) },
        { transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}>
      <Text style={[styles.chipText, { color: selected ? colors.white : color }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  render = (o) => o,
  colorFor,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  render?: (o: T) => string;
  colorFor?: (o: T) => string;
}) {
  return (
    <View style={{ gap: 8 }}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <View style={styles.chipRow}>
        {options.map((o) => (
          <Chip key={o} label={render(o)} selected={o === value} onPress={() => onChange(o)} color={colorFor?.(o)} />
        ))}
      </View>
    </View>
  );
}

export function CategoryTag({ category }: { category: FlawCategory }) {
  const m = categoryMeta[category];
  return (
    <View style={[styles.tag, { backgroundColor: tint(m.color, 0.12) }]}>
      <Text style={[styles.tagText, { color: m.color }]}>
        {m.emoji} {m.label}
      </Text>
    </View>
  );
}

// ---------- Cards & avatars ----------
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, shadow, style]}>{children}</View>;
}

const avatarColors = [colors.coral, colors.deep, colors.sky, colors.mint, colors.primary, colors.sunshine];

export function Avatar({ name, uri, size = 56 }: { name: string; uri?: string | null; size?: number }) {
  // Hash the whole name so people with different names rarely share a color.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const bg = avatarColors[Math.abs(hash) % avatarColors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: bg }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={200} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={{ color: colors.white, fontFamily: fonts.black, fontSize: size * 0.42 }}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.pill, overflow: 'hidden', minHeight: 56, justifyContent: 'center' },
  btnGradient: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 22 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 22 },
  btnText: { fontFamily: fonts.heavy, fontSize: 17 },
  btnWhite: { backgroundColor: colors.white },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 2, borderColor: tint(colors.white, 0.6) },
  btnDark: { backgroundColor: colors.ink },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface },
  chipText: { fontFamily: fonts.heavy, fontSize: 14 },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: fonts.heavy, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
