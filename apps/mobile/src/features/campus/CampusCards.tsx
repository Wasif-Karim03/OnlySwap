import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Photo } from '@/components/Photo';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { campus as copy, feed as feedCopy } from '@/strings';

import { agoLabel, sellerName } from '../feed/logic';
import { mediaUrl, priceLabel } from '../sell/logic';
import {
  budgetLabel,
  canAnswer,
  countdown,
  countdownLabel,
  tickMs,
  type CampusItem,
  type Countdown,
} from './logic';

/**
 * Live countdown for a free food post. Re-renders every 15 s (every second in
 * the last minute) and stops once the post is gone.
 */
export function useCountdown(expiresAt: string | null, now: () => Date): Countdown | null {
  const [, setTick] = useState(0);
  const c = countdown(expiresAt, now());
  const live = c !== null && c.kind !== 'gone';
  const every = tickMs(c);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), every);
    return () => clearInterval(t);
  }, [live, every]);
  return c;
}

/**
 * The food countdown as plain words on the listing screen (B02): peach while
 * it runs, grey once it's gone (DEC 90: status as words, color only when it
 * matters).
 */
export function FoodTimeTag({ expiresAt, now }: { expiresAt: string | null; now: () => Date }) {
  const c = useCountdown(expiresAt, now);
  if (!c) return null;
  return (
    <Text variant="label" tone={c.kind === 'gone' ? 'ink3' : 'peach'}>
      {countdownLabel(c)}
    </Text>
  );
}

type CardProps = {
  item: CampusItem;
  now: () => Date;
  mediaBase: string;
  onOpen: () => void;
  /** "I have this" on someone else's Wanted post. */
  onAnswer: () => void;
  testID?: string;
};

/**
 * One Around campus post (C01, DEC 90 mock screen 5): free food on a peach
 * card, a Wanted post written like a person, or a listing tile for the
 * two-column grid.
 */
export function CampusCard(props: CardProps) {
  if (props.item.kind === 'food') return <FoodCard {...props} />;
  if (props.item.kind === 'wanted') return <WantedCard {...props} />;
  return <ListingCard {...props} />;
}

function thumbOf(item: CampusItem, base: string) {
  const p = item.photos[0];
  return p ? { uri: mediaUrl(base, p.thumb_path || p.path), blurhash: p.blurhash } : null;
}

function FoodCard({ item, now, mediaBase, onOpen, testID }: CardProps) {
  const c = useCountdown(item.expires_at, now);
  const gone = c?.kind === 'gone';
  const time = c ? countdownLabel(c) : '';
  const place = item.place ?? copy.noPlace;
  const thumb = thumbOf(item, mediaBase);
  return (
    <View style={styles.food(gone)} testID={testID}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={fill(copy.foodLabel, { title: item.title, place, time })}
        accessibilityState={{ disabled: gone }}
        disabled={gone}
        onPress={onOpen}
      >
        <View style={styles.body}>
          <View style={styles.row}>
            <Text variant="label" tone={gone ? 'ink3' : 'peach'} style={styles.flex}>
              {copy.foodTag}
            </Text>
            {c ? (
              <Text variant="label" tone={gone ? 'ink3' : 'peach'}>
                {time}
              </Text>
            ) : null}
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong">{item.title}</Text>
            <Text variant="meta" numberOfLines={1}>
              {place}
            </Text>
            {gone ? (
              <Text variant="meta" tone="ink2">
                {copy.goneBody}
              </Text>
            ) : null}
          </View>
          {thumb ? (
            <View style={styles.foodPhoto}>
              <Photo
                source={thumb.uri}
                blurhash={thumb.blurhash}
                aspectRatio={16 / 9}
                rounded="thumb"
              />
            </View>
          ) : null}
        </View>
      </Tappable>
    </View>
  );
}

function WantedCard({ item, now, onOpen, onAnswer, testID }: CardProps) {
  const name = sellerName(item);
  const who = fill(copy.byLine, { name, ago: agoLabel(new Date(item.created_at), now()) });
  const budget = budgetLabel(item.wanted_max_cents);
  const answer = canAnswer(item);
  return (
    <View style={[styles.card, styles.wanted]} testID={testID}>
      <View style={styles.flex}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={fill(copy.wantedLabel, { title: item.title, budget, who })}
          onPress={onOpen}
        >
          <View style={styles.text}>
            <Text variant="meta" tone="ink2" numberOfLines={1}>
              {name ? fill(copy.lookingFor, { name }) : copy.someoneLookingFor}
            </Text>
            <Text variant="bodyStrong">{item.title}</Text>
            <Text variant="meta" tone="ink2">
              {budget}
            </Text>
          </View>
        </Tappable>
      </View>
      {answer ? (
        <Button
          label={copy.iHaveThis}
          variant="secondary"
          size="S"
          fullWidth={false}
          accessibilityHint={fill(copy.iHaveThisLabel, { title: item.title })}
          onPress={onAnswer}
          testID={testID ? `${testID}-answer` : undefined}
        />
      ) : item.is_own ? (
        <Text variant="label" tone="ink3">
          {copy.yours}
        </Text>
      ) : null}
    </View>
  );
}

function ListingCard({ item, now, mediaBase, onOpen, testID }: CardProps) {
  const price = priceLabel(item.kind, item.price_cents, feedCopy.free);
  const where = item.place ?? agoLabel(new Date(item.bumped_at), now());
  const meta = [item.place, agoLabel(new Date(item.bumped_at), now())]
    .filter(Boolean)
    .join(feedCopy.metaSeparator);
  const thumb = thumbOf(item, mediaBase);
  return (
    <View style={styles.card} testID={testID}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={fill(copy.listingLabel, { title: item.title, price, meta })}
        onPress={onOpen}
      >
        <View>
          <Photo source={thumb?.uri ?? null} blurhash={thumb?.blurhash} aspectRatio={4 / 3} />
          <View style={styles.tileText}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.price}>
              {price}
            </Text>
            <Text variant="label" numberOfLines={1}>
              {item.title}
            </Text>
            <Text variant="meta" tone="ink3" numberOfLines={1}>
              {where}
            </Text>
          </View>
        </View>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
  },
  food: (dim: boolean) => ({
    borderRadius: theme.radius.card,
    backgroundColor: dim ? theme.colors.card : theme.colors.peachBg,
    opacity: dim ? 0.6 : 1,
  }),
  wanted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md + theme.space.xs,
  },
  body: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md + theme.space.xs,
    gap: theme.space.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  flex: { flex: 1 },
  text: { gap: theme.space.xs / 2 },
  foodPhoto: { marginTop: theme.space.sm },
  tileText: {
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.md,
  },
  price: { fontWeight: theme.type.price.fontWeight },
}));
