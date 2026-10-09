import { forwardRef, useState } from 'react';
import { ActivityIndicator, Platform, TextInput, View, type TextInputProps } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './icons/Icon';
import { Text } from './Text';

export type InputKind = 'text' | 'email' | 'price' | 'search';

export type InputProps = Omit<TextInputProps, 'style' | 'editable'> & {
  label: string;
  kind?: InputKind;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Hide the visible label (search); it is still read by screen readers. */
  hideLabel?: boolean;
  /**
   * Label inside the field, small above the value (sign-in steps, DEC 90).
   * The field turns white with the ink border while focused.
   */
  inlineLabel?: boolean;
};

/**
 * Web only: fields that draw their own 2 px ink focus border opt out of the
 * page's `:focus-visible` outline (public/index.html), so focus shows once,
 * not as two rings (DEC 90). Native ignores it.
 */
export function appFocusRing(os: string = Platform.OS): Record<string, unknown> {
  return os === 'web' ? { dataSet: { focusRing: 'app' } } : {};
}

const KIND_PROPS: Record<InputKind, Partial<TextInputProps>> = {
  text: {},
  email: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'email',
    textContentType: 'emailAddress',
  },
  price: { keyboardType: 'decimal-pad' },
  search: { returnKeyType: 'search', autoCorrect: false },
};

/** Input (DESIGN_SYSTEM §6): focus ring 2 px ink, error redBg + red ring + message. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    kind = 'text',
    error,
    disabled = false,
    loading = false,
    hideLabel = false,
    inlineLabel = false,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);
  const state = disabled ? 'disabled' : error ? 'error' : focused ? 'focus' : 'default';

  return (
    <View style={styles.wrap}>
      {hideLabel || inlineLabel ? null : (
        <Text variant="label" tone="ink2">
          {label}
        </Text>
      )}
      <View style={styles.field(state, inlineLabel)}>
        {kind === 'search' ? <Icon name="search" size={18} tone="ink2" /> : null}
        {kind === 'price' ? (
          <Text variant="bodyStrong" tone="ink2">
            $
          </Text>
        ) : null}
        <View style={styles.valueCol}>
          {inlineLabel && !hideLabel ? (
            <Text variant="meta" tone="ink3" style={styles.inlineLabel}>
              {label}
            </Text>
          ) : null}
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            accessibilityHint={error}
            editable={!disabled}
            placeholderTextColor={theme.colors.ink3}
            selectionColor={theme.colors.ink}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={styles.input(inlineLabel)}
            {...appFocusRing()}
            {...KIND_PROPS[kind]}
            {...rest}
          />
        </View>
        {loading ? <ActivityIndicator color={theme.colors.ink2} /> : null}
      </View>
      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

type FieldState = 'default' | 'focus' | 'error' | 'disabled';

const styles = StyleSheet.create((theme) => ({
  wrap: { gap: theme.space.xs },
  field: (state: FieldState, inline: boolean) => ({
    minHeight: inline ? theme.size.buttonL + theme.space.md : theme.size.buttonL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.control,
    borderWidth: 2,
    borderColor:
      state === 'focus' ? theme.colors.ink : state === 'error' ? theme.colors.red : 'transparent',
    backgroundColor:
      state === 'error'
        ? theme.colors.redBg
        : inline && state === 'focus'
          ? theme.colors.card
          : theme.colors.bg2,
    opacity: state === 'disabled' ? 0.35 : 1,
  }),
  valueCol: { flex: 1, justifyContent: 'center' },
  inlineLabel: { fontWeight: '600', paddingTop: theme.space.sm },
  input: (inline: boolean) => ({
    minHeight: inline ? theme.size.buttonS : theme.size.hit,
    color: theme.colors.ink,
    fontSize: theme.type.body.fontSize,
    fontWeight: inline ? '600' : '400',
    // The ink border above is the focus ring; the browser's own is off (web).
    outlineWidth: 0,
  }),
}));
