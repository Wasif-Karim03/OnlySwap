import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Photo } from '@/components/Photo';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { feed as copy } from '@/strings/en';

/** What one deck card shows (built from a FeedItem by the screen). */
export type DeckCard = {
  id: string;
  title: string;
  /** "$40" or "Free". */
  price: string;
  /** "Good condition · 12 minutes ago". */
  meta: string;
  sellerName: string;
  sellerAvatar: string | null;
  photos: { uri: string; blurhash: string | null }[];
  saveCount: number;
};

export function cardLabel(card: DeckCard): string {
  return [
    fill(copy.cardLabel, { title: card.title, price: card.price }),
    card.meta,
    card.sellerName,
  ]
    .filter(Boolean)
    .join('. ');
}

export function savedLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? copy.savedByOne : fill(copy.savedBy, { n });
}

type Props = { card: DeckCard; testID?: string };

/**
 * The card face (P6-FEED-02): almost all photo, price as the biggest text,
 * a hairline instead of a shadow (DESIGN_SYSTEM §4). Stamps and motion live
 * in SwipeDeck; this stays a plain view so list mode can reuse it.
 */
export function SwipeCard({ card, testID }: Props) {
  const cover = card.photos[0];
  const saved = savedLine(card.saveCount);
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.photo}>
        <Photo
          source={cover?.uri ?? null}
          blurhash={cover?.blurhash ?? null}
          aspectRatio={3 / 4}
          backdrop
        />
      </View>
      {card.photos.length > 1 ? (
        <View style={styles.segments} importantForAccessibility="no-hide-descendants">
          {card.photos.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={styles.segment(i === 0)} />
          ))}
        </View>
      ) : null}
      {saved ? (
        <View style={styles.pill}>
          <Text variant="meta" tone="onPhoto">
            {saved}
          </Text>
        </View>
      ) : null}
      <View style={styles.scrim} />
      <View style={styles.body}>
        <Text variant="price" tone="onPhoto" numberOfLines={1}>
          {card.price}
        </Text>
        <Text variant="heading" tone="onPhoto" numberOfLines={2}>
          {card.title}
        </Text>
        {card.meta ? (
          <Text variant="meta" tone="onPhoto" numberOfLines={1}>
            {card.meta}
          </Text>
        ) : null}
        <View style={styles.seller}>
          <Avatar name={card.sellerName} uri={card.sellerAvatar} size="S" />
          <Text variant="label" tone="onPhoto" numberOfLines={1} style={styles.sellerName}>
            {card.sellerName}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: 1,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.photoBg,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  photo: { ...StyleSheet.absoluteFillObject },
  segments: {
    position: 'absolute',
    top: theme.space.md,
    left: theme.space.md,
    right: theme.space.md,
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  segment: (on: boolean) => ({
    flex: 1,
    height: 3,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.onPhoto,
    opacity: on ? 1 : 0.4,
  }),
  pill: {
    position: 'absolute',
    top: theme.space.xl,
    right: theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.overlay,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: theme.colors.overlay,
  },
  body: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    bottom: theme.space.lg,
    gap: theme.space.xs,
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    marginTop: theme.space.xs,
  },
  sellerName: { flexShrink: 1 },
}));
