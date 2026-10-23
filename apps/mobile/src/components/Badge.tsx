import { View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

/** Badge text: nothing for 0, the number up to 99, then "99+". */
export function badgeText(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

/**
 * The one red unread pill (DESIGN_REVIEW 3.08 Badge): red fill, `inverse`
 * text, the 99+ rule. Badge, TabBar and SegmentedControl all draw this, so the
 * look cannot drift; each caller only adds its own position via `style`.
 * Decorative: the control it sits on says the count, so `hidden` (default)
 * keeps it out of the accessibility tree; pass `hidden={false}` inside a
 * control that already groups its children.
 */
export function CountPill({
  count,
  style,
  hidden = true,
  testID,
}: {
  count: number | undefined;
  style?: StyleProp<ViewStyle>;
  hidden?: boolean;
  testID?: string;
}) {
  const text = badgeText(count);
  if (!text) return null;
  return (
    <View
      style={[styles.pill, style]}
      pointerEvents="none"
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID={testID}
    >
      <Text variant="meta" tone="inverse" overlay style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Red unread count on a header icon (the bell): nothing for 0, then the
 * number, then "99+". Same look as the tab bar badge. Decorative: the control
 * it sits on says the count (`IconButton` `badge`).
 */
export function Badge({ count, testID }: { count: number | undefined; testID?: string }) {
  return <CountPill count={count} style={styles.corner} testID={testID} />;
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    minWidth: theme.size.badge,
    minHeight: theme.size.badge,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.red,
  },
  corner: {
    position: 'absolute',
    top: theme.space.xs,
    right: theme.space.xs,
  },
  text: { fontWeight: '700', lineHeight: theme.size.badge },
}));
