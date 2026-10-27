import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/Text';
import { feed as copy } from '@/strings';

import { NotificationBell } from '@/features/notifications/NotificationBell';

type Props = {
  /** `card` on a grey screen, so the bell stays visible. */
  surface?: 'bg2' | 'card';
};

/**
 * Discover header (round 2 finals, DEC 145): the page title on the left and
 * the bell on the right, nothing else. Search lives in the Feed now, and the
 * header sits on the plain background, so the bell is a plain icon; glass
 * stays on the tab bar.
 */
export function DiscoverHeader({ surface = 'bg2' }: Props) {
  return (
    <View testID="discover-header" style={styles.top}>
      {/* Same size as the other tab titles (NavBar large: display). */}
      <Text variant="display" accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {copy.title}
      </Text>
      <NotificationBell
        surface={surface}
        accessibilityLabel={copy.notifications}
        testID="discover-notifications"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingBottom: theme.space.sm,
    paddingLeft: theme.space.screen,
    paddingRight: theme.space.sm,
    minHeight: theme.size.navBar + theme.space.lg,
  },
  title: { flex: 1 },
}));
