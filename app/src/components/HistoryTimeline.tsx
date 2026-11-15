import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { Avatar, Txt } from '@/components/ui';
import { buildTimeline, eventTitle, formatLasted, formatWhen, summarize, type TimelineEvent } from '@/lib/history';
import { colors, fonts, radius, shadow, tint } from '@/lib/theme';
import type { MatchHistoryEntry } from '@/lib/types';

interface Props {
  entries: MatchHistoryEntry[];
  /** False until the first load finishes, so the empty state doesn't flash. */
  loaded: boolean;
  /** Set when loading failed and there's nothing to show. */
  error?: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** Tapping a match that's still going opens its chat. */
  onOpen: (entry: MatchHistoryEntry) => void;
}

/** Every match and unmatch as a timeline, newest first, grouped by month. */
export function HistoryTimeline({ entries, loaded, error, refreshing, onRefresh, onOpen }: Props) {
  const sections = useMemo(() => buildTimeline(entries), [entries]);
  const stats = summarize(entries);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(e) => e.key}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        entries.length > 0 ? (
          <View style={styles.stats}>
            <Stat value={stats.total} label="Matches" />
            <Stat value={stats.current} label="Still going" />
            <Stat value={stats.ended} label="Ended" />
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        loaded ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>{error ? '🔌' : '⏳'}</Text>
            <Txt variant="heading">{error ? "Couldn't load your history" : 'No history yet'}</Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>
              {error ?? 'Every match shows up here with its date, and stays even if you unmatch.'}
            </Txt>
          </View>
        ) : undefined
      }
      renderSectionHeader={({ section }) => (
        <Txt variant="label" style={styles.month}>
          {section.title}
        </Txt>
      )}
      renderItem={({ item, index, section }) => (
        <Row event={item} first={index === 0} last={index === section.data.length - 1} onOpen={onOpen} />
      )}
    />
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={[styles.stat, shadow]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Txt variant="caption">{label}</Txt>
    </View>
  );
}

function Row({ event, first, last, onOpen }: { event: TimelineEvent; first: boolean; last: boolean; onOpen: Props['onOpen'] }) {
  const { entry, kind } = event;
  const matched = kind === 'matched';
  const current = matched && !entry.endedAt && !!entry.matchId;
  const title = eventTitle(event);
  const when = formatWhen(event.at);

  const card = (
    <>
      <Avatar name={entry.otherName ?? '?'} uri={current ? entry.otherPhotoUrl : null} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={styles.title}>{title}</Txt>
        <Txt variant="caption">{when}</Txt>
        {current ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Still matched</Text>
          </View>
        ) : !matched && entry.endedAt ? (
          <Txt variant="caption">{formatLasted(entry.matchedAt, entry.endedAt)}</Txt>
        ) : null}
      </View>
      {current ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : null}
    </>
  );

  return (
    <View style={styles.row}>
      {/* The rail: a line running through the month, with a marker for this event. */}
      <View style={styles.rail}>
        <View style={[styles.line, first && { top: 30 }, last && { bottom: undefined, height: 30 }, first && last && { height: 0 }]} />
        <View style={[styles.marker, matched ? styles.markerMatched : styles.markerEnded]}>
          <Ionicons name={matched ? 'heart' : 'heart-dislike'} size={15} color={matched ? colors.white : colors.coral} />
        </View>
      </View>

      {current ? (
        <Pressable
          onPress={() => onOpen(entry)}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${when}. Open chat`}
          style={({ pressed }) => [styles.card, shadow, pressed && { opacity: 0.85 }]}>
          {card}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${title}, ${when}`} style={[styles.card, shadow, !matched && styles.cardEnded]}>
          {card}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 28, flexGrow: 1 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontFamily: fonts.black, fontSize: 24, color: colors.primary },
  month: { marginTop: 18, marginBottom: 10, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 40, alignItems: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.line },
  marker: { marginTop: 16, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  markerMatched: { backgroundColor: colors.primary },
  markerEnded: { backgroundColor: colors.surface, borderWidth: 2, borderColor: tint(colors.coral, 0.5) },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  cardEnded: { backgroundColor: colors.surfaceAlt, elevation: 0, shadowOpacity: 0 },
  title: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 21 },
  badge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: tint(colors.primary, 0.12), borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: fonts.heavy, fontSize: 12, color: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
});
