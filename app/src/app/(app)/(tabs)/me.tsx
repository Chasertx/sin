import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, CategoryTag, ChipGroup, Field, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { categoryMeta, colors, fonts, radius, sunset, tint } from '@/lib/theme';
import {
  CATEGORIES,
  GENDERS,
  INTERESTS,
  LIMITS,
  genderLabel,
  type FlawCategory,
  type Gender,
  type InterestedIn,
  type Profile,
} from '@/lib/types';

export default function MyProblems() {
  const insets = useSafeAreaInsets();
  const { signOut, needsOnboarding, finishOnboarding } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [category, setCategory] = useState<FlawCategory>('Habits');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // editable basics
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [headline, setHeadline] = useState('');
  const [gender, setGender] = useState<Gender>('Woman');
  const [interestedIn, setInterestedIn] = useState<InterestedIn>('Everyone');

  const apply = (p: Profile) => {
    setProfile(p);
    setName(p.displayName);
    setAge(p.age >= 18 ? String(p.age) : '');
    setHeadline(p.headline ?? '');
    setGender(p.gender);
    setInterestedIn(p.interestedIn);
  };

  useFocusEffect(
    useCallback(() => {
      api.me().then(apply).catch(() => {});
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
      setProfile((p) => (p ? { ...p, flaws: [...p.flaws, flaw] } : p));
      setDraft('');
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
            setProfile((p) => (p ? { ...p, flaws: p.flaws.filter((f) => f.id !== id) } : p));
          }),
      },
    ]);

  const save = () =>
    run('save', async () => {
      const ageNum = parseInt(age, 10);
      if (!ageNum) throw new ApiError('Pop your age in as a number.', 400);
      apply(await api.updateMe({ displayName: name.trim(), age: ageNum, gender, interestedIn, headline: headline.trim() || null }));
      finishOnboarding();
      Alert.alert('Saved ✨', 'Your problems are up to date.');
    });

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    await run('photo', async () => {
      const { photoUrl } = await api.uploadPhoto(a.uri, a.mimeType ?? 'image/jpeg', a.fileName ?? 'photo.jpg');
      setProfile((p) => (p ? { ...p, photoUrl } : p));
    });
  };

  const flaws = profile?.flaws ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <LinearGradient colors={sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>My Problems</Text>
            <Pressable onPress={signOut} style={styles.logout} hitSlop={8} accessibilityRole="button" accessibilityLabel="Log out">
              <Ionicons name="log-out-outline" size={18} color={colors.white} />
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>
          <Pressable onPress={pickPhoto} style={styles.photo} accessibilityRole="button" accessibilityLabel="Change photo">
            {profile?.photoUrl ? (
              <Image source={{ uri: profile.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={styles.photoEmpty}>
                <Ionicons name="camera" size={30} color={colors.pink} />
                <Text style={styles.photoHint}>Worst photo</Text>
              </View>
            )}
            <View style={styles.photoBadge}>
              <Ionicons name={busy === 'photo' ? 'hourglass' : 'pencil'} size={14} color={colors.white} />
            </View>
          </Pressable>
          <Text style={styles.heroName}>{profile ? `${profile.displayName}${profile.age >= 18 ? `, ${profile.age}` : ''}` : ' '}</Text>
        </LinearGradient>

        <View style={styles.content}>
          {needsOnboarding || (profile && profile.age < 18) ? (
            <View style={[styles.banner, { backgroundColor: '#FFF1CC' }]}>
              <Txt variant="heading">👋 Almost there</Txt>
              <Txt style={{ color: colors.inkSoft }}>Add your age and who you're into below, then confess something.</Txt>
            </View>
          ) : flaws.length === 0 ? (
            <View style={[styles.banner, { backgroundColor: '#EEE9FF' }]}>
              <Txt variant="heading">🙈 You're invisible right now</Txt>
              <Txt style={{ color: colors.inkSoft }}>Confess at least one problem and you'll show up in Discover.</Txt>
            </View>
          ) : null}

          {/* Composer */}
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
            />
            <Button title="Confess" onPress={confess} loading={busy === 'confess'} disabled={!draft.trim()} />
            <Txt variant="caption" style={{ textAlign: 'center' }}>
              No humblebrags. “I'm a perfectionist” gets bounced.
            </Txt>
          </Card>

          {/* List */}
          <Txt variant="label" style={{ marginTop: 8, marginLeft: 4 }}>
            {flaws.length} of {LIMITS.maxFlaws} confessed
          </Txt>
          {flaws.map((f) => (
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

          {/* Basics */}
          <Card style={{ gap: 14, marginTop: 8 }}>
            <Txt variant="heading">The basics</Txt>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 2 }}>
                <Field label="Name" value={name} onChangeText={setName} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
              </View>
            </View>
            <Field
              label="Headline"
              placeholder="The worst thing about you, in one line"
              value={headline}
              onChangeText={setHeadline}
              maxLength={LIMITS.headlineMax}
            />
            <ChipGroup label="I am" options={GENDERS} value={gender} onChange={setGender} render={genderLabel} colorFor={() => colors.violet} />
            <ChipGroup label="Into" options={INTERESTS} value={interestedIn} onChange={setInterestedIn} colorFor={() => colors.pink} />
            <Button title="Save" variant="dark" onPress={save} loading={busy === 'save'} />
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 28, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 20, marginBottom: 18 },
  heroTitle: { fontFamily: fonts.black, fontSize: 28, color: colors.white },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tint(colors.white, 0.2), paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  logoutText: { fontFamily: fonts.heavy, color: colors.white, fontSize: 13 },
  photo: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.white, borderWidth: 4, borderColor: colors.white, overflow: 'hidden' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 10 },
  photoHint: { fontFamily: fonts.heavy, fontSize: 12, color: colors.pink, textAlign: 'center' },
  photoBadge: { position: 'absolute', right: 4, bottom: 4, width: 26, height: 26, borderRadius: 14, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  heroName: { fontFamily: fonts.black, fontSize: 24, color: colors.white, marginTop: 12 },
  content: { padding: 16, gap: 12, marginTop: -8 },
  banner: { gap: 4, borderRadius: radius.lg, padding: 18 },
  flaw: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16 },
  del: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
