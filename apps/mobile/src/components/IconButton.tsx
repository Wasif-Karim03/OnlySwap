import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { nav as navCopy } from '@/strings';

import { Badge, badgeText } from './Badge';

import { Icon, type IconName } from './icons/Icon';
import type { TextTone } from './Text';
import { Tappable } from './Tappable';
import { a11yState } from '@/lib/a11y';

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
   * 1 px `line` hairline over photos and on grey screens (no shadow,
   * DESIGN_SYSTEM §4), `accent` for a flat "on" state such as Saved (DEC 90),
   * `ink` for a primary round action such as Send (DEC 143).
   * The icon follows the fill.
   */
  surface?: 'bg2' | 'card' | 'accent' | 'ink';
  /** `onPhoto` for controls over photos or the dark photo viewer. */
  tone?: Extract<TextTone, 'ink' | 'ink3' | 'onPhoto'>;
  /** An on state (Saved): the icon is drawn solid and screen readers hear "selected". */
  selected?: boolean;
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
  selected,
  badge,
  testID,
}: Props) {
  const count = badgeText(badge);
  return (
    <Tappable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        count
          ? fill(navCopy.tabWithBadge, { label: accessibilityLabel, count })
          : accessibilityLabel
      }
      accessibilityHint={accessibilityHint}
      {...a11yState(
        selected === undefined ? { disabled: !!disabled } : { disabled: !!disabled, selected },
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.hit(!!filled, !!disabled, surface)}>
        <Icon
          name={icon}
          tone={
            filled && surface === 'accent'
              ? 'onAccent'
              : filled && surface === 'ink'
                ? 'inverse'
                : tone
          }
          filled={!!selected}
        />
        <Badge count={badge} testID={testID ? `${testID}-badge` : undefined} />
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  hit: (filled: boolean, disabled: boolean, surface: 'bg2' | 'card' | 'accent' | 'ink') => ({
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: filled ? theme.colors[surface] : 'transparent',
    opacity: disabled ? 0.35 : 1,
    // A hairline instead of a lift: shadows are for sheets and toasts only.
    borderWidth: filled && surface === 'card' ? 1 : 0,
    borderColor: theme.colors.line,
  }),
}));
