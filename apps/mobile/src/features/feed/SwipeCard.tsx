import { Platform, View } from 'react-native';
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
  /**
   * The live deck (round 2, design/system.md): the photo fills the card and
   * the same lines sit on a bottom scrim, leaving room for the action row that
   * floats over the card's foot. List and grid tiles keep the white block.
   */
  overlay?: boolean;
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
export function SwipeCard({ card, compact = false, overlay = false, testID }: Props) {
  const cover = card.photos[0];
  const trust = !compact && card.trust ? card.trust : null;
  const year = compact ? null : (card.sellerYear ?? null);
  const quiet = overlay ? 'onPhoto' : 'ink2';
  const faint = overlay ? 'onPhoto' : 'ink3';
  return (
    <View style={styles.card(overlay)} testID={testID}>
      <View style={styles.photo}>
        <Photo source={cover?.uri ?? null} blurhash={cover?.blurhash ?? null} fill backdrop />
        {card.photos.length > 1 ? (
          <View style={styles.segments} importantForAccessibility="no-hide-descendants">
            {card.photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.segment(i === 0)} />
            ))}
          </View>
        ) : null}
        {overlay ? <View style={styles.scrim} pointerEvents="none" /> : null}
      </View>
      <View style={styles.body(overlay)}>
        <View style={styles.titleRow}>
          <Text
            variant="heading"
            tone={overlay ? 'onPhoto' : 'ink'}
            numberOfLines={1}
            style={styles.title(overlay)}
          >
            {card.title}
          </Text>
          <Text
            variant="heading"
            tone={overlay ? 'onPhoto' : 'ink'}
            numberOfLines={1}
            style={styles.price(overlay)}
          >
            {card.price}
          </Text>
        </View>
        {card.sellerName || trust ? (
          <Text variant="meta" tone={quiet} numberOfLines={1} style={styles.dim(overlay)}>
            {card.sellerName ? (
              <Text variant="meta" tone={overlay ? 'onPhoto' : 'ink'} style={styles.sellerName}>
                {card.sellerName}
              </Text>
            ) : null}
            {card.sellerName && trust ? copy.metaSeparator : null}
            {trust ? (
              <Text variant="meta" tone={quiet} testID="card-trust">
                {trust}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {card.meta || year ? (
          <Text variant="meta" tone={faint} numberOfLines={1} style={styles.dim(overlay)}>
            {card.meta ? (
              <Text variant="meta" tone={faint}>
                {card.meta}
              </Text>
            ) : null}
            {card.meta && year ? copy.metaSeparator : null}
            {year ? (
              <Text variant="meta" tone={faint}>
                {year}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: (overlay: boolean) => ({
    flex: 1,
    borderRadius: overlay ? theme.radius.deck : theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    borderWidth: overlay ? 0 : 1,
    borderColor: theme.colors.line,
  }),
  // The one gradient the spec allows: the photo scrim (DESIGN_SYSTEM §8).
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${theme.colors.scrimEnd})`,
    // react-native-web reads the CSS property instead.
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: `linear-gradient(to bottom, transparent, ${theme.colors.scrimEnd})`,
        } as object)
      : null),
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
  // Overlay: the lines sit on the scrim above the floating action row
  // (button height plus its padding).
  body: (overlay: boolean) =>
    overlay
      ? {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: theme.space.xl,
          paddingBottom: theme.size.buttonL + theme.space.xl + theme.space.sm,
          gap: theme.space.xs,
        }
      : {
          paddingHorizontal: theme.space.lg,
          paddingTop: theme.space.md,
          paddingBottom: theme.space.lg,
          gap: theme.space.xs,
        },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm },
  title: (overlay: boolean) => ({
    flex: 1,
    ...(overlay
      ? { fontSize: theme.type.title.fontSize, lineHeight: theme.type.title.lineHeight }
      : null),
  }),
  // Heading size with the price weight (DESIGN_SYSTEM §3 `price`), so it sits on the title's line.
  price: (overlay: boolean) => ({
    fontWeight: theme.type.price.fontWeight,
    ...(overlay
      ? { fontSize: theme.type.price.fontSize, lineHeight: theme.type.price.lineHeight }
      : null),
  }),
  dim: (overlay: boolean) => ({ opacity: overlay ? 0.88 : 1 }),
  // The seller's name leads line two in the label weight.
  sellerName: { fontWeight: theme.type.label.fontWeight },
}));
