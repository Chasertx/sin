/* Shared test setup: swaps native modules for in-memory fakes so screens render under Jest. */
// Gestures: render children as-is; the pan hook returns an inert gesture.
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  return {
    GestureHandlerRootView: RN.View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    usePanGesture: () => ({}),
  };
});

// Animations: apply instantly. Covers the Reanimated + Worklets APIs this app uses.
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const chain: Record<string, unknown> = {};
  for (const m of ['springify', 'damping', 'duration', 'delay', 'stiffness']) chain[m] = () => chain;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (v: unknown, _c?: unknown, cb?: (done: boolean) => void) => (cb?.(true), v),
    withSpring: (v: unknown, _c?: unknown, cb?: (done: boolean) => void) => (cb?.(true), v),
    interpolate: (x: number, input: number[], output: number[]) => {
      const t = (x - input[0]) / (input[input.length - 1] - input[0] || 1);
      return output[0] + Math.min(Math.max(t, 0), 1) * (output[output.length - 1] - output[0]);
    },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    ZoomIn: chain,
    FadeInDown: chain,
    FadeOut: chain,
    LinearTransition: chain,
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...a: unknown[]) => void, ...args: unknown[]) => fn(...args),
  runOnJS: (fn: unknown) => fn,
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Secure storage: a simple in-memory map tests can inspect.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...props }: { children?: unknown }) => require('react').createElement(View, props, children) };
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => require('react').createElement(View, { ...props, testID: 'expo-image' }) };
});

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
}));

jest.mock('expo-linking', () => ({ createURL: jest.fn((path: string) => `exp://127.0.0.1:8081/--/${path}`) }));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { hostUri: '192.168.1.50:8081' } } }));

// expo-router: navigation calls are recorded; focus effects run like normal effects.
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
      React.createElement(Text, { ...rest, onPress: () => router.push(href), accessibilityRole: 'link' }, children),
  };
});

// Alert.alert is recorded; tests can press its buttons via the captured arguments.
import { Alert } from 'react-native';
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

afterEach(() => {
  jest.clearAllMocks();
  (require('expo-secure-store') as { __store: Map<string, string> }).__store.clear();
});
