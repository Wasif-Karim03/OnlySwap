import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon } from '@/components/icons/Icon';
import { Photo } from '@/components/Photo';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { campus as copy, feed as feedCopy } from '@/strings/en';

import { agoLabel, sellerName } from '../feed/logic';
import { mediaUrl, priceLabel } from '../sell/logic';
import {
  budgetLabel,
  canAnswer,
  countdown,
  countdownLabel,
  isUrgent,
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

/** The food countdown as a tag (listing screen, B02). */
export function FoodTimeTag({ expiresAt, now }: { expiresAt: string | null; now: () => Date }) {
  const c = useCountdown(expiresAt, now);
  if (!c) return null;
  return (
    <Tag
      label={countdownLabel(c)}
      tone={c.kind === 'gone' ? 'neutral' : isUrgent(c) ? 'amber' : 'green'}
    />
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

/** One Around campus post: free food, free stuff, Wanted or a new listing (C01). */
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
    <View style={styles.card(gone)} testID={testID}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={fill(copy.foodLabel, { title: item.title, place, time })}
        accessibilityState={{ disabled: gone }}
        disabled={gone}
        onPress={onOpen}
      >
        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.glyph}>
              <Icon name="food" size={18} tone="onAccent" />
            </View>
            <View style={styles.flex}>
              <Text variant="label">{copy.foodTag}</Text>
              <Text variant="meta" tone="ink2" numberOfLines={1}>
                {place}
              </Text>
            </View>
            {c ? (
              <Tag label={time} tone={gone ? 'neutral' : isUrgent(c) ? 'amber' : 'green'} />
            ) : null}
          </View>
          <Text variant="bodyStrong">{item.title}</Text>
          {gone ? (
            <Text variant="meta" tone="ink2">
              {copy.goneBody}
            </Text>
          ) : null}
          {thumb ? (
            <View style={styles.photo}>
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
  return (
    <View style={styles.card(false)} testID={testID}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={fill(copy.wantedLabel, { title: item.title, budget, who })}
        onPress={onOpen}
      >
        <View style={styles.body}>
          <View style={styles.row}>
            <Avatar name={name || '?'} size="S" />
            <Text variant="meta" tone="ink2" style={styles.flex} numberOfLines={1}>
              {who}
            </Text>
            <Tag label={copy.wantedTag} />
          </View>
          <Text variant="bodyStrong">{item.title}</Text>
          <Text variant="label" tone="ink2">
            {budget}
          </Text>
        </View>
      </Tappable>
      {canAnswer(item) ? (
        <View style={styles.actions}>
          <Button
            label={copy.iHaveThis}
            variant="secondary"
            size="S"
            fullWidth={false}
            accessibilityHint={fill(copy.iHaveThisLabel, { title: item.title })}
            onPress={onAnswer}
            testID={testID ? `${testID}-answer` : undefined}
          />
        </View>
      ) : item.is_own ? (
        <View style={styles.actions}>
          <Tag label={copy.yours} />
        </View>
      ) : null}
    </View>
  );
}

function ListingCard({ item, now, mediaBase, onOpen, testID }: CardProps) {
  const price = priceLabel(item.kind, item.price_cents, feedCopy.free);
  const meta = [item.place, agoLabel(new Date(item.bumped_at), now())]
    .filter(Boolean)
    .join(feedCopy.metaSeparator);
  const thumb = thumbOf(item, mediaBase);
  return (
    <View style={styles.card(false)} testID={testID}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={fill(copy.listingLabel, { title: item.title, price, meta })}
        onPress={onOpen}
      >
        <View style={[styles.body, styles.row]}>
          <View style={styles.thumb}>
            <Photo source={thumb?.uri ?? null} blurhash={thumb?.blurhash} rounded="thumb" />
          </View>
          <View style={styles.flex}>
            <View style={styles.row}>
              <Text variant="bodyStrong" style={styles.flex}>
                {price}
              </Text>
              {item.kind === 'free' ? <Tag label={copy.freeTag} tone="green" /> : null}
            </View>
            <Text variant="body" numberOfLines={2}>
              {item.title}
            </Text>
            <Text variant="meta" tone="ink2" numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </View>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: (dim: boolean) => ({
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
    opacity: dim ? 0.6 : 1,
  }),
  body: { padding: theme.space.lg, gap: theme.space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  flex: { flex: 1, gap: theme.space.xs },
  glyph: {
    width: theme.size.avatarS,
    height: theme.size.avatarS,
    borderRadius: theme.radius.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  photo: { marginTop: theme.space.xs },
  thumb: { width: theme.size.avatarL, height: theme.size.avatarL },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.lg,
  },
}));
