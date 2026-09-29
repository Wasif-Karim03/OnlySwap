import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { chat as copy } from '@/strings/en';

import { Icon } from './icons/Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

export type BubbleKind = 'mine' | 'theirs' | 'system';
export type BubbleState = 'pending' | 'sent' | 'failed';

type Props = {
  kind: BubbleKind;
  body: string;
  state?: BubbleState;
  /** Name for screen readers on incoming messages. */
  author?: string;
  scamHint?: string | null;
  onRetry?: () => void;
  testID?: string;
};

/** Chat bubble (DESIGN_SYSTEM §6 MessageBubble): mine / theirs / system, pending / sent / failed, scam hint row. */
export function MessageBubble({
  kind,
  body,
  state = 'sent',
  author,
  scamHint,
  onRetry,
  testID,
}: Props) {
  if (kind === 'system') {
    return (
      <View style={styles.system} testID={testID} accessibilityRole="text">
        <Text variant="meta" tone="ink2" style={styles.center}>
          {body}
        </Text>
      </View>
    );
  }
  const mine = kind === 'mine';
  const label = `${mine ? '' : author ? `${author}: ` : ''}${body}${state === 'pending' ? `. ${copy.sending}` : ''}`;
  const bubble = (
    <View style={styles.bubble(mine, state)} accessible accessibilityLabel={label}>
      <Text variant="body" tone={mine ? 'inverse' : 'ink'}>
        {body}
      </Text>
    </View>
  );
  return (
    <View style={styles.wrap(mine)} testID={testID}>
      {state === 'failed' && onRetry ? (
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={`${body}. ${copy.failed}`}
          onPress={onRetry}
        >
          {bubble}
        </Tappable>
      ) : (
        bubble
      )}
      {state === 'failed' ? (
        <View style={styles.row}>
          <Icon name="alert" size={14} tone="red" />
          <Text variant="meta" tone="red">
            {copy.failed}
          </Text>
        </View>
      ) : null}
      {scamHint && !mine ? (
        <View
          style={styles.hint}
          accessibilityRole="alert"
          testID={testID ? `${testID}-hint` : undefined}
        >
          <Icon name="shield" size={14} tone="amber" />
          <Text variant="meta" tone="amber" style={styles.flex}>
            {scamHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (mine: boolean) => ({
    alignItems: mine ? 'flex-end' : 'flex-start',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.screen,
  }),
  bubble: (mine: boolean, state: BubbleState) => ({
    maxWidth: '80%',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.card,
    backgroundColor: mine ? theme.colors.ink : theme.colors.bg2,
    opacity: state === 'pending' ? 0.6 : 1,
  }),
  system: { paddingHorizontal: theme.space['2xl'], paddingVertical: theme.space.sm },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    maxWidth: '80%',
    padding: theme.space.sm,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.amberBg,
  },
  flex: { flexShrink: 1 },
}));
