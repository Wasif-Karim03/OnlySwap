import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { IconButton } from '@/components/IconButton';
import { Icon } from '@/components/icons/Icon';
import { Photo } from '@/components/Photo';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { quad as copy } from '@/strings';

import { agoLabel } from '../../feed/logic';
import { mediaUrl } from '../../sell/logic';
import type { QuadPoll, QuadPost } from '../api';
import { pollPercents, thumbPath, timeLeft } from '../logic';
import { pointsLabel, VoteControl } from './VoteControl';

export function repliesLabel(n: number): string {
  return n === 1 ? copy.reply1 : fill(copy.replies, { n });
}

export function endsLabel(expiresAt: string, now: Date): string {
  const { h, m } = timeLeft(expiresAt, now);
  return h > 0 ? fill(copy.endsIn, { h, m }) : fill(copy.endsInMin, { m });
}

/** Poll inline (board Q2): options to tap, then bars with shares once you voted. */
export function PollView({
  poll,
  canVote,
  onVote,
  testID,
}: {
  poll: QuadPoll;
  canVote: boolean;
  onVote: (optionId: string) => void;
  testID?: string;
}) {
  const voted = poll.my_option !== null;
  const pcts = pollPercents(poll);
  return (
    <View style={styles.poll} testID={testID}>
      {poll.options.map((o, i) => {
        const mine = poll.my_option === o.id;
        const pct = pcts[i] ?? 0;
        if (!voted && canVote) {
          return (
            <Tappable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityHint={copy.pollVoteHint}
              onPress={() => onVote(o.id)}
              testID={testID ? `${testID}-option-${i}` : undefined}
            >
              <View style={styles.option}>
                <Text variant="bodyStrong">{o.label}</Text>
              </View>
            </Tappable>
          );
        }
        return (
          <View
            key={o.id}
            style={styles.result}
            accessible
            accessibilityLabel={
              fill(copy.pollOption, { label: o.label, pct }) + (mine ? `. ${copy.pollMine}` : '')
            }
          >
            <View style={[styles.bar(mine), { width: `${pct}%` }]} />
            <View style={styles.resultRow}>
              <Text variant={mine ? 'bodyStrong' : 'body'} style={styles.flex} numberOfLines={2}>
                {o.label}
              </Text>
              {mine ? <Icon name="check" size={16} /> : null}
              <Text variant="label" tone="ink2">{`${pct}%`}</Text>
            </View>
          </View>
        );
      })}
      <Text variant="meta" tone="ink2">
        {poll.total === 1 ? copy.pollVote1 : fill(copy.pollVotes, { n: poll.total })}
      </Text>
    </View>
  );
}

type Props = {
  post: QuadPost;
  now: Date;
  mediaBase: string;
  onVote: (dir: 1 | -1) => void;
  onVotePoll: (optionId: string) => void;
  onOptions: () => void;
  /** Feed cards open the thread; the thread's own card doesn't. */
  onOpen?: () => void;
  /** Thread view: the full photo instead of the thumbnail. */
  full?: boolean;
  testID?: string;
};

/**
 * QuadPostCard (Q2, Q6): no names or avatars, only time, place for
 * check-ins, the text, a poll or photo, replies and the vote column.
 * Long-press (or the more button) opens Post options.
 */
export function QuadPostCard({
  post,
  now,
  mediaBase,
  onVote,
  onVotePoll,
  onOptions,
  onOpen,
  full = false,
  testID,
}: Props) {
  const live = post.status === 'live';
  const time = agoLabel(new Date(post.created_at), now);
  const photo = post.photo_path
    ? mediaUrl(mediaBase, full ? post.photo_path : thumbPath(post.photo_path))
    : null;
  const replies = repliesLabel(post.reply_count);
  const label = [
    post.status === 'held' ? copy.underReview : null,
    post.place ? fill(copy.checkinAt, { place: post.place }) : null,
    post.body,
    time,
    replies,
  ]
    .filter(Boolean)
    .join('. ');

  const content = (
    <View style={styles.content}>
      <View style={styles.meta}>
        {post.status === 'held' ? <Tag label={copy.underReview} tone="amber" /> : null}
        <Text variant="meta" tone="ink2">
          {time}
        </Text>
      </View>
      {post.place ? (
        <View style={styles.place}>
          <Icon name="pin" size={16} tone="ink2" />
          <Text variant="label" style={styles.flex}>
            {fill(copy.checkinAt, { place: post.place })}
          </Text>
          {post.expires_at ? (
            <Text variant="meta" tone="ink2">
              {endsLabel(post.expires_at, now)}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text variant="body" numberOfLines={full ? undefined : 8}>
        {post.body}
      </Text>
      {photo ? (
        <Photo
          source={photo}
          aspectRatio={full ? 4 / 5 : 4 / 3}
          rounded="thumb"
          accessibilityLabel={copy.photoLabel}
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.flex}>
        {onOpen ? (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onOpen}
            onLongPress={onOptions}
            accessibilityActions={[{ name: 'longpress', label: copy.options }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') onOptions();
            }}
            testID={testID ? `${testID}-open` : undefined}
          >
            {content}
          </Tappable>
        ) : (
          content
        )}
        {post.poll ? (
          <PollView
            poll={post.poll}
            canVote={live}
            onVote={onVotePoll}
            testID={testID ? `${testID}-poll` : undefined}
          />
        ) : null}
        <View style={styles.footer}>
          <Icon name="chat" size={16} tone="ink2" />
          <Text variant="meta" tone="ink2" style={styles.flex}>
            {replies}
          </Text>
          <IconButton
            icon="more"
            accessibilityLabel={copy.options}
            onPress={onOptions}
            testID={testID ? `${testID}-more` : undefined}
          />
        </View>
      </View>
      <VoteControl
        score={post.score}
        myVote={post.my_vote}
        onVote={onVote}
        readOnly={post.is_mine || !live}
        readOnlyLabel={
          post.is_mine
            ? fill(copy.ownScore, { points: pointsLabel(post.score) })
            : pointsLabel(post.score)
        }
        testID={testID ? `${testID}-vote` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    gap: theme.space.sm,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  flex: { flex: 1 },
  content: { gap: theme.space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  place: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  poll: { gap: theme.space.sm, marginTop: theme.space.sm },
  option: {
    minHeight: theme.size.hit,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.line2,
  },
  result: {
    minHeight: theme.size.hit,
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
    overflow: 'hidden',
  },
  bar: (mine: boolean) => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: mine ? theme.colors.accent : theme.colors.bg3,
  }),
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
  },
}));
