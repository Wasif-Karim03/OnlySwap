import { useRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressFeedback } from '@/theme/motion';

export const DOUBLE_TAP_GUARD_MS = 500;

/** Returns a press handler that ignores repeats within `ms` (DESIGN_SYSTEM §6). */
export function useGuardedPress(onPress: (() => void) | undefined, ms = DOUBLE_TAP_GUARD_MS) {
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current < ms) return;
    last.current = now;
    onPress?.();
  };
}

type Props = Omit<PressableProps, 'style' | 'children' | 'onPress'> & {
  onPress?: () => void;
  /** Themed styles go on children (Unistyles re-themes native views only). */
  children: ReactNode;
  /**
   * Layout-only styles (no colors), applied to the pressable itself so
   * alignSelf / flex work inside any parent, including centered columns.
   */
  style?: StyleProp<ViewStyle>;
  guard?: boolean;
};

/**
 * Every pressable in the app: press scale 0.97 / 120 ms (fade with reduce
 * motion) and the 500 ms double-tap guard.
 */
export function Tappable({ onPress, children, style, guard = true, disabled, ...rest }: Props) {
  const press = usePressFeedback();
  const guarded = useGuardedPress(onPress);
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={guard ? guarded : onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={style}
    >
      <Animated.View style={press.animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
}
