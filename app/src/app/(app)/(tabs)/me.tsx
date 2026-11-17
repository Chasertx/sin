import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/components/FilterSheet';
import { RangeSlider } from '@/components/RangeSlider';
import { Button, Card, ChipGroup, Field, MultiChipGroup, Txt } from '@/components/ui';
import { api, ApiError, CHILD_SAFETY_URL, PRIVACY_URL, TERMS_URL } from '@/lib/api';
import {
  NO_FILTERS,
  describeAge,
  describeDistance,
  describeEthnicities,
  describeHeight,
  markFiltersChanged,
} from '@/lib/filters';
import { useSession } from '@/lib/session';
import { APPEARANCES, appearanceLabel, brand, fonts, makeStyles, radius, tint, useColors, useTheme } from '@/lib/theme';
import {
  ETHNICITIES,
  GENDERS,
  INTERESTS,
  LIMITS,
  ethnicityLabel,
  formatHeight,
  genderLabel,
  type Ethnicity,
  type Gender,
  type InterestedIn,
  type Preferences,
  type Profile,
} from '@/lib/types';

/** What the height slider on the profile can reach: 4'0" to 7'6". */
const HEIGHT_SLIDER = { min: LIMITS.minHeight, max: 90, start: 66 } as const;

export default function MyProblems() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut, needsOnboarding, finishOnboarding } = useSession();
  const { appearance, setAppearance, scheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The basics show as a read-only summary; the pencil opens them for editing.
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [headline, setHeadline] = useState('');
  const [gender, setGender] = useState<Gender>('Woman');
  const [interestedIn, setInterestedIn] = useState<InterestedIn>('Everyone');
  const [height, setHeight] = useState<number | null>(null);
  const [ethnicity, setEthnicity] = useState<Ethnicity | null>(null);
  const [filters, setFilters] = useState<Preferences>(NO_FILTERS);
  const [filtering, setFiltering] = useState(false);

  const apply = (p: Profile) => {
    setProfile(p);
    setName(p.displayName);
    setAge(p.age >= 18 ? String(p.age) : '');
    setHeadline(p.headline ?? '');
    setGender(p.gender);
    setInterestedIn(p.interestedIn);
    setHeight(p.heightInches ?? null);
    setEthnicity(p.ethnicity ?? null);
    if (p.age < 18) setEditing(true); // nothing saved yet: go straight to the form
  };

  useFocusEffect(
    useCallback(() => {
      api.me().then(apply).catch(() => {});
      api.preferences().then(setFilters).catch(() => {});
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

  const save = () =>
    run('save', async () => {
      const ageNum = parseInt(age, 10);
      if (!ageNum) throw new ApiError('Pop your age in as a number.', 400);
      apply(
        await api.updateMe({
          displayName: name.trim(),
          age: ageNum,
          gender,
          interestedIn,
          headline: headline.trim() || null,
          heightInches: height,
          ethnicity,
        }),
      );
      finishOnboarding();
      setEditing(false);
      Alert.alert('Saved ✨', 'Your problems are up to date.');
    });

  const saveFilters = async (next: Preferences) => {
    try {
      setFilters(await api.savePreferences(next));
      markFiltersChanged(); // Discover reloads with the new filters next time it's opened
      setFiltering(false);
    } catch (e) {
      Alert.alert('Hmm', e instanceof ApiError ? e.message : String(e));
    }
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    await run('photo', async () => {
      const { photoUrl } = await api.uploadPhoto(a.uri, a.file);
      setProfile((p) => (p ? { ...p, photoUrl } : p));
    });
  };

  const deleteAccount = () =>
    Alert.alert('Delete your account?', "This permanently removes your profile, confessions, matches and messages. It can't be undone.", [
      { text: 'Keep my account', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: () =>
          run('delete', async () => {
            await api.deleteAccount();
            await signOut();
          }),
      },
    ]);

  const flaws = profile?.flaws ?? [];
  const ageLocked = !!profile && profile.age >= 18;
  const showForm = editing || needsOnboarding || !ageLocked;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled">
        <LinearGradient colors={brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Possibly Icks</Text>
            <Pressable onPress={signOut} style={styles.logout} hitSlop={8} accessibilityRole="button" accessibilityLabel="Log out">
              <Ionicons name="log-out-outline" size={18} color={colors.white} />
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>
          <Pressable onPress={pickPhoto} style={styles.photoWrap} accessibilityRole="button" accessibilityLabel="Change photo">
            <View style={styles.photo}>
              {profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={styles.photoEmpty}>
                  <Ionicons name="camera" size={30} color={colors.primary} />
                  <Text style={styles.photoHint}>Worst photo</Text>
                </View>
              )}
            </View>
            {/* Outside the clipped circle so the badge isn't cut off. */}
            <View style={styles.photoBadge}>
              <Ionicons name={busy === 'photo' ? 'hourglass' : 'pencil'} size={14} color={colors.onAccent} />
            </View>
          </Pressable>
          <Text style={styles.heroName}>{profile ? `${profile.displayName}${profile.age >= 18 ? `, ${profile.age}` : ''}` : ' '}</Text>
        </LinearGradient>

        <View style={styles.content}>
          {needsOnboarding || (profile && profile.age < 18) ? (
            <View style={[styles.banner, { backgroundColor: tint(colors.mint, 0.22) }]}>
              <Txt variant="heading">👋 Almost there</Txt>
              <Txt style={{ color: colors.inkSoft }}>Add your age and who you're into below, then confess something.</Txt>
            </View>
          ) : flaws.length === 0 ? (
            <View style={[styles.banner, { backgroundColor: colors.surfaceAlt }]}>
              <Txt variant="heading">🙈 You're invisible right now</Txt>
              <Txt style={{ color: colors.inkSoft }}>Confess at least one problem and you'll show up in Discover.</Txt>
            </View>
          ) : null}

          {/* Confessions live on their own page: this is the way in. */}
          <Pressable
            onPress={() => router.push('/confessions')}
            accessibilityRole="button"
            accessibilityLabel={`My confessions, ${flaws.length} of ${LIMITS.maxFlaws} confessed`}
            style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <Card style={styles.confessions}>
              <View style={styles.confessionsIcon}>
                <Text style={{ fontSize: 22 }}>🙊</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="heading">My confessions</Txt>
                <Txt variant="caption">
                  {flaws.length} of {LIMITS.maxFlaws} confessed
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Card>
          </Pressable>
          {profile && profile.age >= 18 && flaws.length === 0 ? (
            <Button title="Add your first confession" onPress={() => router.push('/confessions')} />
          ) : null}

          <Card style={{ gap: 14, marginTop: 8 }}>
            <View style={styles.basicsHead}>
              <Txt variant="heading">The basics</Txt>
              {!showForm ? (
                <Pressable onPress={() => setEditing(true)} hitSlop={12} style={styles.pencil} accessibilityRole="button" accessibilityLabel="Edit the basics">
                  <Ionicons name="pencil" size={15} color={colors.deep} />
                </Pressable>
              ) : null}
            </View>

            {showForm ? (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 2 }}>
                    <Field label="Name" value={name} onChangeText={setName} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Age"
                      value={age}
                      onChangeText={setAge}
                      keyboardType="number-pad"
                      maxLength={3}
                      editable={!ageLocked}
                      style={ageLocked ? { color: colors.muted } : undefined}
                    />
                  </View>
                </View>
                {ageLocked ? <Txt variant="caption">Your age is locked once it's set.</Txt> : null}
                <Field
                  label="Headline"
                  placeholder="The worst thing about you, in one line"
                  value={headline}
                  onChangeText={setHeadline}
                  maxLength={LIMITS.headlineMax}
                />
                <ChipGroup label="I am" options={GENDERS} value={gender} onChange={setGender} render={genderLabel} colorFor={() => colors.deep} />
                <ChipGroup label="Into" options={INTERESTS} value={interestedIn} onChange={setInterestedIn} colorFor={() => colors.primary} />

                <View style={{ gap: 2 }}>
                  <View style={styles.heightHead}>
                    <Txt variant="label" style={{ flex: 1 }}>
                      Height (optional)
                    </Txt>
                    <Txt style={[styles.heightValue, height === null && { color: colors.muted }]}>
                      {height === null ? 'Not set' : formatHeight(height)}
                    </Txt>
                    {height !== null ? (
                      <Pressable onPress={() => setHeight(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear height">
                        <Ionicons name="close-circle" size={20} color={colors.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                  <RangeSlider
                    min={HEIGHT_SLIDER.min}
                    max={HEIGHT_SLIDER.max}
                    values={[height ?? HEIGHT_SLIDER.start]}
                    onChange={([v]) => setHeight(v)}
                    labels={['Your height']}
                    format={formatHeight}
                    dimmed={height === null}
                  />
                </View>

                <MultiChipGroup
                  label="Race / ethnicity (optional)"
                  options={ETHNICITIES}
                  values={ethnicity ? [ethnicity] : []}
                  onChange={(picked) => setEthnicity(picked.at(-1) ?? null)}
                  render={ethnicityLabel}
                />
                <Txt variant="caption">
                  Not shown on your profile. It's only used when someone filters who they see.
                </Txt>

                <Button title="Save" variant="dark" onPress={save} loading={busy === 'save'} />
                {ageLocked && profile ? (
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => {
                      apply(profile); // throw away unsaved edits
                      setEditing(false);
                    }}
                  />
                ) : null}
              </>
            ) : profile ? (
              <View style={{ gap: 12 }}>
                <BasicsRow label="Name" value={profile.displayName} />
                <BasicsRow label="Age" value={String(profile.age)} />
                <BasicsRow label="Headline" value={profile.headline ?? 'None yet'} muted={!profile.headline} />
                <BasicsRow label="I am" value={genderLabel(profile.gender)} />
                <BasicsRow label="Into" value={profile.interestedIn} />
                <BasicsRow label="Height" value={profile.heightInches ? formatHeight(profile.heightInches) : 'Not set'} muted={!profile.heightInches} />
                <BasicsRow label="Ethnicity" value={profile.ethnicity ? ethnicityLabel(profile.ethnicity) : 'Not set'} muted={!profile.ethnicity} />
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: 14, marginTop: 8 }}>
            <View style={styles.basicsHead}>
              <View style={{ flex: 1 }}>
                <Txt variant="heading">Who you want to see</Txt>
                <Txt variant="caption">Discover only shows you people who fit.</Txt>
              </View>
              <Pressable onPress={() => setFiltering(true)} hitSlop={12} style={styles.pencil} accessibilityRole="button" accessibilityLabel="Edit who you want to see">
                <Ionicons name="options" size={15} color={colors.deep} />
              </Pressable>
            </View>
            <View style={{ gap: 12 }}>
              <BasicsRow label="Age" value={describeAge(filters)} />
              <BasicsRow label="Distance" value={describeDistance(filters)} />
              <BasicsRow label="Height" value={describeHeight(filters)} />
              <BasicsRow label="Ethnicity" value={describeEthnicities(filters)} />
            </View>
          </Card>

          <Card style={{ gap: 12, marginTop: 8 }}>
            <View>
              <Txt variant="heading">Appearance</Txt>
              <Txt variant="caption">
                {appearance === 'system' ? `Following your phone, which is on ${scheme} right now.` : `Always ${scheme}, whatever your phone is set to.`}
              </Txt>
            </View>
            <ChipGroup options={APPEARANCES} value={appearance} onChange={setAppearance} render={appearanceLabel} colorFor={() => colors.primary} />
          </Card>

          <Card style={{ gap: 6, marginTop: 8 }}>
            <Txt variant="heading">Account</Txt>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} style={styles.link} accessibilityRole="link">
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.inkSoft} />
              <Txt style={{ flex: 1 }}>Privacy policy</Txt>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} style={styles.link} accessibilityRole="link">
              <Ionicons name="document-text-outline" size={18} color={colors.inkSoft} />
              <Txt style={{ flex: 1 }}>Terms & community rules</Txt>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable onPress={() => Linking.openURL(CHILD_SAFETY_URL)} style={styles.link} accessibilityRole="link">
              <Ionicons name="people-outline" size={18} color={colors.inkSoft} />
              <Txt style={{ flex: 1 }}>Child safety standards</Txt>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable onPress={deleteAccount} style={styles.link} accessibilityRole="button" accessibilityLabel="Delete account">
              <Ionicons name="trash-outline" size={18} color={colors.coral} />
              <Txt style={{ flex: 1, color: colors.coral }}>{busy === 'delete' ? 'Deleting…' : 'Delete account'}</Txt>
            </Pressable>
          </Card>
        </View>
      </ScrollView>
      <FilterSheet visible={filtering} current={filters} onClose={() => setFiltering(false)} onApply={saveFilters} />
    </KeyboardAvoidingView>
  );
}

function BasicsRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.basicsRow}>
      <Txt variant="label" style={{ width: 92 }}>
        {label}
      </Txt>
      <Txt style={[{ flex: 1 }, muted && { color: colors.muted }]}>{value}</Txt>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    basicsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pencil: { width: 30, height: 30, borderRadius: 15, backgroundColor: tint(colors.deep, 0.12), alignItems: 'center', justifyContent: 'center' },
    basicsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    heightHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heightValue: { fontFamily: fonts.heavy, color: colors.primary },
    hero: { alignItems: 'center', paddingBottom: 28, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 20, marginBottom: 18 },
    heroTitle: { fontFamily: fonts.black, fontSize: 28, color: colors.white },
    logout: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tint(colors.white, 0.2), paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
    logoutText: { fontFamily: fonts.heavy, color: colors.white, fontSize: 13 },
    photoWrap: { width: 120, height: 120 },
    photo: { flex: 1, borderRadius: 60, backgroundColor: colors.surface, borderWidth: 4, borderColor: colors.white, overflow: 'hidden' },
    photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 10 },
    photoHint: { fontFamily: fonts.heavy, fontSize: 12, color: colors.primary, textAlign: 'center' },
    photoBadge: { position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.white, backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' },
    heroName: { fontFamily: fonts.black, fontSize: 24, color: colors.white, marginTop: 12 },
    content: { padding: 16, gap: 12, marginTop: -8 },
    banner: { gap: 4, borderRadius: radius.lg, padding: 18 },
    confessions: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    confessionsIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  }),
);
