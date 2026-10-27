import { Platform, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/icons/Icon';
import { Material } from '@/components/Material';
import { Photo } from '@/components/Photo';
import { Tappable } from '@/components/Tappable';
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
  /** Round 2 card (DEC 144): optional so other screens building cards stay valid. */
  free?: boolean;
  /** "12 swaps"; nothing for a new seller. */
  swaps?: string | null;
  /** "Moving out Fri" (DEC 133), shown as a yellow tag. */
  movingOut?: string | null;
  /** Whether the viewer saved it; the bookmark on the card toggles this. */
  saved?: boolean;
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
  /** Overlay only: which photo shows (edge taps flip through them, DEC 144). */
  photoIndex?: number;
  /** Overlay only: the bookmark in the corner. Saving keeps the card (DEC 144). */
  onToggleSave?: () => void;
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
export function SwipeCard({
  card,
  compact = false,
  overlay = false,
  photoIndex = 0,
  onToggleSave,
  testID,
}: Props) {
  if (overlay) {
    return (
      <OverlayFace
        card={card}
        photoIndex={photoIndex}
        onToggleSave={onToggleSave}
        testID={testID}
      />
    );
  }
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

/**
 * The bookmark in the card's top corner (DEC 144). The live deck renders it
 * beside the card's touch area, not inside it, so it is its own control for
 * VoiceOver and never nests one button in another on the web.
 */
export function SaveButton({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={saved ? copy.unsaveAction : copy.save}
      accessibilityState={{ selected: saved }}
      onPress={onPress}
      style={styles.saveSlot}
      hitSlop={8}
      testID="deck-save"
    >
      {saved ? (
        // Saved reads at a glance on any photo: a solid light circle with a
        // black bookmark (owner feedback 2026-10-24: the filled white icon on
        // glass was too faint).
        <View style={[styles.saveCircle, styles.saveCircleOn]} testID="deck-save-on">
          <Icon name="bookmark" size={20} tone="onAccent" filled />
        </View>
      ) : (
        <Material variant="clear" solid style={styles.saveCircle}>
          <Icon name="bookmark" size={20} tone="onPhoto" />
        </Material>
      )}
    </Tappable>
  );
}

/** "Jordan K. · Junior · 12 swaps": who is selling, nothing about verification (everyone is). */
export function sellerLine(card: DeckCard): string {
  return [card.sellerName, card.sellerYear, card.swaps].filter(Boolean).join(copy.metaSeparator);
}

/**
 * Round 2 Discover card ("Depth", design/round2/proposed/discover-final.html):
 * the photo fills the card with a soft scrim at the foot. Price leads in the
 * price style, the item follows, then one quiet seller line. A yellow tag
 * shows while the seller is moving out, and the bookmark in the corner saves
 * without moving the card. No action row: swiping is the action.
 */
function OverlayFace({
  card,
  photoIndex,
  onToggleSave,
  testID,
}: {
  card: DeckCard;
  photoIndex: number;
  onToggleSave?: () => void;
  testID?: string;
}) {
  const index = Math.min(Math.max(photoIndex, 0), Math.max(card.photos.length - 1, 0));
  const photo = card.photos[index];
  const seller = sellerLine(card);
  return (
    <View style={styles.card(true)} testID={testID}>
      <View style={styles.photo}>
        <Photo source={photo?.uri ?? null} blurhash={photo?.blurhash ?? null} fill backdrop />
        {card.photos.length > 1 ? (
          <View style={styles.segments} importantForAccessibility="no-hide-descendants">
            {card.photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.segment(i === index)} />
            ))}
          </View>
        ) : null}
        <View style={styles.scrim} pointerEvents="none" />
      </View>
      {onToggleSave ? <SaveButton saved={!!card.saved} onPress={onToggleSave} /> : null}
      <View style={styles.overlayBody} pointerEvents="none">
        {card.movingOut ? (
          <View style={styles.tag} testID="card-moving-out">
            <Text variant="label" style={styles.tagText}>
              {card.movingOut}
            </Text>
          </View>
        ) : null}
        {/* overlay: text on the photo stops growing at 1.4x (CLAUDE.md rule 10). */}
        <Text overlay numberOfLines={2} style={styles.headline}>
          <Text overlay variant="price" tone="onPhoto">
            {card.price}
          </Text>
          <Text overlay variant="heading" tone="onPhoto" style={styles.headlineTitle}>
            {'  '}
            {card.title}
          </Text>
        </Text>
        {/* Condition and age first: an offer is a swipe away (UX audit 2026-10-25). */}
        {card.meta ? (
          <Text overlay variant="meta" tone="onPhoto" numberOfLines={1} testID="card-meta">
            {card.meta}
          </Text>
        ) : null}
        {seller ? (
          <Text overlay variant="meta" tone="onPhoto" numberOfLines={1} style={styles.dim(true)}>
            {seller}
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
  saveSlot: { position: 'absolute', top: theme.space.lg + theme.space.sm, right: theme.space.md },
  saveCircle: {
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveCircleOn: { backgroundColor: theme.colors.onPhoto },
  overlayBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.space.xl,
    paddingBottom: theme.space.xl,
    gap: theme.space.xs,
  },
  headline: { color: theme.colors.onPhoto },
  headlineTitle: { fontWeight: theme.type.bodyStrong.fontWeight },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.tag,
    borderRadius: theme.space.xs,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 2,
    marginBottom: theme.space.xs,
  },
  // The tag is light in both themes, so its words use the dark on-accent ink.
  tagText: { color: theme.colors.onAccent, textTransform: 'uppercase', letterSpacing: 0.4 },
  // The seller's name leads line two in the label weight.
  sellerName: { fontWeight: theme.type.label.fontWeight },
}));
