import { motion } from '@onlyswap/tokens';
import { useEffect } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** Animation kinds from DESIGN_SYSTEM §5. */
export type MotionKind = 'tap' | 'sheet' | 'swipe' | 'success' | 'fade';

export type AnimationSpec =
  | { type: 'spring'; damping: number; stiffness: number }
  | { type: 'timing'; duration: number; easing: 'out' | 'linear' };

/**
 * Resolves a motion token. With reduce motion on, every animation becomes the
 * 150 ms fade (DESIGN_SYSTEM §5, P2-MOT-01).
 */
export function resolveMotion(kind: MotionKind, reduced: boolean): AnimationSpec {
  if (reduced || kind === 'fade')
    return { type: 'timing', duration: motion.fade.duration, easing: 'linear' };
  switch (kind) {
    case 'tap':
      return { type: 'timing', duration: motion.tap.duration, easing: 'out' };
    case 'success':
      return { type: 'timing', duration: motion.success.duration, easing: 'out' };
    case 'sheet':
      return { type: 'spring', damping: motion.sheet.damping, stiffness: motion.sheet.stiffness };
    case 'swipe':
      return { type: 'spring', damping: motion.swipe.damping, stiffness: motion.swipe.stiffness };
  }
}

/** Runs `value` to `to` with the resolved spec. Worklet-safe. */
export function animateTo(to: number, spec: AnimationSpec) {
  'worklet';
  if (spec.type === 'spring') {
    return withSpring(to, {
      damping: spec.damping,
      stiffness: spec.stiffness,
      reduceMotion: ReduceMotion.Never,
    });
  }
  return withTiming(to, {
    duration: spec.duration,
    easing: spec.easing === 'out' ? Easing.out(Easing.quad) : Easing.linear,
    reduceMotion: ReduceMotion.Never,
  });
}

/**
 * Press feedback for every pressable: scale to 0.97 in 120 ms, or with reduce
 * motion a 150 ms fade to 0.7 opacity instead of any movement.
 */
export function usePressFeedback() {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const spec = resolveMotion('tap', reduced);

  const animatedStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: 1 - pressed.value * 0.3 }
      : { transform: [{ scale: 1 - pressed.value * (1 - motion.tap.scale) }] },
  );

  return {
    animatedStyle,
    onPressIn: () => {
      pressed.value = animateTo(1, spec);
    },
    onPressOut: () => {
      pressed.value = animateTo(0, spec);
    },
  };
}

/**
 * Drives the success check-draw (0 → 1 over 400 ms). With reduce motion the
 * consumer shows the finished check and fades it in over 150 ms.
 */
export function useSuccessProgress(visible: boolean) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const fade = resolveMotion('fade', true);
    if (!visible) {
      progress.value = 0;
      opacity.value = 0;
      return;
    }
    if (reduced) {
      progress.value = 1;
      opacity.value = animateTo(1, fade);
    } else {
      opacity.value = 1;
      progress.value = animateTo(1, resolveMotion('success', false));
    }
  }, [visible, reduced, progress, opacity]);

  return { progress, opacity, reduced };
}
