import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from './icons/Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

type ChipProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Removable chips show an x and call onRemove. */
  onRemove?: () => void;
  onPress?: () => void;
  removeLabel?: string;
};

/** Chip: filter / choice / removable. On = ink fill (DESIGN_SYSTEM §6). */
export function Chip({
  label,
  selected = false,
  disabled = false,
  onRemove,
  onPress,
  removeLabel,
}: ChipProps) {
  const removable = !!onRemove;
  return (
    <Tappable
      accessibilityRole={removable ? 'button' : 'checkbox'}
      accessibilityLabel={removable && removeLabel ? `${label}, ${removeLabel}` : label}
      accessibilityState={removable ? { disabled } : { checked: selected, disabled }}
      disabled={disabled}
      onPress={removable ? onRemove : onPress}
      guard={false}
    >
      <View style={styles.chip(selected, disabled)}>
        <Text variant="label" tone={selected ? 'inverse' : 'ink'}>
          {label}
        </Text>
        {removable ? <Icon name="x" size={16} tone={selected ? 'inverse' : 'ink2'} /> : null}
      </View>
    </Tappable>
  );
}

type Option<T extends string> = { value: T; label: string };

type ChipGroupProps<T extends string> = {
  label: string;
  options: Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  /** single = choice chips (one on), multi = filter chips. */
  mode?: 'single' | 'multi';
};

export function toggleChip<T extends string>(value: T[], option: T, mode: 'single' | 'multi'): T[] {
  if (mode === 'single') return value[0] === option ? [] : [option];
  return value.includes(option) ? value.filter((v) => v !== option) : [...value, option];
}

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  mode = 'multi',
}: ChipGroupProps<T>) {
  return (
    <View
      accessibilityRole={mode === 'single' ? 'radiogroup' : undefined}
      accessibilityLabel={label}
      style={styles.group}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value.includes(o.value)}
          onPress={() => onChange(toggleChip(value, o.value, mode))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: (selected: boolean, disabled: boolean) => ({
    minHeight: theme.size.buttonS,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md + theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: selected ? theme.colors.ink : theme.colors.bg2,
    opacity: disabled ? 0.35 : 1,
  }),
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
}));
