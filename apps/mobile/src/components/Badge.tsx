import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { badgeText } from './TabBar';
import { Text } from './Text';

/**
 * Red unread count on a header icon (the bell): nothing for 0, then the
 * number, then "99+". Same look as the tab bar badge. Decorative: the control
 * it sits on says the count (`IconButton` `badge`).
 */
export function Badge({ count, testID }: { count: number | undefined; testID?: string }) {
  const text = badgeText(count);
  if (!text) return null;
  return (
    <View
      style={styles.badge}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Text variant="meta" tone="inverse" overlay style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    position: 'absolute',
    top: theme.space.xs,
    right: theme.space.xs,
    minWidth: theme.size.badge,
    minHeight: theme.size.badge,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.red,
  },
  text: { fontWeight: '700', lineHeight: theme.size.badge },
}));
