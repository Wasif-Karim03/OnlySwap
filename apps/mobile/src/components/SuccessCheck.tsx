import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { useSuccessProgress } from '@/theme/motion';

type Props = { visible: boolean; accessibilityLabel: string };

/**
 * Success mark (offer sent, listing posted, report sent). The two strokes of
 * the check draw in sequence over 400 ms; with reduce motion it fades in.
 */
export function SuccessCheck({ visible, accessibilityLabel }: Props) {
  const { progress, opacity } = useSuccessProgress(visible);

  const wrap = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // A check is an L (short foot + tall stem) rotated 45 degrees. The foot draws
  // first, then the stem grows upward.
  const foot = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(progress.value, [0, 0.35], [0, 1], 'clamp') }],
  }));
  const stem = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(progress.value, [0.35, 1], [0, 1], 'clamp') }],
  }));

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.circle, wrap]}
    >
      <View style={styles.check}>
        <Animated.View style={[styles.foot, foot]} />
        <Animated.View style={[styles.stem, stem]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: {
    width: theme.space['2xl'] * 2,
    height: theme.space['2xl'] * 2,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: theme.space.md,
    height: theme.space.xl,
    marginTop: -theme.space.sm,
    transform: [{ rotate: '45deg' }],
  },
  foot: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: theme.space.md,
    height: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.onAccent,
    transformOrigin: 'left',
  },
  stem: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: theme.space.xs,
    height: theme.space.xl,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.onAccent,
    transformOrigin: 'bottom',
  },
}));
