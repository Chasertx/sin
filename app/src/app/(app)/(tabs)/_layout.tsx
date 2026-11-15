import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, shadow } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (active: IconName, idle: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? active : idle} size={size} color={color as string} />
  );

export default function TabsLayout() {
  // Leave room for the phone's own bar (Android back/home/recents buttons, or the iPhone home indicator).
  const bottom = Math.max(useSafeAreaInsets().bottom, 10);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.heavy, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 58 + bottom,
          paddingTop: 8,
          paddingBottom: bottom,
          elevation: 12,
          shadowColor: shadow.shadowColor,
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: icon('flame', 'flame-outline') }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches', tabBarIcon: icon('chatbubbles', 'chatbubbles-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time', 'time-outline') }} />
      <Tabs.Screen name="me" options={{ title: 'Possibly Icks', tabBarIcon: icon('happy', 'happy-outline') }} />
    </Tabs>
  );
}
