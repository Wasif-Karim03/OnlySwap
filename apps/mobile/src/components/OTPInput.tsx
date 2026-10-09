import { useEffect, useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Text } from './Text';

export const OTP_LENGTH = 6;

/** Keeps digits only, max 6 (pasted codes and autofill included). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

type Props = {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  label: string;
  error?: boolean;
  disabled?: boolean;
  /** Focus on mount (the verify-code screen); off by default. */
  autoFocus?: boolean;
};

/** How a cell looks: the one being typed into, a filled digit, or still empty. */
export type OtpCellState = 'active' | 'filled' | 'empty';

export function otpCellState(index: number, value: string, disabled: boolean): OtpCellState {
  if (!disabled && index === Math.min(value.length, OTP_LENGTH - 1) && value.length < OTP_LENGTH)
    return 'active';
  return value[index] ? 'filled' : 'empty';
}

/**
 * 6 cells over one hidden input with `oneTimeCode` autofill (DESIGN_SYSTEM §6).
 * Six large boxes across the width (DEC 90): filled ones white with a hairline
 * border, the active one with the ink border, empty ones soft grey.
 * Error shakes (a fade with reduce motion) and fires the warning haptic.
 */
export function OTPInput({
  value,
  onChange,
  onComplete,
  label,
  error = false,
  disabled = false,
  autoFocus = false,
}: Props) {
  const input = useRef<TextInput>(null);
  const reduced = useReducedMotion();
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (!error) return;
    haptic('warning');
    if (reduced) return;
    shake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [error, reduced, shake]);

  return (
    <Pressable accessibilityRole="none" onPress={() => input.current?.focus()} disabled={disabled}>
      <Animated.View style={shakeStyle}>
        <View style={styles.row}>
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <View key={i} style={styles.cell(otpCellState(i, value, disabled), error, disabled)}>
              {/* Fixed-size cells: digits follow Dynamic Type up to the 1.4x overlay cap. */}
              <Text variant="title" overlay testID={`otp-cell-${i}`}>
                {value[i] ?? ''}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
      <TextInput
        ref={input}
        testID="otp-input"
        accessibilityLabel={label}
        value={value}
        editable={!disabled}
        autoFocus={autoFocus && !disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        caretHidden
        style={styles.hidden}
        onChangeText={(raw) => {
          const code = normalizeCode(raw);
          onChange(code);
          if (code.length === OTP_LENGTH) onComplete?.(code);
        }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: 'row', gap: theme.space.sm, justifyContent: 'center' },
  cell: (state: OtpCellState, error: boolean, disabled: boolean) => ({
    flex: 1,
    maxWidth: theme.size.otpCell + theme.space.lg,
    height: theme.size.otpCell + theme.space.sm,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: error
      ? theme.colors.red
      : state === 'active'
        ? theme.colors.ink
        : state === 'filled'
          ? theme.colors.line
          : 'transparent',
    backgroundColor: error
      ? theme.colors.redBg
      : state === 'empty'
        ? theme.colors.bg2
        : theme.colors.card,
    opacity: disabled ? 0.35 : 1,
  }),
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
}));
