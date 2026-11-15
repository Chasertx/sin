import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Txt } from '@/components/ui';
import { MIN_AGE, checkBirthDate, formatBirthDigits, saveAgeBlocked, saveAgePassed } from '@/lib/ageGate';
import { brand, fonts, makeStyles, radius, tint, useColors } from '@/lib/theme';

interface Props {
  /** True when this phone already gave an under-18 birth date. */
  blocked: boolean;
  onPassed: () => void;
}

/**
 * The very first screen: nothing else in the app (not even log in) is reachable until someone
 * gives a date of birth that makes them 18 or older. An under-18 answer is remembered, so the
 * question isn't simply asked again.
 */
export function AgeGate({ blocked: initiallyBlocked, onPassed }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [blocked, setBlocked] = useState(initiallyBlocked);
  /** Just the digits typed so far: MMDDYYYY. */
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (digits.length < 8) return setError('Enter your full date of birth, like 03 / 07 / 1995.');
    const result = checkBirthDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4));
    if (!result.ok) return setError(result.error);
    setBusy(true);
    try {
      if (result.adult) {
        await saveAgePassed();
        onPassed();
      } else {
        await saveAgeBlocked(result.birth);
        setBlocked(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinearGradient colors={brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.hero}>
            <Text style={styles.brand}>Ick</Text>
            <Text style={styles.tagline}>{blocked ? 'Not yet.' : 'Before you come in'}</Text>
          </View>

          {blocked ? (
            <Card style={styles.sheet}>
              <Text style={styles.emoji}>🚫</Text>
              <Txt variant="heading" style={{ textAlign: 'center' }}>
                Ick is for adults only
              </Txt>
              <Txt style={styles.muted}>
                You need to be {MIN_AGE} or older to use Ick, so we can't let you in. Come back when you are.
              </Txt>
            </Card>
          ) : (
            <Card style={styles.sheet}>
              <Txt variant="heading">When were you born?</Txt>
              <Txt variant="caption">We ask everyone. Your birth date is checked on this phone and never sent to us.</Txt>

              <View style={{ gap: 6 }}>
                <Txt variant="label">Date of birth</Txt>
                {/* One box, so nothing typed quickly can fall between fields. */}
                <TextInput
                  accessibilityLabel="Date of birth"
                  placeholder="MM / DD / YYYY"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  returnKeyType="done"
                  maxLength={14}
                  value={formatBirthDigits(digits)}
                  onChangeText={(text) => {
                    setDigits(text.replace(/\D/g, '').slice(0, 8));
                    setError(null);
                  }}
                  onSubmitEditing={submit}
                  style={styles.input}
                />
              </View>

              {error ? (
                <Txt accessibilityRole="alert" style={styles.error}>
                  {error}
                </Txt>
              ) : null}

              <Button title="Continue" onPress={submit} loading={busy} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    content: { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'center' },
    hero: { alignItems: 'center', marginBottom: 28 },
    brand: { fontFamily: fonts.black, fontSize: 72, lineHeight: 76, color: colors.white, letterSpacing: -2 },
    tagline: { fontFamily: fonts.black, fontSize: 22, color: '#E3FFF5', marginTop: 10 },
    sheet: { gap: 14, borderRadius: radius.xl, padding: 20 },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.line,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: fonts.heavy,
      fontSize: 22,
      letterSpacing: 1,
      color: colors.ink,
      textAlign: 'center',
    },
    error: { color: colors.danger, fontFamily: fonts.bold, backgroundColor: tint(colors.coral, 0.1), borderRadius: radius.sm, padding: 10 },
    emoji: { fontSize: 48, textAlign: 'center' },
    muted: { color: colors.muted, textAlign: 'center' },
  }),
);
