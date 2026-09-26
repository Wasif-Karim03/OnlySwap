import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon, type IconName } from './icons/Icon';
import { Tappable } from './Tappable';

type Props = {
  icon: IconName;
  /** Required: icon-only controls must be named for screen readers. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress?: () => void;
  disabled?: boolean;
  filled?: boolean;
  testID?: string;
};

/** 44 pt hit area (CLAUDE.md rule 10). */
export function IconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled,
  filled,
  testID,
}: Props) {
  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.hit(!!filled, !!disabled)}>
        <Icon name={icon} />
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  hit: (filled: boolean, disabled: boolean) => ({
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: filled ? theme.colors.bg2 : 'transparent',
    opacity: disabled ? 0.35 : 1,
  }),
}));
