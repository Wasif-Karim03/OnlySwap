import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { quad as copy } from '@/strings';

import { agoLabel } from '../../feed/logic';
import type { QuadReply } from '../api';
import { mediaUrl } from '../../sell/logic';
import { aliasSwatch, aliasTag } from '../logic';
import { authorName } from './QuadAuthor';
import { pointsLabel, VoteControl } from './VoteControl';

/** "OP" or "Anon A": the per-thread name (UX-11, D7: letters and colours, no emoji). */
export function aliasName(aliasNo: number): string {
  return aliasNo <= 0 ? copy.op : fill(copy.anon, { letter: aliasTag(aliasNo) });
}

/**
 * Letter badge: OP sits on the accent fill, everyone else on a neutral grey
 * (green, amber and red mean status elsewhere, so they no longer mark people).
 */
export function AliasBadge({ aliasNo }: { aliasNo: number }) {
  const op = aliasSwatch(aliasNo) === 'accent';
  return (
    <View
      style={styles.badge(op)}
      accessible
      accessibilityLabel={aliasNo <= 0 ? copy.opLabel : aliasName(aliasNo)}
    >
      <Text variant="meta" tone={op ? 'onAccent' : 'ink'} overlay style={styles.badgeText}>
        {aliasTag(aliasNo)}
      </Text>
    </View>
  );
}

type Props = {
  reply: QuadReply;
  now: Date;
  onVote: (dir: 1 | -1) => void;
  onOptions: () => void;
  /** For the author's photo (DEC 150). */
  mediaBase?: string;
  testID?: string;
};

/** A reply in a thread (Q6): alias, time, text, votes. Held replies show only to their author. */
export function ReplyRow({ reply, now, onVote, onOptions, mediaBase, testID }: Props) {
  const held = reply.status === 'held';
  // DEC 150: real names; the alias only for servers before migration 0251.
  const named = reply.author !== undefined;
  const name = named ? authorName(reply.author ?? null, false) : aliasName(reply.alias_no);
  return (
    <View style={styles.row} testID={testID}>
      {named ? (
        <Avatar
          name={name}
          uri={
            reply.author?.avatar_path && mediaBase
              ? mediaUrl(mediaBase, reply.author.avatar_path)
              : null
          }
          size="S"
        />
      ) : (
        <AliasBadge aliasNo={reply.alias_no} />
      )}
      <View style={styles.flex}>
        <View style={styles.meta}>
          <Text variant="label">{reply.is_mine ? `${name} (${copy.you})` : name}</Text>
          <Text variant="meta" tone="ink2" style={styles.flex}>
            {agoLabel(new Date(reply.created_at), now)}
          </Text>
          <IconButton
            icon="more"
            accessibilityLabel={copy.replyOptions}
            onPress={onOptions}
            testID={testID ? `${testID}-more` : undefined}
          />
        </View>
        {held ? <Tag label={copy.underReview} tone="amber" /> : null}
        <Text variant="body">{reply.body}</Text>
      </View>
      <VoteControl
        score={reply.score}
        myVote={reply.my_vote}
        onVote={onVote}
        readOnly={reply.is_mine || held}
        readOnlyLabel={
          reply.is_mine
            ? fill(copy.ownReplyScore, { points: pointsLabel(reply.score) })
            : pointsLabel(reply.score)
        }
        testID={testID ? `${testID}-vote` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.space.sm,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  flex: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  badge: (op: boolean) => ({
    width: theme.size.avatarS,
    height: theme.size.avatarS,
    marginTop: theme.space.sm,
    borderRadius: theme.radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: op ? theme.colors.accent : theme.colors.bg3,
  }),
  badgeText: { fontWeight: '700' },
}));
