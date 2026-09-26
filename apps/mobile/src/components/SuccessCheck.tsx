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
  const shortStroke = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(progress.value, [0, 0.4], [0, 1], 'clamp') }],
  }));
  const longStroke = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(progress.value, [0.4, 1], [0, 1], 'clamp') }],
  }));

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.circle, wrap]}
    >
      <View style={styles.checkBox}>
        <View style={[styles.strokeHolder, styles.shortHolder]}>
          <Animated.View style={[styles.stroke, styles.fromLeft, shortStroke]} />
        </View>
        <View style={[styles.strokeHolder, styles.longHolder]}>
          <Animated.View style={[styles.stroke, styles.fromLeft, longStroke]} />
        </View>
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
  checkBox: { width: theme.space.xl + theme.space.sm, height: theme.space.xl },
  strokeHolder: { position: 'absolute' },
  shortHolder: {
    left: 0,
    top: theme.space.md,
    width: theme.space.md,
    transform: [{ rotate: '45deg' }],
    transformOrigin: 'left',
  },
  longHolder: {
    left: theme.space.sm,
    top: theme.space.xl - theme.space.xs,
    width: theme.space.xl,
    transform: [{ rotate: '-50deg' }],
    transformOrigin: 'left',
  },
  stroke: {
    height: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.onAccent,
  },
  fromLeft: { transformOrigin: 'left' },
}));
