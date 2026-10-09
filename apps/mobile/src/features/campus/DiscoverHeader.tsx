import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { feed as copy } from '@/strings';

import { meApi, type Me } from '../me/api';
import { meKey } from '../me/MeScreens';
import { DiscoverSegment } from './DiscoverSegment';

type Props = {
  value: 'swipe' | 'campus';
  /** `card` on the grey Around campus screen, so the buttons stay visible. */
  surface?: 'bg2' | 'card';
  /** Reads the signed-in student (campus name). Tests pass a fake. */
  loadMe?: () => Promise<Me>;
};

/**
 * Discover header (DEC 90, mock screens 4 and 5): the campus name small above
 * a large "Discover", Search and Notifications buttons, then the
 * "For you | Around campus" segment. The campus name comes from the cached
 * `get_me` the Profile tab uses; it is simply left out until it loads.
 */
export function DiscoverHeader({ value, surface = 'bg2', loadMe = () => meApi.me() }: Props) {
  const router = useRouter();
  const me = useQuery({ queryKey: meKey, queryFn: loadMe, staleTime: 5 * 60_000 });
  const campus = me.data?.campus?.short_name ?? null;
  return (
    <View testID="discover-header">
      <View style={styles.top}>
        <View style={styles.titles}>
          {campus ? (
            <Text variant="meta" tone="ink3" numberOfLines={1} testID="discover-campus">
              {campus}
            </Text>
          ) : null}
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {copy.title}
          </Text>
        </View>
        <View style={styles.actions}>
          <IconButton
            icon="search"
            filled
            surface={surface}
            accessibilityLabel={copy.search}
            onPress={() => router.push('/search')}
            testID="discover-search"
          />
          <IconButton
            icon="bell"
            filled
            surface={surface}
            accessibilityLabel={copy.notifications}
            onPress={() => router.push('/notifications')}
            testID="discover-notifications"
          />
        </View>
      </View>
      <DiscoverSegment value={value} surface={surface === 'card' ? 'bg3' : 'bg2'} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingBottom: theme.space.md,
    paddingHorizontal: theme.space.screen,
  },
  titles: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
}));
