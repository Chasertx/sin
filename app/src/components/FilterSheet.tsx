import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RangeSlider } from '@/components/RangeSlider';
import { Button, MultiChipGroup, Txt } from '@/components/ui';
import {
  AGE,
  DISTANCE_STOPS,
  HEIGHT,
  NO_FILTERS,
  activeFilterCount,
  describeAge,
  describeDistance,
  describeEthnicities,
  describeHeight,
  toSliders,
  withAge,
  withDistance,
  withHeight,
} from '@/lib/filters';
import { colors, fonts, radius, tint } from '@/lib/theme';
import { ETHNICITIES, ethnicityLabel, formatHeight, type Preferences } from '@/lib/types';

interface Props {
  visible: boolean;
  /** The filters currently in force; the sheet edits a copy until it's saved. */
  current: Preferences;
  onClose: () => void;
  onApply: (next: Preferences) => Promise<void>;
  /** The label on the button that saves. */
  applyLabel?: string;
}

/** Bottom sheet for choosing who shows up in Discover: age, distance, height and race / ethnicity. */
export function FilterSheet({ visible, current, onClose, onApply, applyLabel = 'Save filters' }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);

  // Start from what's saved each time the sheet opens, so a cancelled edit doesn't linger.
  useEffect(() => {
    if (visible) setDraft(current);
  }, [visible, current]);

  const sliders = toSliders(draft);
  const narrowed = activeFilterCount(draft) > 0;

  const apply = async () => {
    setSaving(true);
    try {
      await onApply(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <Animated.View entering={SlideInDown.duration(260)} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Txt variant="title">Who you want to see</Txt>
            <Txt variant="caption">Ick only shows you people in the United States.</Txt>
          </View>
          {narrowed ? (
            <Pressable onPress={() => setDraft(NO_FILTERS)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Reset filters">
              <Text style={styles.reset}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <Section icon="calendar-outline" title="Age" value={describeAge(draft)}>
            <RangeSlider
              min={AGE.min}
              max={AGE.max}
              minGap={2}
              values={sliders.age}
              onChange={(v) => setDraft(withAge(draft, v))}
              labels={['Youngest age', 'Oldest age']}
              format={(v) => (v >= AGE.max ? `${AGE.max} or older` : String(v))}
            />
          </Section>

          <Section icon="navigate-outline" title="Distance" value={describeDistance(draft)}>
            <RangeSlider
              min={0}
              max={DISTANCE_STOPS.length - 1}
              values={[sliders.distance]}
              onChange={([stop]) => setDraft(withDistance(draft, stop))}
              labels={['Furthest distance']}
              format={(stop) => describeDistance(withDistance(draft, stop))}
            />
          </Section>

          <Section
            icon="resize-outline"
            title="Height"
            value={describeHeight(draft)}
            note={draft.minHeightInches !== null || draft.maxHeightInches !== null ? "Only people who've added their height will show up." : undefined}>
            <RangeSlider
              min={HEIGHT.min}
              max={HEIGHT.max}
              minGap={2}
              values={sliders.height}
              onChange={(v) => setDraft(withHeight(draft, v))}
              labels={['Shortest height', 'Tallest height']}
              format={formatHeight}
            />
          </Section>

          <Section
            icon="people-outline"
            title="Race / ethnicity"
            value={describeEthnicities(draft)}
            note={draft.ethnicities.length > 0 ? "Only people who've shared theirs will show up." : 'Leave these off to see everyone.'}>
            <MultiChipGroup
              options={ETHNICITIES}
              values={draft.ethnicities}
              onChange={(ethnicities) => setDraft({ ...draft, ethnicities })}
              render={ethnicityLabel}
            />
          </Section>
        </ScrollView>

        <Button title={applyLabel} onPress={apply} loading={saving} style={{ marginTop: 6 }} />
      </Animated.View>
      </View>
    </Modal>
  );
}

function Section({
  icon,
  title,
  value,
  note,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={16} color={colors.primary} />
        </View>
        <Txt variant="heading" style={{ flex: 1 }}>
          {title}
        </Txt>
        <Text style={styles.value}>{value}</Text>
      </View>
      {children}
      {note ? <Txt variant="caption">{note}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: tint(colors.ink, 0.45) },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4, marginBottom: 12 },
  reset: { fontFamily: fonts.heavy, fontSize: 15, color: colors.primary, paddingTop: 8 },
  body: { gap: 12, paddingBottom: 12 },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.heavy, fontSize: 15, color: colors.primary },
});
