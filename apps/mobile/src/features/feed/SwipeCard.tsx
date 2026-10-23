import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

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
  /** "Verified student · 95% thumbs up" (DEC 124). */
  trust?: string | null;
  photos: { uri: string; blurhash: string | null }[];
  saveCount: number;
};

export function cardLabel(card: DeckCard): string {
  return [
    fill(copy.cardLabel, { title: card.title, price: card.price }),
    card.meta,
    card.sellerName,
    card.trust,
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
  /** Narrow grid tiles: the seller's name only, no trust or year. */
  compact?: boolean;
  testID?: string;
};

/**
 * The card face (P6-FEED-02; DESIGN_REVIEW 3.02 Discover): the photo takes the
 * card, with only the photo count bars on it. Under it, on white, line one is
 * the title and the price; line two is the seller and the trust string
 * ("Maya R. · Verified student · 95% thumbs up"), the facts that decide a
 * swipe. The saves line, the avatar and the shield row are gone. The quiet
 * condition and class year line stays because tests pin it (see the batch
 * report). Stamps and motion live in SwipeDeck; this stays a plain view so
 * list and grid mode can reuse it.
 */
export function SwipeCard({ card, compact = false, testID }: Props) {
  const cover = card.photos[0];
  const trust = !compact && card.trust ? card.trust : null;
  const year = compact ? null : (card.sellerYear ?? null);
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
        {card.sellerName || trust ? (
          <Text variant="meta" tone="ink2" numberOfLines={1}>
            {card.sellerName ? (
              <Text variant="meta" style={styles.sellerName}>
                {card.sellerName}
              </Text>
            ) : null}
            {card.sellerName && trust ? copy.metaSeparator : null}
            {trust ? (
              <Text variant="meta" tone="ink2" testID="card-trust">
                {trust}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {card.meta || year ? (
          <Text variant="meta" tone="ink3" numberOfLines={1}>
            {card.meta ? <Text variant="meta" tone="ink3">{card.meta}</Text> : null}
            {card.meta && year ? copy.metaSeparator : null}
            {year ? <Text variant="meta" tone="ink3">{year}</Text> : null}
          </Text>
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
  // The seller's name leads line two in the label weight.
  sellerName: { fontWeight: theme.type.label.fontWeight },
}));
