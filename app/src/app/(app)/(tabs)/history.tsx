import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryTimeline } from '@/components/HistoryTimeline';
import { Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { MatchHistoryEntry } from '@/lib/types';

/** Who you matched with, when, and whether it ended. */
export default function History() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await api.history());
      setError(null);
    } catch (e) {
      // Keep whatever is already on screen; only say so if there's nothing to show.
      setError(e instanceof ApiError ? e.message : 'Pull down to try again.');
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Txt variant="title" style={{ paddingHorizontal: 20 }}>
        History
      </Txt>
      <Txt variant="caption" style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        Everyone you matched with, and how it went ⏳
      </Txt>

      <HistoryTimeline
        entries={entries}
        loaded={loaded}
        error={entries.length === 0 ? error : null}
        refreshing={refreshing}
        onRefresh={() => (setRefreshing(true), load())}
        onOpen={(m) =>
          m.matchId &&
          router.push({
            pathname: '/chat/[id]',
            params: { id: m.matchId, name: m.otherName ?? '', photo: m.otherPhotoUrl ?? '', userId: m.otherUserId ?? '' },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
