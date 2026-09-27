import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from './icons/Icon';
import { Text } from './Text';

type Props = {
  label: string;
  kind: 'radio' | 'checkbox';
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  description?: string;
};

/** Radio or checkbox row; the whole row is pressable (DESIGN_SYSTEM §6). */
export function OptionRow({
  label,
  kind,
  selected,
  onPress,
  disabled = false,
  description,
}: Props) {
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.row(disabled)}
    >
      <View style={styles.mark(kind, selected)}>
        {selected ? (
          kind === 'radio' ? (
            <View style={styles.dot} />
          ) : (
            <Icon name="check" size={16} tone="inverse" />
          )
        ) : null}
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="meta" tone="ink2">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Checkbox without a row, for inline use (e.g. "I agree to the rules"). */
export function Checkbox(props: Omit<Props, 'kind'>) {
  return <OptionRow {...props} kind="checkbox" />;
}

const styles = StyleSheet.create((theme) => ({
  row: (disabled: boolean) => ({
    minHeight: theme.space.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    opacity: disabled ? 0.35 : 1,
  }),
  mark: (kind: 'radio' | 'checkbox', selected: boolean) => ({
    width: theme.space.xl,
    height: theme.space.xl,
    borderRadius: kind === 'radio' ? theme.radius.chip : theme.space.sm,
    borderWidth: 2,
    borderColor: selected ? theme.colors.ink : theme.colors.line2,
    backgroundColor: selected && kind === 'checkbox' ? theme.colors.ink : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  dot: {
    width: theme.space.md,
    height: theme.space.md,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.ink,
  },
  text: { flex: 1 },
}));
