import { size } from '@onlyswap/tokens';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from './Button';
import { Icon, type IconName } from './icons/Icon';
import { Tag } from './Tag';
import { Text } from './Text';

type Action = { label: string; onPress: () => void };

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  body?: string;
  /** Accent tile for the "start something" moments (board X36, X18); neutral otherwise. */
  tile?: 'neutral' | 'accent';
  /** Quick ideas under the body, e.g. what sells fast (board X36). Display only. */
  suggestions?: string[];
  action?: Action;
  secondaryAction?: Action;
  testID?: string;
};

/** The glyph tile used by empty, error and permission states (DESIGN_SYSTEM §7). */
export function GlyphTile({
  icon,
  tile = 'neutral',
}: {
  icon: IconName;
  tile?: 'neutral' | 'accent';
}) {
  return (
    <View style={styles.tile(tile)} accessible={false}>
      <Icon name={icon} size={size.glyphIcon} tone={tile === 'accent' ? 'onAccent' : 'ink2'} />
    </View>
  );
}

/**
 * Empty state (P2-CMP-08, board X5, X6, X35 to X37): glyph tile, title, one
 * line that explains how the screen fills up, and always a next step.
 */
export function EmptyState({
  icon,
  title,
  body,
  tile = 'neutral',
  suggestions,
  action,
  secondaryAction,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={styles.wrap}>
      <GlyphTile icon={icon} tile={tile} />
      <View style={styles.copy}>
        <Text variant="heading" accessibilityRole="header" style={styles.center}>
          {title}
        </Text>
        {body ? (
          <Text variant="body" tone="ink2" style={styles.center}>
            {body}
          </Text>
        ) : null}
      </View>
      {suggestions?.length ? (
        <View style={styles.chips}>
          {suggestions.map((s) => (
            <Tag key={s} label={s} />
          ))}
        </View>
      ) : null}
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? <Button label={action.label} onPress={action.onPress} /> : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="text"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.screen,
    paddingVertical: theme.space['2xl'],
    gap: theme.space.lg,
  },
  tile: (tile: 'neutral' | 'accent') => ({
    width: theme.size.glyphTile,
    height: theme.size.glyphTile,
    borderRadius: theme.radius.sheet,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tile === 'accent' ? theme.colors.accent : theme.colors.bg2,
  }),
  copy: { gap: theme.space.xs, alignItems: 'center', maxWidth: theme.size.copyMax },
  center: { textAlign: 'center' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  actions: { alignSelf: 'stretch', gap: theme.space.xs },
}));
