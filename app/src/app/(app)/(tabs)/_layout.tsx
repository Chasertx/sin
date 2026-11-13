import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';

import { colors, fonts } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (active: IconName, idle: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? active : idle} size={size} color={color as string} />
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.pink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.heavy, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          elevation: 12,
          shadowColor: '#7B3F2A',
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: icon('flame', 'flame-outline') }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches', tabBarIcon: icon('chatbubbles', 'chatbubbles-outline') }} />
      <Tabs.Screen name="me" options={{ title: 'My Problems', tabBarIcon: icon('happy', 'happy-outline') }} />
    </Tabs>
  );
}
