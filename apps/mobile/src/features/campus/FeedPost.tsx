import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Icon, type IconName } from '@/components/icons/Icon';
import { Photo } from '@/components/Photo';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { campus as copy, comments as commentCopy, feed as feedCopy } from '@/strings';

import { commentsText, likesText } from '../comments/logic';
import { agoLabel, sellerName } from '../feed/logic';
import { mediaUrl, priceLabel } from '../sell/logic';
import { eventLabel, linkHost, type CampusItem } from './logic';
import { a11yState } from '@/lib/a11y';

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
  onLike: () => void;
  onComments: () => void;
  /** Your own post: a Delete button where Save sits on other people's posts. */
  onDelete?: () => void;
  testID?: string;
};

/** Photos shown on a post: one big, then up to three small with "+n" on the last. */
const SMALL_MAX = 3;

/**
 * One Feed post (DEC 98), laid out like a social feed: who posted it and
 * when (Save at the top right), the words, the photos, a plain link line on
 * news, then one quiet line: like and comment with their counts, Share, and
 * Make offer or Ask for it on the right (DEC 121).
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
  onLike,
  onComments,
  onDelete,
  testID,
}: Props) {
  const likes = item.like_count ?? 0;
  const commentCount = item.comment_count ?? 0;
  const liked = item.liked === true;
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
          <View style={[styles.head, (!item.is_own || onDelete) && styles.headRoom]}>
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
            {/* In the row, not over it, so it never covers News at any text size. */}
            {item.is_own ? (
              // Round 2: a quiet tag where Save sits on other people's posts.
              <View style={styles.ownTag}>
                <Text variant="meta" tone="ink2" style={styles.ownTagText}>
                  {copy.yours}
                </Text>
              </View>
            ) : null}
          </View>

          {news ? (
            <View style={styles.text}>
              <Text variant="heading">{item.title}</Text>
              {event ? (
                <View style={styles.event} testID={testID ? `${testID}-event` : undefined}>
                  <Icon name="cal" size={18} tone="ink2" />
                  <Text variant="label" style={styles.flex}>
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
          testID={testID ? `${testID}-open-link` : undefined}
        >
          <View style={styles.linkRow}>
            <Text variant="label" tone="ink2" numberOfLines={1} style={styles.linkText}>
              {linkHost(link)}
            </Text>
            <Icon name="arrow" size={18} tone="ink2" />
          </View>
        </Tappable>
      ) : null}

      {/* One quiet line: the counts sit next to their icons, so no counts line above. */}
      <View style={styles.actions}>
        <Action
          icon="heart"
          count={likesText(likes)}
          a11yLabel={[commentCopy.likePost, likesText(likes)].filter(Boolean).join('. ')}
          selected={liked}
          filled={liked}
          green
          onPress={onLike}
          testID={testID ? `${testID}-like` : undefined}
        />
        <Action
          icon="chat"
          count={commentsText(commentCount)}
          a11yLabel={[commentCopy.openComments, commentsText(commentCount)]
            .filter(Boolean)
            .join('. ')}
          green
          onPress={onComments}
          testID={testID ? `${testID}-comment` : undefined}
        />
        <Action
          icon="share"
          a11yLabel={copy.share}
          onPress={onShare}
          testID={testID ? `${testID}-share` : undefined}
        />
        <View style={styles.flex} />
        {!news && !item.is_own && item.status === 'active' ? (
          <Button
            label={item.kind === 'free' ? copy.askForIt : copy.makeOffer}
            variant="text"
            size="S"
            fullWidth={false}
            onPress={onOffer}
            testID={testID ? `${testID}-offer` : undefined}
          />
        ) : null}
      </View>

      {/* Save sits over the header's right edge, outside the open-post button. */}
      {item.is_own ? (
        onDelete ? (
          <View style={styles.corner}>
            <IconButton
              icon="trash"
              accessibilityLabel={copy.deleteOwnPost}
              onPress={onDelete}
              testID={testID ? `${testID}-delete` : undefined}
            />
          </View>
        ) : null
      ) : (
        <View style={styles.corner}>
          <IconButton
            icon="bookmark"
            accessibilityLabel={item.saved ? copy.saved : copy.save}
            selected={item.saved}
            onPress={onSave}
            testID={testID ? `${testID}-save` : undefined}
          />
        </View>
      )}
    </View>
  );
}

function Action({
  icon,
  count = '',
  a11yLabel,
  selected = false,
  filled = false,
  green = false,
  onPress,
  testID,
}: {
  icon: IconName;
  /** "3 likes", "2 comments": next to the icon, empty at zero. */
  count?: string;
  a11yLabel: string;
  selected?: boolean;
  filled?: boolean;
  /** Like and Comment take the app's green (owner review 2026-10-24). */
  green?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      {...a11yState({ selected })}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.action}>
        <Icon
          name={icon}
          size={20}
          tone={green ? 'green' : selected ? 'ink' : 'ink2'}
          strokeWidth={selected ? 2.4 : 1.8}
          filled={filled}
        />
        {count ? (
          <Text variant="label" tone={selected ? 'ink' : 'ink2'} numberOfLines={1}>
            {count}
          </Text>
        ) : null}
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Flat rows on the page; the Feed draws the lines between them.
  card: { overflow: 'hidden' },
  flex: { flex: 1 },
  ownTag: {
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs / 2,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.bg2,
  },
  ownTagText: { fontWeight: theme.type.label.fontWeight },
  // Room on the right of the header for Save.
  headRoom: { paddingRight: theme.size.hit + theme.space.sm },
  corner: {
    position: 'absolute',
    top: theme.space.xs,
    right: theme.space.xs,
    minHeight: theme.size.hit,
    justifyContent: 'center',
  },
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
  // The news link is one plain line: host and an arrow, no fill.
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    minHeight: theme.size.hit,
    paddingHorizontal: theme.space.lg,
  },
  linkText: { flexShrink: 1 },
  // Wraps at large text sizes so "Make offer" is never cut.
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
  action: {
    minWidth: theme.size.hit,
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.sm,
  },
}));
