import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { nav as navCopy } from '@/strings';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

/** Clamps a progress value to 0..1 (NaN counts as 0). */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/** "Step 1 of 3" for screen readers and the header text. */
export function stepLabel(step: number, total: number): string {
  return fill(navCopy.step, { step, total });
}

/**
 * Multi-step flow position (P2-CMP-09, board D1: one bar per step, done and
 * current steps in ink). Pair with the "1 of 3" count in the NavBar.
 */
export function StepIndicator({
  step,
  total,
  testID,
}: {
  step: number;
  total: number;
  testID?: string;
}) {
  const current = Math.min(Math.max(Math.round(step), 1), Math.max(total, 1));
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={stepLabel(current, total)}
      accessibilityValue={{ min: 1, max: total, now: current }}
      style={styles.steps}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={styles.step(i < current)} />
      ))}
    </View>
  );
}

/**
 * Determinate progress, e.g. a photo upload (P2-CMP-09). Moves over 150 ms,
 * or jumps with reduce motion.
 */
export function ProgressBar({
  value,
  label,
  testID,
}: {
  /** 0 to 1. */
  value: number;
  /** What is progressing, e.g. "Uploading photo 2". */
  label: string;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const clamped = clampProgress(value);
  const width = useSharedValue(clamped);

  useEffect(() => {
    width.set(reduced ? clamped : animateTo(clamped, resolveMotion('fade', true)));
  }, [clamped, reduced, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  const percent = Math.round(clamped * 100);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.track}
    >
      <Animated.View style={[styles.fillBox, fillStyle]}>
        <View style={styles.fill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  steps: { flexDirection: 'row', gap: theme.space.sm },
  step: (on: boolean) => ({
    flex: 1,
    height: theme.size.stepBar,
    borderRadius: theme.radius.chip,
    backgroundColor: on ? theme.colors.ink : theme.colors.bg3,
  }),
  track: {
    height: theme.size.progressBar,
    borderRadius: theme.radius.chip,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg2,
  },
  fillBox: { height: '100%' },
  fill: { flex: 1, borderRadius: theme.radius.chip, backgroundColor: theme.colors.ink },
}));
