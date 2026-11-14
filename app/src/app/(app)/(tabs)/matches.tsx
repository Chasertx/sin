import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, fonts, radius, shadow } from '@/lib/theme';
import type { Match } from '@/lib/types';

export default function Matches() {
  const insets = useSafeAreaInsets();
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setMatches(await api.matches());
    } catch {
      // keep what we have
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const fresh = matches.filter((m) => !m.lastMessage);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Txt variant="title" style={{ paddingHorizontal: 20 }}>
        Matches
      </Txt>
      <Txt variant="caption" style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        People who can handle your problems 💞
      </Txt>

      <FlatList
        data={matches}
        keyExtractor={(m) => m.matchId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.pink} />
        }
        ListHeaderComponent={
          fresh.length > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <Txt variant="label" style={{ marginBottom: 10, marginLeft: 4 }}>
                New matches
              </Txt>
              <FlatList
                horizontal
                data={fresh}
                keyExtractor={(m) => `new-${m.matchId}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingHorizontal: 4 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => open(item)} style={{ alignItems: 'center', gap: 6 }}>
                    <View style={styles.newRing}>
                      <Avatar name={item.otherName} uri={item.otherPhotoUrl} size={64} />
                    </View>
                    <Text style={styles.newName}>{item.otherName}</Text>
                  </Pressable>
                )}
              />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>💌</Text>
              <Txt variant="heading">No matches yet</Txt>
              <Txt style={{ color: colors.muted, textAlign: 'center' }}>
                Somebody out there can handle you. Keep swiping.
              </Txt>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.row, shadow, pressed && { opacity: 0.85 }]}>
            <Avatar name={item.otherName} uri={item.otherPhotoUrl} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="heading">{item.otherName}</Txt>
              <Txt variant="caption" numberOfLines={1}>
                {item.lastMessage ?? 'New match! Ask about their worst problem 👀'}
              </Txt>
            </View>
            {!item.lastMessage ? <View style={styles.dot} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

function open(m: Match) {
  router.push({ pathname: '/chat/[id]', params: { id: m.matchId, name: m.otherName, photo: m.otherPhotoUrl ?? '', userId: m.otherUserId } });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, padding: 14, borderRadius: radius.lg },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.pink },
  newRing: { padding: 3, borderRadius: 40, borderWidth: 3, borderColor: colors.pink },
  newName: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
});
