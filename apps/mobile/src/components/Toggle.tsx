import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

type Props = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  description?: string;
};

/** Toggle row: off, on (ink), disabled. The whole row is the switch (44 pt). */
export function Toggle({ label, value, onChange, disabled = false, description }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.row(disabled)}
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
        <View style={styles.knob(value)} />
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
  text: { flex: 1 },
  track: (on: boolean) => ({
    width: theme.size.toggleW,
    height: theme.size.toggleH,
    borderRadius: theme.radius.chip,
    padding: 2,
    justifyContent: 'center',
    alignItems: on ? 'flex-end' : 'flex-start',
    backgroundColor: on ? theme.colors.ink : theme.colors.bg3,
  }),
  knob: (on: boolean) => ({
    width: theme.size.toggleH - 4,
    height: theme.size.toggleH - 4,
    borderRadius: theme.radius.chip,
    backgroundColor: on ? theme.colors.bg : theme.colors.card,
  }),
}));
