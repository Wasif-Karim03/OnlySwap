import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ListingTile } from '@/components/ListingTile';
import { Text } from '@/components/Text';
import { feed as feedCopy } from '@/strings';

import { mediaUrl, priceLabel } from '../sell/logic';
import type { FeedItem } from './logic';

/**
 * A titled, horizontally scrolling row of listing tiles (DEC 128): More like
 * this on a listing, Recently viewed in Search. Renders nothing when empty.
 */
export function ListingStrip({
  title,
  items,
  mediaBase,
  onOpen,
  testID,
}: {
  title: string;
  items: FeedItem[];
  mediaBase: string;
  onOpen: (id: string) => void;
  testID?: string;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.root} testID={testID}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((l) => (
          <View key={l.id} style={styles.cell}>
            <ListingTile
              title={l.title}
              price={priceLabel(l.kind, l.price_cents, feedCopy.free)}
              photo={l.photos[0] ? mediaUrl(mediaBase, l.photos[0].thumb_path) : null}
              blurhash={l.photos[0]?.blurhash}
              state={l.status === 'hold' ? 'hold' : 'default'}
              onPress={() => onOpen(l.id)}
              testID={testID ? `${testID}-${l.id}` : undefined}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.space.sm },
  row: { gap: theme.space.md },
  cell: { width: theme.size.stripTile },
}));
