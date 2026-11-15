import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/components/FilterSheet';
import { ProfileSheet } from '@/components/ProfileSheet';
import { SafetySheet } from '@/components/SafetySheet';
import { PeekCard, SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';
import { Avatar, Button, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { NO_FILTERS, activeFilterCount, filtersVersion } from '@/lib/filters';
import { shareLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { colors, coralish, fonts, minty, radius, shadow, brand, tint } from '@/lib/theme';
import type { Preferences, Profile } from '@/lib/types';

/**
 * Why Discover is closed. Ick is US-only, so nobody browses until the phone has shared a US location.
 * - ask: we need permission (or haven't asked yet)
 * - blocked: location is switched off for Ick in the phone's settings
 * - outside: the phone is outside the United States
 * - unavailable: allowed, but no position came back
 */
type Gate = 'ask' | 'blocked' | 'outside' | 'unavailable';

const gates: Record<Gate, { emoji: string; title: string; text: string; action: string }> = {
  ask: {
    emoji: '📍',
    title: 'Where are you?',
    text: "Ick is only for people in the United States, and shows you who's nearby. Your exact location stays private: other people only ever see how far away you are.",
    action: 'Share my location',
  },
  blocked: {
    emoji: '📍',
    title: 'Location is switched off',
    text: "Ick needs your location to check you're in the United States. Turn it on for Ick in your phone's settings, then come back.",
    action: 'Open settings',
  },
  outside: {
    emoji: '🌎',
    title: "Ick isn't here yet",
    text: 'Right now Ick only works in the United States.',
    action: 'Check again',
  },
  unavailable: {
    emoji: '🛰️',
    title: "We couldn't find you",
    text: "Make sure location is turned on and you're online, then try again.",
    action: 'Try again',
  },
};

export default function Discover() {
  const insets = useSafeAreaInsets();
  const { session, requireOnboarding } = useSession();
  const [queue, setQueue] = useState<Profile[]>([]);
  /** The person whose full profile is open. */
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ profile: Profile; matchId: string } | null>(null);
  const [reporting, setReporting] = useState<Profile | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [filters, setFilters] = useState<Preferences>(NO_FILTERS);
  const [filtering, setFiltering] = useState(false);
  const cardRef = useRef<SwipeCardHandle>(null);
  const loadedFor = useRef<string | null>(null);
  const loadedFilters = useRef(0);

  /** @param ifLocationNeeded which gate to show if the server says it has no location for us. */
  const refill = useCallback(async (ifLocationNeeded: Gate = 'ask') => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await api.feed();
      setGate(null);
      setQueue((q) => [...q, ...fresh.filter((p) => !q.some((x) => x.id === p.id))]);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'location_required') setGate(ifLocationNeeded);
      // Signed in with Google or Apple and never finished signing up: back to that page.
      else if (e instanceof ApiError && e.code === 'profile_required') requireOnboarding();
      else setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  /** Opening Discover: quietly refresh our location if we're already allowed to, then load people. */
  const start = useCallback(async () => {
    setQueue([]);
    setGate(null);
    setLoading(true);
    api.preferences().then(setFilters).catch(() => {});
    const outcome = await shareLocation({ ask: false });
    if (outcome === 'outside') {
      setGate('outside');
      setLoading(false);
      return;
    }
    await refill(outcome === 'ok' || outcome === 'needs-permission' ? 'ask' : outcome);
  }, [refill]);

  /** The button on the gate: ask for location (or send them to settings) and try again. */
  const openGate = async () => {
    if (gate === 'blocked') {
      Linking.openSettings().catch(() => {});
      return;
    }
    setLoading(true);
    const outcome = await shareLocation({ ask: true });
    if (outcome === 'ok') return refill();
    setGate(outcome === 'needs-permission' ? 'ask' : outcome);
    setLoading(false);
  };

  const applyFilters = async (next: Preferences) => {
    try {
      setFilters(await api.savePreferences(next));
      setFiltering(false);
      setQueue([]);
      await refill();
    } catch (e) {
      Alert.alert('Hmm', e instanceof ApiError ? e.message : String(e));
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (loadedFor.current !== session?.userId) {
        loadedFor.current = session?.userId ?? null;
        loadedFilters.current = filtersVersion();
        void start();
      } else if (loadedFilters.current !== filtersVersion()) {
        // The filters were changed on the Possibly Icks tab: the people already loaded no longer apply.
        loadedFilters.current = filtersVersion();
        setQueue([]);
        api.preferences().then(setFilters).catch(() => {});
        void refill();
      }
    }, [session?.userId, start, refill]),
  );

  const onSwiped = useCallback(
    (canHandleIt: boolean) => {
      const [top, ...rest] = queue;
      if (!top) return;
      setQueue(rest);
      api
        .swipe(top.id, canHandleIt)
        .then((r) => {
          if (r.isMatch && r.matchId) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setMatch({ profile: top, matchId: r.matchId });
          }
        })
        .catch(() => {});
      if (rest.length < 3) void refill();
    },
    [queue, refill],
  );

  const [top, next] = queue;
  const filterCount = activeFilterCount(filters);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Ick</Text>
          <Txt variant="caption">Swipe right if you can handle it</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {top ? (
            <Pressable onPress={() => setReporting(top)} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Report or block ${top.displayName}`}>
              <Ionicons name="flag-outline" size={19} color={colors.ink} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => refill()} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <View style={styles.deck}>
        {next ? <PeekCard profile={next} /> : null}
        {top ? (
          <SwipeCard key={top.id} ref={cardRef} profile={top} onSwiped={onSwiped} onOpen={() => setViewing(top)} />
        ) : loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : gate ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>{gates[gate].emoji}</Text>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              {gates[gate].title}
            </Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>{gates[gate].text}</Txt>
            <Button title={gates[gate].action} onPress={openGate} style={{ alignSelf: 'stretch', marginTop: 8 }} />
            {gate === 'blocked' ? (
              <Pressable onPress={() => void start()} hitSlop={10} accessibilityRole="button">
                <Text style={styles.textLink}>I've turned it on</Text>
              </Pressable>
            ) : null}
          </View>
        ) : error ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🔌</Text>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              Lost the connection
            </Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>{error}</Txt>
            <Button title="Look again" onPress={() => refill()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </View>
        ) : filterCount > 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🔍</Text>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              Nobody fits those filters yet
            </Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>Widen them a little, or check back soon.</Txt>
            <Button title="Change filters" onPress={() => setFiltering(true)} style={{ alignSelf: 'stretch', marginTop: 8 }} />
            <Pressable onPress={() => refill()} hitSlop={10} accessibilityRole="button">
              <Text style={styles.textLink}>Look again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🫠</Text>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              You've seen everyone's problems
            </Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>Fresh disasters arrive daily. Check back soon.</Txt>
            <Button title="Look again" onPress={() => refill()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </View>
        )}
      </View>

      {top ? (
        <View style={styles.actions}>
          <ActionButton colors={coralish} icon="close" label="Too much" onPress={() => cardRef.current?.swipe(false)} />
          <Pressable
            onPress={() => setViewing(top)}
            style={({ pressed }) => [styles.profileBtn, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`View ${top.displayName}'s full profile`}>
            <Ionicons name="person" size={20} color={colors.primary} />
          </Pressable>
          <ActionButton colors={minty} icon="heart" label="I can handle that" big onPress={() => cardRef.current?.swipe(true)} />
        </View>
      ) : null}

      <FilterSheet visible={filtering} current={filters} onClose={() => setFiltering(false)} onApply={applyFilters} applyLabel="Show people" />

      <ProfileSheet
        profile={viewing}
        onClose={() => setViewing(null)}
        onDecide={(canHandleIt) => {
          setViewing(null);
          cardRef.current?.swipe(canHandleIt);
        }}
        onReport={() => {
          const person = viewing;
          setViewing(null);
          setReporting(person);
        }}
      />

      <SafetySheet
        visible={!!reporting}
        userId={reporting?.id}
        name={reporting?.displayName ?? ''}
        onClose={() => setReporting(null)}
        onRemoved={() => {
          const gone = reporting?.id;
          setReporting(null);
          setQueue((q) => q.filter((p) => p.id !== gone));
        }}
      />

      <MatchCelebration
        match={match}
        myName={session?.displayName ?? 'You'}
        onClose={() => setMatch(null)}
        onChat={() => {
          const m = match;
          setMatch(null);
          if (m) router.push({ pathname: '/chat/[id]', params: { id: m.matchId, name: m.profile.displayName, photo: m.profile.photoUrl ?? '', userId: m.profile.id } });
        }}
      />
    </View>
  );
}

function ActionButton({
  colors: gradient,
  icon,
  label,
  onPress,
  big,
}: {
  colors: readonly [string, string];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  big?: boolean;
}) {
  const size = big ? 74 : 62;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [shadow, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
        <LinearGradient colors={gradient} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={big ? 34 : 28} color={colors.white} />
        </LinearGradient>
      </Pressable>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

function MatchCelebration({
  match,
  myName,
  onClose,
  onChat,
}: {
  match: { profile: Profile; matchId: string } | null;
  myName: string;
  onClose: () => void;
  onChat: () => void;
}) {
  return (
    <Modal visible={!!match} transparent animationType="fade" onRequestClose={onClose}>
      <LinearGradient colors={[tint(brand[0], 0.97), tint(brand[1], 0.97), tint(brand[2], 0.97)]} style={styles.matchWrap}>
        {match ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.matchInner}>
            <Text style={{ fontSize: 64 }}>🎉</Text>
            <Text style={styles.matchTitle}>It's a match!</Text>
            <Text style={styles.matchSub}>
              You and {match.profile.displayName} saw each other's problems and said “I can handle that.”
            </Text>
            <View style={styles.avatars}>
              <View style={[styles.avatarRing, { transform: [{ rotate: '-8deg' }] }]}>
                <Avatar name={myName} size={96} />
              </View>
              <View style={[styles.avatarRing, { transform: [{ rotate: '8deg' }], marginLeft: -18 }]}>
                <Avatar name={match.profile.displayName} uri={match.profile.photoUrl} size={96} />
              </View>
            </View>
            <Button title="Say something brave" variant="white" onPress={onChat} style={{ alignSelf: 'stretch' }} />
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.keepSwiping}>Keep swiping</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  brand: { fontFamily: fonts.black, fontSize: 32, color: colors.primary, letterSpacing: -0.5 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
  textLink: { fontFamily: fonts.heavy, fontSize: 15, color: colors.primary, marginTop: 6 },
  deck: { flex: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 28, paddingBottom: 14 },
  profileBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 32, ...shadow },
  actionLabel: { fontFamily: fonts.heavy, fontSize: 13, color: colors.inkSoft },
  matchWrap: { flex: 1, justifyContent: 'center', padding: 28 },
  matchInner: { alignItems: 'center', gap: 14 },
  matchTitle: { fontFamily: fonts.black, fontSize: 44, color: colors.white, letterSpacing: -1 },
  matchSub: { fontFamily: fonts.bold, fontSize: 17, color: tint(colors.white, 0.92), textAlign: 'center', lineHeight: 24 },
  avatars: { flexDirection: 'row', marginVertical: 18 },
  avatarRing: { borderWidth: 5, borderColor: colors.white, borderRadius: radius.pill },
  keepSwiping: { fontFamily: fonts.heavy, fontSize: 15, color: colors.white, marginTop: 4 },
});
