import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/icons/Icon';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { comments as copy } from '@/strings';

import { commentsText, likesText } from '../logic';
import { a11yState } from '@/lib/a11y';

/**
 * Like and Comment for the compact Feed cards (food, wanted; DEC 121), with
 * the counts on the right. FeedPost has its own full action row.
 */
export function SocialBar({
  liked,
  likeCount,
  commentCount,
  onLike,
  onComments,
  testID,
}: {
  liked: boolean;
  likeCount: number;
  commentCount: number;
  onLike: () => void;
  onComments: () => void;
  testID?: string;
}) {
  const counts = [likesText(likeCount), commentsText(commentCount)].filter(Boolean).join('. ');
  return (
    <View style={styles.row} testID={testID}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={copy.likePost}
        {...a11yState({ selected: liked })}
        onPress={onLike}
        testID={testID ? `${testID}-like` : undefined}
      >
        <View style={styles.action}>
          <Icon
            name="heart"
            size={20}
            tone="green"
            strokeWidth={liked ? 2.4 : 1.8}
            filled={liked}
          />
          <Text variant={liked ? 'bodyStrong' : 'label'} tone={liked ? 'green' : 'ink2'}>
            {copy.like}
          </Text>
        </View>
      </Tappable>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={copy.openComments}
        onPress={onComments}
        testID={testID ? `${testID}-comment` : undefined}
      >
        <View style={styles.action}>
          <Icon name="chat" size={20} tone="green" />
          <Text variant="label" tone="ink2">
            {copy.comment}
          </Text>
        </View>
      </Tappable>
      <Text variant="meta" tone="ink2" numberOfLines={1} style={styles.counts}>
        {counts}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  action: {
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.sm,
  },
  counts: { flex: 1, textAlign: 'right', paddingRight: theme.space.sm },
}));
