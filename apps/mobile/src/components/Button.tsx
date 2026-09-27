import { ActivityIndicator, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { haptic, type HapticKind } from '@/lib/haptics';

import { Tappable } from './Tappable';
import { Text, type TextTone } from './Text';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'text' | 'destructive';
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
};

/**
 * Button (DESIGN_SYSTEM §6). Loading keeps the width and shows a spinner;
 * disabled is 35% opacity and not pressable; 500 ms double-tap guard.
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
  const spinnerColor =
    variant === 'primary'
      ? theme.colors.onAccent
      : variant === 'dark'
        ? theme.colors.bg
        : theme.colors.ink;

  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        if (hapticOnPress) haptic(hapticOnPress);
        onPress?.();
      }}
      style={fullWidth ? styles.full : styles.hug}
    >
      <View style={styles.body(variant, size, disabled)}>
        <View style={loading ? styles.hidden : undefined}>
          <Text
            variant={size === 'S' ? 'label' : 'bodyStrong'}
            tone={TONE[variant]}
            style={styles.label}
          >
            {label}
          </Text>
        </View>
        {loading ? <ActivityIndicator style={styles.spinner} color={spinnerColor} /> : null}
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
              : 'transparent',
  }),
  hidden: { opacity: 0 },
  // Labels wrap at large Dynamic Type sizes instead of truncating (rule 10).
  label: { textAlign: 'center' },
  spinner: { position: 'absolute' },
}));
