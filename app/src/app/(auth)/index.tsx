import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Field, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { parseSsoRedirect } from '@/lib/sso';
import { useSession } from '@/lib/session';
import { brand, fonts, makeStyles, radius, tint, useColors } from '@/lib/theme';

WebBrowser.maybeCompleteAuthSession();

const providerIcon: Record<string, keyof typeof Ionicons.glyphMap> = { Google: 'logo-google', Apple: 'logo-apple' };

export default function Welcome() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [providers, setProviders] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .ssoProviders()
      .then((p) => setProviders([...p].sort((a) => (a === 'Apple' ? -1 : 1))))
      .catch(() => setProviders([]));
  }, []);

  async function login() {
    if (!email.trim() || !password) return Alert.alert('Almost', 'Email and password, please.');
    setBusy('email');
    try {
      await signIn(await api.login(email.trim(), password));
    } catch (e) {
      Alert.alert('Nope', e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function sso(provider: string) {
    setBusy(provider);
    try {
      const returnUrl = Linking.createURL('auth');
      const result = await WebBrowser.openAuthSessionAsync(api.ssoStartUrl(provider, returnUrl), returnUrl, {
        preferEphemeralSession: true,
      });
      if (result.type !== 'success') return;
      const outcome = parseSsoRedirect(result.url);
      if (outcome.kind === 'error') return Alert.alert(`${provider} sign-in`, outcome.message);
      await signIn(outcome.auth);
    } catch (e) {
      Alert.alert(`${provider} sign-in failed`, String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <LinearGradient colors={brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.blob, { top: -80, right: -60, backgroundColor: tint(colors.white, 0.28) }]} />
      <View style={[styles.blob, { bottom: 120, left: -90, backgroundColor: tint(colors.white, 0.18) }]} />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32, paddingHorizontal: 22 }}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Image source={require('@/assets/images/splash-icon.png')} style={{ width: 54, height: 54 }} contentFit="contain" accessibilityLabel="Ick logo" />
          </View>
          <Text style={styles.brand}>Ick</Text>
          <Text style={styles.tagline}>What can you handle?</Text>
          <Text style={styles.pitch}>Everyone's got problems. Here you lead with them.</Text>
        </View>

        <Card style={styles.sheet}>
          {providers.map((p) => (
            <Button
              key={p}
              variant={p === 'Apple' ? 'dark' : 'white'}
              title={`Continue with ${p}`}
              icon={<Ionicons name={providerIcon[p] ?? 'log-in-outline'} size={20} color={p === 'Apple' ? colors.white : colors.ink} />}
              loading={busy === p}
              onPress={() => sso(p)}
            />
          ))}
          {providers.length > 0 ? (
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Txt variant="caption">or with email</Txt>
              <View style={styles.divider} />
            </View>
          ) : null}

          <Field placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={login} />
          <Button title="Log in" onPress={login} loading={busy === 'email'} />

          <View style={styles.footerRow}>
            <Txt variant="caption">New here?</Txt>
            <Link href="/register" style={styles.link}>
              Create an account
            </Link>
          </View>
          {__DEV__ ? (
            <Text
              style={styles.demo}
              onPress={() => {
                setEmail('dana@demo.sin');
                setPassword('password123');
              }}>
              ✨ Fill in a demo account
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    blob: { position: 'absolute', width: 260, height: 260, borderRadius: 130 },
    hero: { alignItems: 'center', marginBottom: 28 },
    logo: {
      width: 84,
      height: 84,
      borderRadius: 28,
      backgroundColor: tint(colors.white, 0.25),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      transform: [{ rotate: '-8deg' }],
    },
    brand: { fontFamily: fonts.black, fontSize: 72, lineHeight: 76, color: colors.white, textAlign: 'center', letterSpacing: -2 },
    tagline: { fontFamily: fonts.black, fontSize: 22, color: '#E3FFF5', marginTop: 10 },
    pitch: { fontFamily: fonts.bold, fontSize: 15, color: tint(colors.white, 0.9), marginTop: 6, textAlign: 'center' },
    sheet: { gap: 12, borderRadius: radius.xl, padding: 20 },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
    divider: { flex: 1, height: 1, backgroundColor: colors.line },
    footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 },
    link: { fontFamily: fonts.heavy, fontSize: 14, color: colors.primary },
    demo: { fontFamily: fonts.bold, fontSize: 13, color: colors.deep, textAlign: 'center' },
  }),
);
