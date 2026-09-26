import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text, type TextTone } from './Text';

/** Counter color: ink2, amber at 90% of the limit, red at 100% (DESIGN_SYSTEM §6). */
export function counterTone(length: number, max: number): TextTone {
  if (length >= max) return 'red';
  if (length >= max * 0.9) return 'amber';
  return 'ink2';
}

type Props = Omit<TextInputProps, 'style' | 'maxLength' | 'editable'> & {
  label: string;
  maxLength: number;
  error?: string;
  disabled?: boolean;
};

export function TextArea({
  label,
  maxLength,
  error,
  disabled = false,
  value,
  onChangeText,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);
  const length = value?.length ?? 0;
  const state = disabled ? 'disabled' : error ? 'error' : focused ? 'focus' : 'default';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" tone="ink2">
          {label}
        </Text>
        <Text
          variant="meta"
          tone={counterTone(length, maxLength)}
          accessibilityLabel={`${length} / ${maxLength}`}
        >
          {`${length}/${maxLength}`}
        </Text>
      </View>
      <View style={styles.field(state)}>
        <TextInput
          multiline
          accessibilityLabel={label}
          accessibilityHint={error}
          editable={!disabled}
          maxLength={maxLength}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={theme.colors.ink3}
          selectionColor={theme.colors.ink}
          textAlignVertical="top"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

type FieldState = 'default' | 'focus' | 'error' | 'disabled';

const styles = StyleSheet.create((theme) => ({
  wrap: { gap: theme.space.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  field: (state: FieldState) => ({
    minHeight: theme.size.buttonL * 2,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.control,
    borderWidth: 2,
    borderColor:
      state === 'focus' ? theme.colors.ink : state === 'error' ? theme.colors.red : 'transparent',
    backgroundColor: state === 'error' ? theme.colors.redBg : theme.colors.bg2,
    opacity: state === 'disabled' ? 0.35 : 1,
  }),
  input: {
    flex: 1,
    color: theme.colors.ink,
    fontSize: theme.type.body.fontSize,
    lineHeight: theme.type.body.lineHeight,
  },
}));
