import { motion, type as typeTokens, type TypeVariant } from '@onlyswap/tokens';
import { useEffect, useState, type ReactNode } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { states as statesCopy } from '@/strings/en';
import { useReducedMotion } from '@/theme/reducedMotion';

/**
 * True only once `loading` has lasted longer than `delay` (board X3: loads
 * faster than about 300 ms flash nothing at all).
 */
export function useDelayedLoading(
  loading: boolean,
  delay: number = motion.skeleton.delay,
): boolean {
  const [show, setShow] = useState(false);
  if (!loading && show) setShow(false);
  useEffect(() => {
    if (!loading) return undefined;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [loading, delay]);
  return loading && show;
}

type Radius = 'thumb' | 'card' | 'control' | 'chip';

type BlockProps = {
  width?: DimensionValue;
  /** A text line shaped like this type token (height = font size). */
  line?: TypeVariant;
  /** A box with this width / height ratio. */
  aspectRatio?: number;
  /** Fills the parent (flex 1). */
  fill?: boolean;
  radius?: Radius;
  /** Lighter shape drawn on top of another skeleton (board X3 card text). */
  raised?: boolean;
};

/** Height of a skeleton text line for a type token. */
export function lineHeight(variant: TypeVariant): number {
  return typeTokens[variant].fontSize;
}

/** One grey shape. Pulses gently; static with reduce motion. */
export function SkeletonBlock({
  width = '100%',
  line,
  aspectRatio,
  fill = false,
  radius = 'thumb',
  raised = false,
}: BlockProps) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse);
      pulse.set(0);
      return undefined;
    }
    pulse.set(
      withRepeat(
        withTiming(1, {
          duration: motion.skeleton.duration / 2,
          easing: Easing.inOut(Easing.quad),
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: 1 - pulse.value * 0.45 }));
  const box = fill
    ? { flex: 1, width }
    : line
      ? { width, height: lineHeight(line) }
      : { width, aspectRatio: aspectRatio ?? 1 };

  return (
    <Animated.View style={[box, animated]}>
      <View style={styles.block(radius, raised)} />
    </Animated.View>
  );
}

/** Screen-reader wrapper: one "Loading" instead of many empty shapes. */
function SkeletonGroup({
  children,
  testID,
  grow = false,
}: {
  children: ReactNode;
  testID?: string;
  grow?: boolean;
}) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={statesCopy.loading}
      accessibilityState={{ busy: true }}
      style={styles.group(grow)}
    >
      {children}
    </View>
  );
}

/** Deck card placeholder, shaped like the swipe card (board X3). Fills its parent. */
export function SkeletonCard({ testID }: { testID?: string }) {
  return (
    <SkeletonGroup testID={testID} grow>
      <SkeletonBlock fill radius="card" />
      <View style={styles.cardMeta} pointerEvents="none">
        <SkeletonBlock width="30%" line="price" raised />
        <SkeletonBlock width="70%" line="heading" raised />
        <SkeletonBlock width="50%" line="label" raised />
      </View>
    </SkeletonGroup>
  );
}

/** List placeholder: thumb and two lines per row (inbox, notifications, listings). */
export function SkeletonList({ rows = 5, testID }: { rows?: number; testID?: string }) {
  return (
    <SkeletonGroup testID={testID}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.thumb}>
            <SkeletonBlock radius="thumb" />
          </View>
          <View style={styles.lines}>
            <SkeletonBlock width="60%" line="bodyStrong" />
            <SkeletonBlock width="40%" line="meta" />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Grid placeholder for search results and saved items. */
export function SkeletonGrid({ tiles = 6, testID }: { tiles?: number; testID?: string }) {
  return (
    <SkeletonGroup testID={testID}>
      <View style={styles.grid}>
        {Array.from({ length: tiles }, (_, i) => (
          <View key={i} style={styles.tile}>
            <SkeletonBlock radius="thumb" />
            <SkeletonBlock width="50%" line="bodyStrong" />
            <SkeletonBlock width="80%" line="meta" />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: (grow: boolean) => ({ gap: theme.space.md, flexGrow: grow ? 1 : 0 }),
  block: (radius: Radius, raised: boolean) => ({
    flex: 1,
    borderRadius: theme.radius[radius],
    backgroundColor: raised ? theme.colors.bg3 : theme.colors.bg2,
  }),
  cardMeta: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    bottom: theme.space.xl,
    gap: theme.space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.space.rowMin,
  },
  thumb: { width: theme.size.avatarM },
  lines: { flex: 1, gap: theme.space.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: theme.space.lg,
    columnGap: theme.space.md,
  },
  tile: { flexBasis: '47%', flexGrow: 1, gap: theme.space.sm },
}));
