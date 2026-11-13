import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useImperativeHandle, type Ref } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CategoryTag, Txt } from '@/components/ui';
import { colors, fonts, radius, shadow, sunset, tint } from '@/lib/theme';
import type { Profile } from '@/lib/types';

export interface SwipeCardHandle {
  swipe: (canHandleIt: boolean) => void;
}

const MAX_FLAWS_SHOWN = 2;

export function SwipeCard({
  profile,
  onSwiped,
  ref,
}: {
  profile: Profile;
  onSwiped: (canHandleIt: boolean) => void;
  ref?: Ref<SwipeCardHandle>;
}) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.27;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const vx = useSharedValue(0);

  const finish = (canHandleIt: boolean) => {
    Haptics.impactAsync(canHandleIt ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(
      () => {},
    );
    onSwiped(canHandleIt);
  };

  const flingAway = (canHandleIt: boolean) => {
    'worklet';
    tx.value = withTiming((canHandleIt ? 1 : -1) * width * 1.4, { duration: 260 }, (done) => {
      if (done) scheduleOnRN(finish, canHandleIt);
    });
    ty.value = withTiming(ty.value + 40, { duration: 260 });
  };

  useImperativeHandle(ref, () => ({ swipe: (canHandleIt: boolean) => flingAway(canHandleIt) }));

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    onUpdate: (e) => {
      tx.value = e.translationX;
      ty.value = e.translationY * 0.3;
      vx.value = e.velocityX;
    },
    onDeactivate: () => {
      if (Math.abs(tx.value) > threshold || Math.abs(vx.value) > 1000) {
        flingAway(tx.value > 0);
      } else {
        tx.value = withSpring(0, { damping: 14, stiffness: 160 });
        ty.value = withSpring(0, { damping: 14, stiffness: 160 });
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, 0, width], [-14, 0, 14])}deg` },
    ],
  }));
  const yesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [20, threshold], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(tx.value, [0, threshold], [0.8, 1], Extrapolation.CLAMP) }, { rotate: '-12deg' }],
  }));
  const noStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-threshold, -20], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(tx.value, [-threshold, 0], [1, 0.8], Extrapolation.CLAMP) }, { rotate: '12deg' }],
  }));

  const extra = profile.flaws.length - MAX_FLAWS_SHOWN;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, shadow, cardStyle]}>
        <CardBody profile={profile} extra={extra} />

        <Animated.View style={[styles.stamp, styles.stampYes, yesStyle]} pointerEvents="none">
          <Text style={[styles.stampText, { color: colors.mint }]}>I CAN{'\n'}HANDLE IT</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampNo, noStyle]} pointerEvents="none">
          <Text style={[styles.stampText, { color: colors.coral }]}>TOO{'\n'}MUCH</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Static version used for the card peeking out behind the top one. */
export function PeekCard({ profile }: { profile: Profile }) {
  return (
    <View style={[styles.card, styles.peek]}>
      <CardBody profile={profile} extra={profile.flaws.length - MAX_FLAWS_SHOWN} />
    </View>
  );
}

function CardBody({ profile, extra }: { profile: Profile; extra: number }) {
  return (
    <>
      <View style={styles.photo}>
        {profile.photoUrl ? (
          <Image source={{ uri: profile.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <View style={styles.noPhoto}>
              <Text style={styles.noPhotoInitial}>{profile.displayName.slice(0, 1)}</Text>
              <Text style={styles.noPhotoCaption}>No photo. Mystery is a red flag too 🙈</Text>
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', 'rgba(20,10,30,0.75)']} style={styles.photoShade} />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.age}>{profile.age}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {profile.headline ? (
          <View style={styles.headline}>
            <Txt style={styles.headlineText}>“{profile.headline}”</Txt>
          </View>
        ) : null}

        {profile.flaws.slice(0, MAX_FLAWS_SHOWN).map((f) => (
          <View key={f.id} style={styles.flaw}>
            <CategoryTag category={f.category} />
            <Txt style={styles.flawText} numberOfLines={3}>
              {f.text}
            </Txt>
          </View>
        ))}
        {extra > 0 ? <Txt variant="caption">+ {extra} more confession{extra > 1 ? 's' : ''}</Txt> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  peek: { transform: [{ scale: 0.94 }, { translateY: 18 }], opacity: 0.7 },
  photo: { height: '46%', justifyContent: 'flex-end' },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingBottom: 40 },
  noPhotoInitial: { fontFamily: fonts.black, fontSize: 84, color: tint(colors.white, 0.9) },
  noPhotoCaption: { fontFamily: fonts.bold, fontSize: 13, color: tint(colors.white, 0.9) },
  photoShade: { ...StyleSheet.absoluteFill, top: '45%' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, padding: 20 },
  name: { fontFamily: fonts.black, fontSize: 34, color: colors.white },
  age: { fontFamily: fonts.bold, fontSize: 24, color: tint(colors.white, 0.85) },
  body: { flex: 1, padding: 18, gap: 10 },
  headline: { backgroundColor: tint(colors.sunshine, 0.18), borderRadius: radius.md, padding: 12 },
  headlineText: { fontFamily: fonts.heavy, fontSize: 16, color: '#8A5A00' },
  flaw: { gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12 },
  flawText: { fontSize: 15, lineHeight: 21 },
  stamp: { position: 'absolute', top: 36, borderWidth: 4, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  stampYes: { left: 22, borderColor: colors.mint, backgroundColor: tint(colors.white, 0.85) },
  stampNo: { right: 22, borderColor: colors.coral, backgroundColor: tint(colors.white, 0.85) },
  stampText: { fontFamily: fonts.black, fontSize: 24, lineHeight: 26, textAlign: 'center' },
});
