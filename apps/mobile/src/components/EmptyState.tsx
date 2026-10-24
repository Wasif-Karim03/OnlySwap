import { size } from '@onlyswap/tokens';
import { Fragment } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { states as statesCopy } from '@/strings';

import { Button } from './Button';
import { Icon, type IconName } from './icons/Icon';
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
  // Round 2 (design/system.md 7.11): a bare outline glyph in ink3, no filled
  // box. `tile` stays in the API so callers don't change; it no longer paints.
  void tile;
  return (
    <View style={styles.tile} accessible={false}>
      <Icon name={icon} size={size.glyphIcon} tone="ink3" strokeWidth={1.5} />
    </View>
  );
}

/**
 * Empty state (P2-CMP-08; round 2, design/system.md 7.11): one quiet block,
 * ever. Outline glyph, title, one line that explains how the screen fills
 * up, then the next step right under the copy (an ink capsule sized to its
 * label), with the secondary as a text button. The block sits a little above
 * the middle of the empty area, left-aligned.
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
      <View style={styles.block}>
        <View style={styles.top}>
          <GlyphTile icon={icon} tile={tile} />
          <View style={styles.copy}>
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
            {body ? (
              <Text variant="body" tone="ink2">
                {body}
              </Text>
            ) : null}
            {suggestions?.length ? (
              <Text variant="meta" tone="ink2">
                {`${statesCopy.suggestionsLead} `}
                {suggestions.map((s, i) => (
                  <Fragment key={s}>
                    {i > 0 ? ', ' : null}
                    <Text variant="meta" tone="ink2">
                      {s}
                    </Text>
                  </Fragment>
                ))}
              </Text>
            ) : null}
          </View>
        </View>
        {action || secondaryAction ? (
          <View style={styles.actions}>
            {action ? (
              <Button
                label={action.label}
                onPress={action.onPress}
                variant="dark"
                fullWidth={false}
              />
            ) : null}
            {secondaryAction ? (
              <Button
                label={secondaryAction.label}
                onPress={secondaryAction.onPress}
                variant="text"
                fullWidth={false}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Centered vertically with extra room below, so the block sits above the
  // middle (about 40% down) instead of floating at the very top.
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space['2xl'],
    paddingBottom: theme.space['2xl'] * 3,
  },
  block: { gap: theme.space.xl, alignItems: 'flex-start' },
  top: { gap: theme.space.lg, alignItems: 'flex-start' },
  tile: { alignItems: 'flex-start', justifyContent: 'center' },
  copy: { gap: theme.space.xs, maxWidth: theme.size.copyMax },
  actions: { alignItems: 'flex-start', gap: theme.space.xs },
}));
