import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafetySheet } from '@/components/SafetySheet';
import { PeekCard, SwipeCard, type SwipeCardHandle } from '@/components/SwipeCard';
import { Avatar, Button, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, coralish, fonts, minty, radius, shadow, sunset, tint } from '@/lib/theme';
import type { Profile } from '@/lib/types';

export default function Discover() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [queue, setQueue] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ profile: Profile; matchId: string } | null>(null);
  const [reporting, setReporting] = useState<Profile | null>(null);
  const cardRef = useRef<SwipeCardHandle>(null);
  const loadedFor = useRef<string | null>(null);

  const refill = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await api.feed();
      setQueue((q) => [...q, ...fresh.filter((p) => !q.some((x) => x.id === p.id))]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (loadedFor.current !== session?.userId) {
        loadedFor.current = session?.userId ?? null;
        setQueue([]);
        void refill();
      }
    }, [session?.userId, refill]),
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Get What Ya Get</Text>
          <Txt variant="caption">Swipe right if you can handle it</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {top ? (
            <Pressable onPress={() => setReporting(top)} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Report or block ${top.displayName}`}>
              <Ionicons name="flag-outline" size={19} color={colors.ink} />
            </Pressable>
          ) : null}
          <Pressable onPress={refill} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <View style={styles.deck}>
        {next ? <PeekCard profile={next} /> : null}
        {top ? (
          <SwipeCard key={top.id} ref={cardRef} profile={top} onSwiped={onSwiped} />
        ) : loading ? (
          <ActivityIndicator size="large" color={colors.pink} />
        ) : (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>{error ? '🔌' : '🫠'}</Text>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              {error ? 'Lost the connection' : "You've seen everyone's problems"}
            </Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>
              {error ?? 'Fresh disasters arrive daily. Check back soon.'}
            </Txt>
            <Button title="Look again" onPress={refill} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </View>
        )}
      </View>

      {top ? (
        <View style={styles.actions}>
          <ActionButton colors={coralish} icon="close" label="Too much" onPress={() => cardRef.current?.swipe(false)} />
          <ActionButton colors={minty} icon="heart" label="I can handle that" big onPress={() => cardRef.current?.swipe(true)} />
        </View>
      ) : null}

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
      <LinearGradient colors={[tint('#FF8A4C', 0.97), tint('#FF4E88', 0.97), tint('#7B5CFF', 0.97)]} style={styles.matchWrap}>
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
  brand: { fontFamily: fonts.black, fontSize: 26, color: colors.pink, letterSpacing: -0.5 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
  deck: { flex: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 48, paddingBottom: 14 },
  actionLabel: { fontFamily: fonts.heavy, fontSize: 13, color: colors.inkSoft },
  matchWrap: { flex: 1, justifyContent: 'center', padding: 28 },
  matchInner: { alignItems: 'center', gap: 14 },
  matchTitle: { fontFamily: fonts.black, fontSize: 44, color: colors.white, letterSpacing: -1 },
  matchSub: { fontFamily: fonts.bold, fontSize: 17, color: tint(colors.white, 0.92), textAlign: 'center', lineHeight: 24 },
  avatars: { flexDirection: 'row', marginVertical: 18 },
  avatarRing: { borderWidth: 5, borderColor: colors.white, borderRadius: radius.pill },
  keepSwiping: { fontFamily: fonts.heavy, fontSize: 15, color: colors.white, marginTop: 4 },
});
