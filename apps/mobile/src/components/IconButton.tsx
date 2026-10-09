import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { liftShadow } from '@/theme/shadow';

import { Icon, type IconName } from './icons/Icon';
import type { TextTone } from './Text';
import { Tappable } from './Tappable';

type Props = {
  icon: IconName;
  /** Required: icon-only controls must be named for screen readers. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress?: () => void;
  disabled?: boolean;
  filled?: boolean;
  /**
   * Fill color when `filled`: `bg2` (default) on white screens, `card` with a
   * soft shadow over photos and on grey screens, `accent` for an "on" state
   * such as Saved (DEC 90). The icon follows the fill.
   */
  surface?: 'bg2' | 'card' | 'accent';
  /** `onPhoto` for controls over photos or the dark photo viewer. */
  tone?: Extract<TextTone, 'ink' | 'ink3' | 'onPhoto'>;
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
  surface = 'bg2',
  tone = 'ink',
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
      <View style={styles.hit(!!filled, !!disabled, surface)}>
        <Icon name={icon} tone={filled && surface === 'accent' ? 'onAccent' : tone} />
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  hit: (filled: boolean, disabled: boolean, surface: 'bg2' | 'card' | 'accent') => ({
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: filled ? theme.colors[surface] : 'transparent',
    opacity: disabled ? 0.35 : 1,
    ...(filled && surface !== 'bg2' ? liftShadow() : null),
  }),
}));
