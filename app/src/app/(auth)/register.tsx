import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChipGroup, Field, Txt } from '@/components/ui';
import { api, ApiError, PRIVACY_URL, TERMS_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { GENDERS, INTERESTS, genderLabel, type Gender, type InterestedIn } from '@/lib/types';

export default function Register() {
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('Woman');
  const [interestedIn, setInterestedIn] = useState<InterestedIn>('Everyone');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const ageNum = parseInt(age, 10);
    if (!ageNum) return Alert.alert('Age', 'Pop your age in as a number.');
    setBusy(true);
    try {
      await signIn(
        await api.register({ email: email.trim(), password, displayName: name.trim(), age: ageNum, gender, interestedIn }),
      );
      // Brand new: nobody can see you until you confess something.
      router.replace('/me');
    } catch (e) {
      Alert.alert('Hmm', e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 22, gap: 16 }}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>

        <View style={{ gap: 6, marginBottom: 6 }}>
          <Txt variant="title">Hey, you. 👋</Txt>
          <Txt style={{ color: colors.muted }}>Other apps want your best angle. We want the bloopers.</Txt>
        </View>

        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" placeholder="8+ characters" value={password} onChangeText={setPassword} secureTextEntry />
        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Field label="First name" value={name} onChangeText={setName} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
          </View>
        </View>

        <ChipGroup label="I am" options={GENDERS} value={gender} onChange={setGender} render={genderLabel} colorFor={() => colors.violet} />
        <ChipGroup label="Into" options={INTERESTS} value={interestedIn} onChange={setInterestedIn} colorFor={() => colors.pink} />

        <Button title="Let's go" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
        <Txt variant="caption" style={{ textAlign: 'center' }}>
          By creating an account you confirm you're 18 or older and agree to our{' '}
          <Txt variant="caption" style={styles.legal} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
            Terms & community rules
          </Txt>{' '}
          and{' '}
          <Txt variant="caption" style={styles.legal} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
            Privacy policy
          </Txt>
          . Abusive content isn't tolerated.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  legal: { color: colors.violet, textDecorationLine: 'underline' },
});
