import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, CategoryTag, ChipGroup, Field, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fonts, makeStyles, radius, shadow, useCategoryMeta, useColors } from '@/lib/theme';
import { CATEGORIES, LIMITS, type Flaw, type FlawCategory } from '@/lib/types';

/** Everything you've confessed, on its own page, with a button to add another. */
export default function Confessions() {
  const styles = useStyles();
  const colors = useColors();
  const categoryMeta = useCategoryMeta();
  const insets = useSafeAreaInsets();
  const [flaws, setFlaws] = useState<Flaw[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<FlawCategory>('Habits');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .me()
        .then((me) => setFlaws(me.flaws))
        .catch(() => setFlaws((f) => f ?? []));
    }, []),
  );

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Hmm', e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const confess = () =>
    draft.trim() &&
    run('confess', async () => {
      const flaw = await api.addFlaw(category, draft.trim());
      setFlaws((f) => [...(f ?? []), flaw]);
      setDraft('');
      setAdding(false);
    });

  const remove = (id: string, text: string) =>
    Alert.alert('Take it back?', text, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          run('del', async () => {
            await api.deleteFlaw(id);
            setFlaws((f) => (f ?? []).filter((x) => x.id !== id));
          }),
      },
    ]);

  const list = flaws ?? [];
  const full = list.length >= LIMITS.maxFlaws;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, shadow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt variant="heading">My confessions</Txt>
          <Txt variant="caption">
            {list.length} of {LIMITS.maxFlaws} confessed
          </Txt>
        </View>
        {!adding && !full ? (
          <Pressable onPress={() => setAdding(true)} style={styles.add} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add a confession">
            <Ionicons name="add" size={20} color={colors.onAccent} />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {adding ? (
          <Card style={{ gap: 14 }}>
            <Txt variant="heading">Confess something 🙊</Txt>
            <ChipGroup
              options={CATEGORIES}
              value={category}
              onChange={setCategory}
              render={(c) => `${categoryMeta[c].emoji} ${categoryMeta[c].label}`}
              colorFor={(c) => categoryMeta[c].color}
            />
            <Field
              placeholder="e.g. I eat cereal for dinner and I'm not sorry."
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={LIMITS.flawMax}
              autoFocus
            />
            <Button title="Confess" onPress={confess} loading={busy === 'confess'} disabled={!draft.trim()} />
            <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} style={{ borderColor: colors.line }} />
            <Txt variant="caption" style={{ textAlign: 'center' }}>
              No humblebrags. “I'm a perfectionist” gets bounced.
            </Txt>
          </Card>
        ) : null}

        {full && !adding ? (
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            That's the limit of {LIMITS.maxFlaws}. Delete one to add another.
          </Txt>
        ) : null}

        {flaws !== null && list.length === 0 && !adding ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🙈</Text>
            <Txt variant="heading">Nothing confessed yet</Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>
              You're invisible until you confess at least one problem. That's the whole point.
            </Txt>
            <Button title="Add your first confession" onPress={() => setAdding(true)} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </View>
        ) : null}

        {list.map((f) => (
          <Animated.View key={f.id} entering={FadeInDown.springify()} exiting={FadeOut} layout={LinearTransition}>
            <Card style={styles.flaw}>
              <View style={{ flex: 1, gap: 8 }}>
                <CategoryTag category={f.category} />
                <Txt>{f.text}</Txt>
              </View>
              <Pressable onPress={() => remove(f.id, f.text)} hitSlop={10} style={styles.del} accessibilityRole="button" accessibilityLabel={`Delete confession: ${f.text}`}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </Card>
          </Animated.View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface },
    add: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingLeft: 10, paddingRight: 14, paddingVertical: 8 },
    addText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 15 },
    flaw: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16 },
    del: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 40 },
  }),
);
