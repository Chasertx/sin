import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="confessions" />
    </Stack>
  );
}
