import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/icons/Icon';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { comments as copy } from '@/strings';

import type { FeedComment } from '../api';
import { a11yState } from '@/lib/a11y';

/**
 * One comment or reply (DEC 121), Facebook style: avatar, a grey bubble with
 * the name and the words, then time, Like, Reply and the like count under it.
 * Long press opens the options (copy, delete, report); screen readers get the
 * same as actions.
 */
export function CommentRow({
  comment,
  ago,
  avatarUri,
  reply = false,
  canReply,
  onLike,
  onReply,
  onOptions,
  testID,
}: {
  comment: FeedComment;
  ago: string;
  avatarUri: string | null;
  reply?: boolean;
  canReply: boolean;
  onLike: () => void;
  onReply: () => void;
  onOptions: () => void;
  testID?: string;
}) {
  const deleted = comment.status === 'deleted' || !comment.author;
  const name = comment.author?.display_name ?? '';
  const held = comment.status === 'held';

  if (deleted) {
    return (
      <View style={styles.row(reply)} testID={testID}>
        <View style={styles.avatarGap(reply)} />
        <View style={[styles.bubble, styles.deleted]}>
          <Text variant="meta" tone="ink3">
            {copy.deleted}
          </Text>
        </View>
      </View>
    );
  }

  const actions = [
    { name: 'like', label: copy.like },
    ...(canReply ? [{ name: 'reply', label: copy.reply }] : []),
    { name: 'options', label: copy.options },
  ];

  return (
    <View style={styles.row(reply)} testID={testID}>
      <Avatar name={name} uri={avatarUri} size="S" />
      <View style={styles.flex}>
        <Tappable
          accessibilityRole="text"
          accessibilityLabel={`${name}${comment.is_author_of_post ? `, ${copy.author}` : ''}. ${comment.body ?? ''}. ${ago}`}
          accessibilityActions={actions}
          onAccessibilityAction={(e) => {
            const a = e.nativeEvent.actionName;
            if (a === 'like') onLike();
            else if (a === 'reply') onReply();
            else onOptions();
          }}
          onLongPress={onOptions}
          testID={testID ? `${testID}-bubble` : undefined}
        >
          <View style={[styles.bubble, held ? styles.held : null]}>
            <View style={styles.nameRow}>
              <Text variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
                {name}
              </Text>
              {comment.is_author_of_post ? (
                <Text variant="meta" tone="ink2">
                  {copy.author}
                </Text>
              ) : null}
            </View>
            <Text variant="body">{comment.body}</Text>
          </View>
        </Tappable>
        {held ? (
          <Text variant="meta" tone="amber" style={styles.note}>
            {copy.held}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text variant="meta" tone="ink3">
            {ago}
          </Text>
          {held ? null : (
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={fill(copy.likeComment, { name })}
              {...a11yState({ selected: comment.liked })}
              onPress={onLike}
              testID={testID ? `${testID}-like` : undefined}
            >
              <View style={styles.metaHit}>
                <Text variant="label" tone={comment.liked ? 'ink' : 'ink2'}>
                  {copy.like}
                </Text>
              </View>
            </Tappable>
          )}
          {canReply && !held ? (
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={fill(copy.replyTo, { name })}
              onPress={onReply}
              testID={testID ? `${testID}-reply` : undefined}
            >
              <View style={styles.metaHit}>
                <Text variant="label" tone="ink2">
                  {copy.reply}
                </Text>
              </View>
            </Tappable>
          ) : null}
          {comment.like_count > 0 ? (
            <View style={styles.likes} testID={testID ? `${testID}-likes` : undefined}>
              <Icon name="heart" size={14} tone="ink2" filled />
              <Text variant="meta" tone="ink2">
                {String(comment.like_count)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: (reply: boolean) => ({
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.sm,
    paddingLeft: reply ? theme.size.hit : 0,
    paddingTop: theme.space.sm,
  }),
  avatarGap: (reply: boolean) => ({ width: reply ? 0 : theme.space.xs }),
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: theme.space.xs / 2,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  held: { borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.card },
  deleted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.line },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  note: { paddingHorizontal: theme.space.md, paddingTop: theme.space.xs },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
  },
  metaHit: { minHeight: theme.size.hit, justifyContent: 'center' },
  likes: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs / 2 },
}));
