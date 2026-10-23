import { useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { haptic, type HapticKind } from '@/lib/haptics';

import { appFocusRing } from './Input';
import { SMALL_SLOP, Tappable } from './Tappable';
import { Text, type TextTone } from './Text';
import { a11yState } from '@/lib/a11y';

/**
 * `onAccent` and `textOnAccent` sit on an accent-filled screen (Welcome, DEC 89):
 * they keep the same colors in light and dark mode because the accent does.
 */
export type ButtonVariant =
  'primary' | 'dark' | 'secondary' | 'text' | 'destructive' | 'onAccent' | 'textOnAccent';
export type ButtonSize = 'L' | 'M' | 'S';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Only for the budgeted moments (offer sent, listing posted...). */
  hapticOnPress?: Extract<HapticKind, 'success'>;
  accessibilityHint?: string;
  testID?: string;
  fullWidth?: boolean;
};

const TONE: Record<ButtonVariant, TextTone> = {
  primary: 'onAccent',
  dark: 'inverse',
  secondary: 'ink',
  text: 'ink',
  destructive: 'inverse',
  onAccent: 'onPhoto',
  textOnAccent: 'onAccent',
};

/**
 * Web only: true when focus came from the keyboard (`:focus-visible`), so a
 * mouse click does not leave a ring behind. Native never shows the ring.
 */
export function isKeyboardFocus(target: unknown): boolean {
  const el = target as { matches?: (selector: string) => boolean } | null | undefined;
  try {
    return el?.matches?.(':focus-visible') ?? false;
  } catch {
    // Older browsers without :focus-visible: show the ring on every focus.
    return true;
  }
}

/** Web keyboard focus handlers plus the opt-out from the page outline (one ring, not two). */
function useWebFocusRing() {
  const [focusVisible, setFocusVisible] = useState(false);
  if (Platform.OS !== 'web') return { focusVisible: false, focusProps: {} };
  return {
    focusVisible,
    focusProps: {
      ...appFocusRing(),
      onFocus: (e: { nativeEvent?: { target?: unknown }; target?: unknown }) =>
        setFocusVisible(isKeyboardFocus(e.nativeEvent?.target ?? e.target)),
      onBlur: () => setFocusVisible(false),
    },
  };
}

/**
 * Button (DESIGN_SYSTEM §6). Loading keeps the width and shows a spinner;
 * disabled is 35% opacity and not pressable; 500 ms double-tap guard. On web,
 * keyboard focus draws a 2 px ink ring, the same ring Input uses.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'L',
  loading = false,
  disabled = false,
  hapticOnPress,
  accessibilityHint,
  testID,
  fullWidth = true,
}: ButtonProps) {
  const { theme } = useUnistyles();
  const inactive = disabled || loading;
  const { focusVisible, focusProps } = useWebFocusRing();
  const spinnerColor =
    variant === 'primary'
      ? theme.colors.onAccent
      : variant === 'dark'
        ? theme.colors.bg
        : variant === 'onAccent'
          ? theme.colors.onPhoto
          : variant === 'textOnAccent'
            ? theme.colors.onAccent
            : theme.colors.ink;

  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      {...a11yState({ disabled: inactive, busy: loading })}
      hitSlop={size === 'S' ? SMALL_SLOP : undefined}
      disabled={inactive}
      onPress={() => {
        if (hapticOnPress) haptic(hapticOnPress);
        onPress?.();
      }}
      style={fullWidth ? styles.full : styles.hug}
      {...focusProps}
    >
      <View style={styles.body(variant, size, disabled)}>
        {/* The same views whether loading or not, only their opacity changes.
            Swapping a flattened wrapper for a real one and adding the spinner
            in the same frame crashed Android when Post was tapped ("child
            already has a parent", owner testing on a Pixel-class phone). */}
        <View collapsable={false} style={loading ? styles.hidden : styles.shown}>
          <Text
            variant={size === 'S' ? 'label' : 'bodyStrong'}
            tone={TONE[variant]}
            style={styles.label}
          >
            {label}
          </Text>
        </View>
        <ActivityIndicator
          animating={loading}
          style={[styles.spinner, loading ? styles.shown : styles.hidden]}
          color={spinnerColor}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
        {focusVisible ? <View pointerEvents="none" style={styles.focusRing} /> : null}
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  full: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  body: (variant: ButtonVariant, size: ButtonSize, disabled: boolean) => ({
    minHeight: theme.size[`button${size}`],
    paddingHorizontal: size === 'S' ? theme.space.lg : theme.space.xl,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space.sm,
    opacity: disabled ? 0.35 : 1,
    backgroundColor:
      variant === 'primary'
        ? theme.colors.accent
        : variant === 'dark'
          ? theme.colors.ink
          : variant === 'secondary'
            ? theme.colors.bg2
            : variant === 'destructive'
              ? theme.colors.red
              : variant === 'onAccent'
                ? theme.colors.onAccent
                : 'transparent',
  }),
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
  // Labels wrap at large Dynamic Type sizes instead of truncating (rule 10).
  label: { textAlign: 'center' },
  spinner: { position: 'absolute' },
  // Outside the button edge (like outline-offset 2 px) so the fill keeps its size.
  focusRing: {
    position: 'absolute',
    top: -theme.space.xs,
    right: -theme.space.xs,
    bottom: -theme.space.xs,
    left: -theme.space.xs,
    borderWidth: 2,
    borderColor: theme.colors.ink,
    borderRadius: theme.radius.control + theme.space.xs,
  },
}));
