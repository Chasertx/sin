import {
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AgeGate } from '@/components/AgeGate';
import { loadAgeGate, type AgeGateStatus } from '@/lib/ageGate';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useColors, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

/** Everything inside the theme, so even the outermost background follows it. */
function Shell() {
  const colors = useColors();
  const [fontsLoaded] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionProvider>{fontsLoaded ? <RootNavigator /> : null}</SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const colors = useColors();
  const { scheme, isLoaded: themeLoaded } = useTheme();
  const { session, isLoading, needsOnboarding } = useSession();
  // Has this phone confirmed its owner is 18 or older? Null while that's being read.
  const [age, setAge] = useState<AgeGateStatus | null>(null);

  useEffect(() => {
    void loadAgeGate().then(setAge);
  }, []);

  // Wait for the saved appearance too, so the app never opens in the wrong theme and then flips.
  const ready = !isLoading && age !== null && themeLoaded;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // Adults only: until the age check is passed nothing else exists, signed in or not.
  if (age !== 'passed') return <AgeGate blocked={age === 'blocked'} onPassed={() => setAge('passed')} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!!session && !needsOnboarding}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* Signed in with Google or Apple, but the rest of sign-up isn't done yet. */}
        <Stack.Protected guard={!!session && needsOnboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
