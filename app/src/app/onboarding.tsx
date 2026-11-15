import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChipGroup, Field, Txt } from '@/components/ui';
import { api, ApiError, PRIVACY_URL, TERMS_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, radius, tint } from '@/lib/theme';
import { GENDERS, INTERESTS, genderLabel, type Gender, type InterestedIn } from '@/lib/types';

/**
 * The rest of sign-up for someone who came in with Google or Apple. Whatever the provider told us
 * (first name, email) is already filled in; only the things it can't tell us are left to answer.
 * Nothing else in the app opens until this is saved.
 */
export default function FinishSignUp() {
  const insets = useSafeAreaInsets();
  const { session, email, finishOnboarding, signOut } = useSession();
  const [name, setName] = useState(session?.displayName ?? '');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [interestedIn, setInterestedIn] = useState<InterestedIn | null>(null);
  const [busy, setBusy] = useState(false);

  // The server is the source of truth: if this account is in fact already set up, carry on in.
  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (me.age >= 18) finishOnboarding();
        else if (me.displayName) setName((typed) => typed || me.displayName);
      })
      .catch(() => {});
  }, [finishOnboarding]);

  async function submit() {
    const ageNum = parseInt(age, 10);
    if (!name.trim()) return Alert.alert('Name', 'What should people call you?');
    if (!ageNum) return Alert.alert('Age', 'Pop your age in as a number.');
    if (!gender || !interestedIn) return Alert.alert('Almost', "Tell us who you are and who you're into.");
    setBusy(true);
    try {
      await api.updateMe({ displayName: name.trim(), age: ageNum, gender, interestedIn, headline: null, heightInches: null, ethnicity: null });
      finishOnboarding();
    } catch (e) {
      Alert.alert('Hmm', e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32, paddingHorizontal: 22, gap: 16 }}
        keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6, marginBottom: 6 }}>
          <Txt variant="title">Nearly in. 👋</Txt>
          <Txt style={{ color: colors.muted }}>We've filled in what your account told us. Just a few things it couldn't.</Txt>
        </View>

        {email ? (
          <View style={styles.signedIn} accessible accessibilityLabel={`Signed in as ${email}`}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="label">Signed in as</Txt>
              <Txt numberOfLines={1}>{email}</Txt>
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Field label="First name" value={name} onChangeText={setName} maxLength={50} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
          </View>
        </View>
        <Txt variant="caption">Your age can't be changed once it's saved.</Txt>

        <ChipGroup label="I am" options={GENDERS} value={gender} onChange={setGender} render={genderLabel} colorFor={() => colors.deep} />
        <ChipGroup label="Into" options={INTERESTS} value={interestedIn} onChange={setInterestedIn} colorFor={() => colors.primary} />

        <Button title="Let's go" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
        <Txt variant="caption" style={{ textAlign: 'center' }}>
          By continuing you confirm you're 18 or older and agree to our{' '}
          <Txt variant="caption" style={styles.legal} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
            Terms & community rules
          </Txt>{' '}
          and{' '}
          <Txt variant="caption" style={styles.legal} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
            Privacy policy
          </Txt>
          .
        </Txt>
        <Button title="Use a different account" variant="ghost" onPress={() => void signOut()} style={styles.other} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tint(colors.primary, 0.1), borderRadius: radius.md, padding: 14 },
  row: { flexDirection: 'row', gap: 12 },
  legal: { color: colors.deep, textDecorationLine: 'underline' },
  other: { borderColor: colors.line },
});
