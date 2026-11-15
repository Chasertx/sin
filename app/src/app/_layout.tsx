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
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionProvider>{fontsLoaded ? <RootNavigator /> : null}</SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  // Has this phone confirmed its owner is 18 or older? Null while that's being read.
  const [age, setAge] = useState<AgeGateStatus | null>(null);

  useEffect(() => {
    void loadAgeGate().then(setAge);
  }, []);

  const ready = !isLoading && age !== null;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // Adults only: until the age check is passed nothing else exists, signed in or not.
  if (age !== 'passed') return <AgeGate blocked={age === 'blocked'} onPassed={() => setAge('passed')} />;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
