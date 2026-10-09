import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Photo } from '@/components/Photo';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { feed as copy } from '@/strings';

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
  /** "Junior", when the seller shared their class year. */
  sellerYear?: string | null;
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

type Props = {
  card: DeckCard;
  /** Narrow grid tiles: the seller's name only, no year or saves line. */
  compact?: boolean;
  testID?: string;
};

/**
 * The card face (P6-FEED-02, DEC 90 mock screen 4): the photo on top, then on
 * white below it the title and price on one line, the meta line and the
 * seller with a small avatar. Nothing is written on the photo except the
 * photo count bars. Stamps and motion live in SwipeDeck; this stays a plain
 * view so list and grid mode can reuse it.
 */
export function SwipeCard({ card, compact = false, testID }: Props) {
  const cover = card.photos[0];
  const saved = savedLine(card.saveCount);
  const sellerMeta = compact
    ? ''
    : [card.sellerYear, saved].filter(Boolean).join(copy.metaSeparator);
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.photo}>
        <Photo source={cover?.uri ?? null} blurhash={cover?.blurhash ?? null} fill backdrop />
        {card.photos.length > 1 ? (
          <View style={styles.segments} importantForAccessibility="no-hide-descendants">
            {card.photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.segment(i === 0)} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="heading" numberOfLines={1} style={styles.title}>
            {card.title}
          </Text>
          <Text variant="heading" numberOfLines={1} style={styles.price}>
            {card.price}
          </Text>
        </View>
        {card.meta ? (
          <Text variant="meta" tone="ink2" numberOfLines={1}>
            {card.meta}
          </Text>
        ) : null}
        {card.sellerName ? (
          <View style={styles.seller}>
            <Avatar name={card.sellerName} uri={card.sellerAvatar} size="S" />
            <Text variant="label" numberOfLines={1} style={styles.sellerName}>
              {card.sellerName}
            </Text>
            {sellerMeta ? (
              <Text variant="meta" tone="ink3" numberOfLines={1} style={styles.sellerMeta}>
                {sellerMeta}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: 1,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  photo: { flex: 1, backgroundColor: theme.colors.bg2 },
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
    opacity: on ? 1 : 0.5,
  }),
  body: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.lg,
    gap: theme.space.xs,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm },
  title: { flex: 1 },
  // Heading size with the price weight (DESIGN_SYSTEM §3 `price`), so it sits on the title's line.
  price: { fontWeight: theme.type.price.fontWeight },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
  // First name and initial stay whole; the year and saves line gives way.
  sellerName: { flexShrink: 0, maxWidth: '60%' },
  sellerMeta: { flex: 1, minWidth: 0 },
}));
