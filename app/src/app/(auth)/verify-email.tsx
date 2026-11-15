import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { makeStyles, useColors } from '@/lib/theme';

export default function VerifyEmail() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const params = useLocalSearchParams<{ token?: string; userId?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);

  async function verify() {
    if (!token.trim()) return Alert.alert('Token', 'Paste the code from your email.');
    if (!params.userId) return Alert.alert('Error', 'User ID is missing.');

    setBusy(true);
    try {
      await api.verifyEmail(params.userId, token.trim());
      setVerified(true);
      // Now sign in with their email and password (they must log in normally)
      Alert.alert('Success!', 'Your email is verified. Now sign in with your email and password.', [
        {
          text: 'Go to sign in',
          onPress: () => router.replace('/(auth)/'),
        },
      ]);
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
          <Txt variant="title">Check your email 📧</Txt>
          <Txt style={{ color: colors.muted }}>We sent you a verification link. Click it, or paste the code below.</Txt>
        </View>

        {!verified && (
          <>
            <Field
              label="Verification code"
              placeholder="From the email we sent"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              editable={!busy}
            />
            <Button title="Verify email" onPress={verify} loading={busy} />

            <View style={{ gap: 8, paddingVertical: 8 }}>
              <Txt variant="caption" style={{ color: colors.muted }}>
                The link in your email works too — just click it to verify automatically.
              </Txt>
              <Txt variant="caption" style={{ color: colors.muted }}>
                Code expires in 24 hours. Didn't get the email? Check spam or sign up again.
              </Txt>
            </View>
          </>
        )}

        {verified && (
          <View style={{ gap: 12, paddingVertical: 24, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
            <Txt variant="heading" style={{ textAlign: 'center' }}>
              Verified!
            </Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>
              Now sign in to get started.
            </Txt>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    back: { width: 40, height: 40, justifyContent: 'center' },
  }),
);
