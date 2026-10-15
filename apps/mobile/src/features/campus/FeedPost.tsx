import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/icons/Icon';
import { Photo } from '@/components/Photo';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { campus as copy, feed as feedCopy } from '@/strings';

import { agoLabel, sellerName } from '../feed/logic';
import { mediaUrl, priceLabel } from '../sell/logic';
import { eventLabel, linkHost, type CampusItem } from './logic';

type Props = {
  item: CampusItem;
  now: () => Date;
  mediaBase: string;
  onOpen: () => void;
  onSave: () => void;
  /** Make offer (sale) or Ask for it (free). */
  onOffer: () => void;
  onShare: () => void;
  onOpenLink: (url: string) => void;
  testID?: string;
};

/** Photos shown on a post: one big, then up to three small with "+n" on the last. */
const SMALL_MAX = 3;

/**
 * One Feed post (DEC 98), laid out like a social feed: who posted it and
 * when, the words, the photos, then Save, Make offer or Open link, and Share.
 * News puts the headline above the photos; a listing keeps price and title on
 * white below them (DEC 90).
 */
export function FeedPost({
  item,
  now,
  mediaBase,
  onOpen,
  onSave,
  onOffer,
  onShare,
  onOpenLink,
  testID,
}: Props) {
  const news = item.kind === 'news';
  const name = sellerName(item);
  const ago = agoLabel(new Date(item.created_at), now());
  const meta = item.place ? fill(copy.postMeta, { ago, place: item.place }) : ago;
  const avatar = item.seller.avatar_path ? mediaUrl(mediaBase, item.seller.avatar_path) : null;
  const price = news ? '' : priceLabel(item.kind, item.price_cents, feedCopy.free);
  const event = news && item.event_at ? eventLabel(item.event_at, now()) : null;
  const link = news ? (item.link_url ?? null) : null;
  const label = news
    ? fill(copy.newsLabel, {
        name,
        title: item.title,
        meta: [event, meta].filter(Boolean).join('. '),
      })
    : fill(copy.postLabel, { name, title: item.title, price, meta });

  const photos = item.photos.map((p) => ({
    uri: mediaUrl(mediaBase, p.path),
    thumb: mediaUrl(mediaBase, p.thumb_path || p.path),
    blurhash: p.blurhash,
  }));
  const [first, ...rest] = photos;
  const small = rest.slice(0, SMALL_MAX);
  const hidden = rest.length - small.length;

  return (
    <View style={styles.card} testID={testID}>
      <Tappable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen}>
        <View>
          <View style={styles.head}>
            <Avatar name={name} uri={avatar} size="M" />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="meta" tone="ink3" numberOfLines={1}>
                {meta}
              </Text>
            </View>
            {news ? (
              <Text variant="label" tone="ink2">
                {copy.newsTag}
              </Text>
            ) : null}
          </View>

          {news ? (
            <View style={styles.text}>
              <Text variant="heading">{item.title}</Text>
              {event ? (
                <View style={styles.event} testID={testID ? `${testID}-event` : undefined}>
                  <Icon name="cal" size={18} tone="sky" />
                  <Text variant="label" tone="sky" style={styles.flex}>
                    {event}
                  </Text>
                </View>
              ) : null}
              {item.description ? (
                <Text variant="body" numberOfLines={4}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          ) : null}

          {first ? (
            <View style={styles.photos}>
              <Photo
                source={first.uri}
                blurhash={first.blurhash}
                aspectRatio={rest.length ? 4 / 3 : 1}
              />
              {small.length > 0 ? (
                <View style={styles.smallRow}>
                  {small.map((p, i) => (
                    <View key={`${p.thumb}-${i}`} style={styles.flex}>
                      <Photo source={p.thumb} blurhash={p.blurhash} aspectRatio={1} />
                      {hidden > 0 && i === small.length - 1 ? (
                        <View style={styles.more}>
                          <Text variant="heading" tone="onPhoto" overlay>
                            {fill(copy.morePhotos, { n: hidden })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {news ? null : (
            <View style={styles.text}>
              <Text variant="price">{price}</Text>
              <Text variant="bodyStrong" numberOfLines={2}>
                {item.title}
              </Text>
              {item.description ? (
                <Text variant="body" tone="ink2" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </Tappable>

      {link ? (
        <Tappable
          accessibilityRole="link"
          accessibilityLabel={`${copy.openLink}: ${linkHost(link)}`}
          onPress={() => onOpenLink(link)}
          testID={testID ? `${testID}-link` : undefined}
        >
          <View style={styles.linkRow}>
            <Text variant="label" tone="ink2" numberOfLines={1} style={styles.flex}>
              {linkHost(link)}
            </Text>
            <Icon name="arrow" size={18} tone="ink2" />
          </View>
        </Tappable>
      ) : null}

      <View style={styles.actions}>
        {item.is_own ? (
          <View style={styles.own}>
            <Text variant="label" tone="ink3">
              {copy.yours}
            </Text>
          </View>
        ) : (
          <Action
            icon="bookmark"
            label={item.saved ? copy.saved : copy.save}
            selected={item.saved}
            onPress={onSave}
            testID={testID ? `${testID}-save` : undefined}
          />
        )}
        {!news && !item.is_own && item.status === 'active' ? (
          <Action
            icon="tag"
            label={item.kind === 'free' ? copy.askForIt : copy.makeOffer}
            onPress={onOffer}
            testID={testID ? `${testID}-offer` : undefined}
          />
        ) : null}
        {link ? (
          <Action
            icon="arrow"
            label={copy.openLink}
            onPress={() => onOpenLink(link)}
            testID={testID ? `${testID}-open-link` : undefined}
          />
        ) : null}
        <Action
          icon="share"
          label={copy.share}
          onPress={onShare}
          testID={testID ? `${testID}-share` : undefined}
        />
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  selected = false,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.flex}
      testID={testID}
    >
      <View style={styles.action}>
        <Icon
          name={icon}
          size={20}
          tone={selected ? 'ink' : 'ink2'}
          strokeWidth={selected ? 2.4 : 1.8}
        />
        <Text
          variant={selected ? 'bodyStrong' : 'label'}
          tone={selected ? 'ink' : 'ink2'}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
  },
  flex: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.sm,
  },
  text: {
    gap: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
  },
  event: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  photos: { gap: theme.space.xs },
  smallRow: { flexDirection: 'row', gap: theme.space.xs },
  more: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.overlay,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    marginHorizontal: theme.space.lg,
    marginTop: theme.space.xs,
    minHeight: theme.size.hit,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  actions: {
    flexDirection: 'row',
    marginTop: theme.space.sm,
    marginHorizontal: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  action: {
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.xs,
  },
  own: { flex: 1, minHeight: theme.size.hit, alignItems: 'center', justifyContent: 'center' },
}));
