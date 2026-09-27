import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decreaseLabel: string;
  increaseLabel: string;
};

export function clampStep(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

/** - value + control; exposed as an adjustable element for screen readers. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  decreaseLabel,
  increaseLabel,
}: Props) {
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        onChange(
          clampStep(value, e.nativeEvent.actionName === 'increment' ? step : -step, min, max),
        )
      }
      style={styles.row}
    >
      <Text variant="bodyStrong" style={styles.label}>
        {label}
      </Text>
      <IconButton
        icon="minus"
        filled
        accessibilityLabel={decreaseLabel}
        disabled={value <= min}
        onPress={() => onChange(clampStep(value, -step, min, max))}
      />
      <Text variant="heading" style={styles.value}>
        {String(value)}
      </Text>
      <IconButton
        icon="plus"
        filled
        accessibilityLabel={increaseLabel}
        disabled={value >= max}
        onPress={() => onChange(clampStep(value, step, min, max))}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.space.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  label: { flex: 1 },
  value: { minWidth: theme.space['2xl'], textAlign: 'center', fontVariant: ['tabular-nums'] },
}));
