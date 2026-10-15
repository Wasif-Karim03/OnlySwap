import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { nav as navCopy } from '@/strings';
import { liftShadow } from '@/theme/shadow';

import { Badge } from './Badge';

import { Icon, type IconName } from './icons/Icon';
import { badgeText } from './TabBar';
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
  /** Unread count drawn in the corner (the bell); 0 or none hides it. */
  badge?: number;
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
  badge,
  testID,
}: Props) {
  const count = badgeText(badge);
  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        count ? fill(navCopy.tabWithBadge, { label: accessibilityLabel, count }) : accessibilityLabel
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.hit(!!filled, !!disabled, surface)}>
        <Icon name={icon} tone={filled && surface === 'accent' ? 'onAccent' : tone} />
        <Badge count={badge} testID={testID ? `${testID}-badge` : undefined} />
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
