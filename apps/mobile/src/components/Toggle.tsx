import { size } from '@onlyswap/tokens';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';
import { a11yState } from '@/lib/a11y';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

type Props = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  description?: string;
};

/** Gap between the track edge and the knob. */
const KNOB_INSET = 2;
/** How far the knob slides from off to on. */
const KNOB_TRAVEL = size.toggleW - size.toggleH;
/** Pressed rows dim; nothing moves (DESIGN_REVIEW 3.08). */
const PRESSED_OPACITY = 0.6;

/**
 * Toggle row: off, on (ink), disabled. The whole row is the switch (44 pt).
 * The knob slides over the 150 ms `fade` timing, instantly with reduce motion
 * (DESIGN_REVIEW 3.08).
 */
export function Toggle({ label, value, onChange, disabled = false, description }: Props) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    const to = value ? 1 : 0;
    progress.value = reduced ? to : animateTo(to, resolveMotion('fade', false));
  }, [value, reduced, progress]);
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * KNOB_TRAVEL }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      {...a11yState({ checked: value, disabled })}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row(disabled), pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="meta" tone="ink2">
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.track(value)}>
        <Animated.View style={[styles.knob(value), knobStyle]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: (disabled: boolean) => ({
    minHeight: theme.space.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    opacity: disabled ? 0.35 : 1,
  }),
  pressed: { opacity: PRESSED_OPACITY },
  text: { flex: 1 },
  track: (on: boolean) => ({
    width: theme.size.toggleW,
    height: theme.size.toggleH,
    borderRadius: theme.radius.chip,
    padding: KNOB_INSET,
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: on ? theme.colors.ink : theme.colors.bg3,
  }),
  knob: (on: boolean) => ({
    width: theme.size.toggleH - KNOB_INSET * 2,
    height: theme.size.toggleH - KNOB_INSET * 2,
    borderRadius: theme.radius.chip,
    // Off: a grey knob on the light track. The white knob was 1.23:1 (1.05:1
    // in dark), so an off switch looked like empty space (UX audit 2026-10-25).
    backgroundColor: on ? theme.colors.bg : theme.colors.ink3,
  }),
}));
