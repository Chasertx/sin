import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardDetails } from '@/components/SwipeCard';
import { CategoryTag, Txt } from '@/components/ui';
import { brand, coralish, fonts, makeStyles, minty, radius, shadow, tint, useColors } from '@/lib/theme';
import type { Profile } from '@/lib/types';

interface Props {
  /** The person to show; null keeps the sheet closed. */
  profile: Profile | null;
  onClose: () => void;
  /** "Too much" (false) or "I can handle that" (true), decided from inside the profile. */
  onDecide: (canHandleIt: boolean) => void;
  onReport: () => void;
}

/** Someone's whole profile: the photo at full size and every confession, not just the two on the card. */
export function ProfileSheet({ profile, onClose, onDecide, onReport }: Props) {
  return (
    <Modal visible={!!profile} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A modal is its own window: measure its safe area here, not the screen's underneath. */}
      <SafeAreaProvider>{profile ? <Content profile={profile} onClose={onClose} onDecide={onDecide} onReport={onReport} /> : null}</SafeAreaProvider>
    </Modal>
  );
}

function Content({ profile, onClose, onDecide, onReport }: Props & { profile: Profile }) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const details = cardDetails(profile);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        <View style={styles.photo}>
          {profile.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={`${profile.displayName}'s photo`} />
          ) : (
            <LinearGradient colors={brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.noPhoto]}>
              <Text style={styles.noPhotoInitial}>{profile.displayName.slice(0, 1)}</Text>
              <Text style={styles.noPhotoCaption}>No photo. Mystery is a red flag too 🙈</Text>
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', 'rgba(8,24,19,0.8)']} style={styles.photoShade} />
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{profile.displayName}</Text>
              <Text style={styles.age}>{profile.age}</Text>
            </View>
            {details ? (
              <View style={styles.detailsRow}>
                <Ionicons name="location" size={15} color={tint(colors.white, 0.9)} />
                <Text style={styles.details}>{details}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          {profile.headline ? (
            <View style={styles.headline}>
              <Txt style={styles.headlineText}>“{profile.headline}”</Txt>
            </View>
          ) : null}

          <Txt variant="label" style={{ marginTop: 4, marginLeft: 4 }}>
            {profile.flaws.length} confession{profile.flaws.length === 1 ? '' : 's'}
          </Txt>
          {profile.flaws.map((f) => (
            <View key={f.id} style={styles.flaw}>
              <CategoryTag category={f.category} />
              <Txt style={styles.flawText}>{f.text}</Txt>
            </View>
          ))}

          <Pressable onPress={onReport} style={styles.report} accessibilityRole="button" accessibilityLabel={`Report or block ${profile.displayName}`}>
            <Ionicons name="flag-outline" size={16} color={colors.muted} />
            <Txt variant="caption">Report or block {profile.displayName}</Txt>
          </Pressable>
        </View>
      </ScrollView>

      <Pressable onPress={onClose} style={[styles.close, shadow, { top: insets.top + 12 }]} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close profile">
        <Ionicons name="chevron-down" size={24} color={colors.ink} />
      </Pressable>

      {/* The same two choices as on the card, so there's no need to go back to decide. */}
      <View style={[styles.actions, shadow, { paddingBottom: insets.bottom + 14 }]}>
        <Decision colors={coralish} icon="close" label="Too much" onPress={() => onDecide(false)} />
        <Decision colors={minty} icon="heart" label="I can handle that" onPress={() => onDecide(true)} />
      </View>
    </View>
  );
}

function Decision({ colors: gradient, icon, label, onPress }: { colors: readonly [string, string]; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} (from profile)`} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.decision}>
        <Ionicons name={icon} size={22} color={colors.white} />
        <Text style={styles.decisionText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    photo: { height: 440, justifyContent: 'flex-end', backgroundColor: colors.surfaceAlt },
    noPhoto: { alignItems: 'center', justifyContent: 'center', gap: 6 },
    noPhotoInitial: { fontFamily: fonts.black, fontSize: 120, color: tint(colors.white, 0.9) },
    noPhotoCaption: { fontFamily: fonts.bold, fontSize: 14, color: tint(colors.white, 0.9) },
    photoShade: { ...StyleSheet.absoluteFill, top: '55%' },
    nameBlock: { padding: 22, gap: 4 },
    nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    name: { fontFamily: fonts.black, fontSize: 38, color: colors.white, flexShrink: 1 },
    age: { fontFamily: fonts.bold, fontSize: 26, color: tint(colors.white, 0.85) },
    detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    details: { fontFamily: fonts.bold, fontSize: 15, color: tint(colors.white, 0.9) },
    body: { padding: 18, gap: 12 },
    headline: { backgroundColor: tint(colors.primary, 0.1), borderRadius: radius.md, padding: 14, borderLeftWidth: 4, borderLeftColor: colors.primary },
    headlineText: { fontFamily: fonts.heavy, fontSize: 17, color: colors.primary },
    flaw: { gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14 },
    flawText: { fontSize: 16, lineHeight: 23 },
    report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
    close: { position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 14, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
    decision: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: radius.pill },
    decisionText: { fontFamily: fonts.heavy, fontSize: 16, color: colors.white },
  }),
);
