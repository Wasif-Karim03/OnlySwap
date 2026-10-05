import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/icons/Icon';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { quad as copy } from '@/strings';

import type { VoteValue } from '../api';

export function pointsLabel(score: number): string {
  return score === 1 ? copy.point1 : fill(copy.points, { n: score });
}

type Props = {
  score: number;
  myVote: VoteValue;
  onVote: (dir: 1 | -1) => void;
  /** Your own post or reply, or one waiting for review: the score shows, the arrows are dimmed. */
  readOnly?: boolean;
  /** Spoken in place of "Upvote" when read only ("Your post, 12 points"). */
  readOnlyLabel?: string;
  testID?: string;
};

/**
 * Votes on the right, the same place every time (board Q2). Up fills with the
 * accent, down with a neutral fill; tapping the same arrow again takes the
 * vote back. No haptics (DESIGN_SYSTEM §5 budget).
 */
export function VoteControl({ score, myVote, onVote, readOnly, readOnlyLabel, testID }: Props) {
  const points = pointsLabel(score);
  if (readOnly) {
    return (
      <View
        style={styles.col}
        accessible
        accessibilityLabel={readOnlyLabel ?? points}
        testID={testID}
      >
        <Icon name="chup" tone="ink3" />
        <Text variant="label" tone="ink2" style={styles.score}>
          {String(score)}
        </Text>
        <Icon name="chdn" tone="ink3" />
      </View>
    );
  }
  return (
    <View style={styles.col} testID={testID}>
      <Tappable
        guard={false}
        accessibilityRole="button"
        accessibilityLabel={fill(copy.voteLabel, { action: copy.upvote, points })}
        accessibilityState={{ selected: myVote === 1 }}
        onPress={() => onVote(1)}
        testID={testID ? `${testID}-up` : undefined}
      >
        <View style={styles.arrow(myVote === 1 ? 'up' : null)}>
          <Icon
            name="chup"
            tone={myVote === 1 ? 'onAccent' : 'ink2'}
            strokeWidth={myVote === 1 ? 2.4 : 1.8}
          />
        </View>
      </Tappable>
      <Text
        variant="label"
        tone={myVote === 0 ? 'ink2' : 'ink'}
        style={styles.score}
        testID={testID ? `${testID}-score` : undefined}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {String(score)}
      </Text>
      <Tappable
        guard={false}
        accessibilityRole="button"
        accessibilityLabel={fill(copy.voteLabel, { action: copy.downvote, points })}
        accessibilityState={{ selected: myVote === -1 }}
        onPress={() => onVote(-1)}
        testID={testID ? `${testID}-down` : undefined}
      >
        <View style={styles.arrow(myVote === -1 ? 'down' : null)}>
          <Icon
            name="chdn"
            tone={myVote === -1 ? 'ink' : 'ink2'}
            strokeWidth={myVote === -1 ? 2.4 : 1.8}
          />
        </View>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  col: { alignItems: 'center', minWidth: theme.size.hit },
  arrow: (on: 'up' | 'down' | null) => ({
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      on === 'up' ? theme.colors.accent : on === 'down' ? theme.colors.bg3 : 'transparent',
  }),
  score: { fontVariant: ['tabular-nums'], textAlign: 'center' },
}));
