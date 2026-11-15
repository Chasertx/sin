import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { makeStyles, shadow, useColors } from '@/lib/theme';

const THUMB = 28;
/** Thumbs are small to look at but get a finger-sized touch area. */
const HIT = 44;

interface Props {
  min: number;
  max: number;
  step?: number;
  /** One value for a single thumb, two (low, high) for a range. */
  values: number[];
  onChange: (values: number[]) => void;
  /** Smallest allowed distance between the two thumbs of a range. */
  minGap?: number;
  /** What each thumb is, for screen readers: e.g. ['Youngest age', 'Oldest age']. */
  labels: string[];
  /** How a value is read out, e.g. 67 → 5'7". */
  format?: (value: number) => string;
  /** Greyed-out look, for a value that hasn't been chosen yet. It still responds to touch. */
  dimmed?: boolean;
}

/**
 * A slider with one or two thumbs. Dragging one thumb of a range into the other pushes it along,
 * so the thumbs can never cross or get stuck on top of each other.
 */
export function RangeSlider({ min, max, step = 1, values, onChange, minGap = step, labels, format = String, dimmed }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const [width, setWidth] = useState(0); // distance the centre of a thumb can travel
  const [active, setActive] = useState<number | null>(null);
  const drag = useRef({ pageX: 0, value: 0 });
  const isRange = values.length === 2;

  const position = (value: number) => (max === min ? 0 : ((value - min) / (max - min)) * width);

  const move = (thumb: number, raw: number) => {
    const snapped = Math.round((raw - min) / step) * step + min;
    let next: number[];
    if (!isRange) {
      next = [clamp(snapped, min, max)];
    } else if (thumb === 0) {
      const low = clamp(snapped, min, max - minGap);
      next = [low, Math.max(values[1], low + minGap)];
    } else {
      const high = clamp(snapped, min + minGap, max);
      next = [Math.min(values[0], high - minGap), high];
    }
    if (next.some((v, i) => v !== values[i])) onChange(next);
  };

  const touch = (thumb: number) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // Returning true keeps a ScrollView underneath from stealing the drag on Android.
    onResponderGrant: (e: GestureResponderEvent) => {
      drag.current = { pageX: e.nativeEvent.pageX, value: values[thumb] };
      setActive(thumb);
      return true;
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (width <= 0) return;
      const travelled = e.nativeEvent.pageX - drag.current.pageX;
      move(thumb, drag.current.value + (travelled / width) * (max - min));
    },
    onResponderTerminationRequest: () => false,
    onResponderRelease: () => setActive(null),
    onResponderTerminate: () => setActive(null),
  });

  const low = isRange ? position(values[0]) : 0;
  const high = position(values[isRange ? 1 : 0]);
  const tone = dimmed ? colors.line : colors.primary;

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(Math.max(0, e.nativeEvent.layout.width - THUMB))}>
      <View style={styles.track} />
      <View style={[styles.fill, { left: THUMB / 2 + low, width: Math.max(0, high - low), backgroundColor: tone }]} />
      {values.map((value, thumb) => (
        <View
          key={thumb}
          {...touch(thumb)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={labels[thumb]}
          accessibilityValue={{ text: format(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => move(thumb, value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
          style={[styles.hit, { left: position(value) + THUMB / 2 - HIT / 2 }]}>
          <View style={[styles.thumb, shadow, { borderColor: tone }, active === thumb && styles.thumbActive]} />
        </View>
      ))}
    </View>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    wrap: { height: HIT, justifyContent: 'center' },
    track: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt },
    fill: { position: 'absolute', height: 6, borderRadius: 3 },
    hit: { position: 'absolute', top: 0, width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      backgroundColor: colors.white,
      borderWidth: 3,
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    thumbActive: { transform: [{ scale: 1.18 }] },
  }),
);
