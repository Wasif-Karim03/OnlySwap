import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { quad as copy } from '@/strings';

import { mediaUrl } from '../../sell/logic';
import type { QuadAuthor } from '../api';

/** The name a post or reply shows (DEC 150): "Maya R.", "Maya R. (You)", or Deleted user. */
export function authorName(author: QuadAuthor | null, mine: boolean): string {
  const name = author?.display_name || copy.deletedAuthor;
  return mine ? `${name} (${copy.you})` : name;
}

/**
 * Who wrote it (DEC 150: the Quad is no longer anonymous): a small avatar and
 * the first name with last initial, like the rest of the app.
 */
export function QuadAuthorLine({
  author,
  mine,
  mediaBase,
  meta,
  testID,
}: {
  author: QuadAuthor | null;
  mine: boolean;
  mediaBase?: string;
  /** Shown after the name in grey, such as the time. */
  meta?: string;
  testID?: string;
}) {
  const name = author?.display_name || copy.deletedAuthor;
  const uri = author?.avatar_path && mediaBase ? mediaUrl(mediaBase, author.avatar_path) : null;
  return (
    <View style={styles.row} testID={testID}>
      <Avatar name={name} uri={uri} size="S" />
      <Text variant="label" numberOfLines={1} style={styles.name}>
        {authorName(author, mine)}
      </Text>
      {meta ? (
        <Text variant="meta" tone="ink2" numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  name: { flexShrink: 1 },
}));
