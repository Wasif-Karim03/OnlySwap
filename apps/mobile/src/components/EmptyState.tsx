import { size } from '@onlyswap/tokens';
import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { states as statesCopy } from '@/strings';

import { Button } from './Button';
import { Icon, type IconName } from './icons/Icon';
import { Text } from './Text';

type Action = { label: string; onPress: () => void };

export type EmptyStateProps = {
  /** Kept for callers; round 2 empty states show no glyph (design/round2 consistency rules). */
  icon?: IconName;
  /** Something real above the title: a count, or thumbnails of what you saved. */
  lead?: ReactNode;
  title: string;
  body?: string;
  /** Accent tile for the "start something" moments (board X36, X18); neutral otherwise. */
  tile?: 'neutral' | 'accent';
  /** Quick ideas under the body, e.g. what sells fast (board X36). Display only. */
  suggestions?: string[];
  action?: Action;
  secondaryAction?: Action;
  /** A section inside a longer page: own height, no full-screen stretch. */
  inline?: boolean;
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
 * Empty state (P2-CMP-08): one quiet block, centered (owner device check
 * 2026-10-26: left-aligned read as off to one side).
 * No glyph. An optional real lead (a count, thumbnails), a large title that
 * states a fact, one line on how the screen fills up, then the next step as
 * an ink capsule with an optional grey one beside it.
 */
export function EmptyState({
  lead,
  title,
  body,
  suggestions,
  action,
  secondaryAction,
  inline = false,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={styles.wrap(inline)}>
      <View style={styles.block}>
        <View style={styles.top}>
          {lead}
          <View style={styles.copy}>
            <Text variant="title" accessibilityRole="header" style={styles.center}>
              {title}
            </Text>
            {body ? (
              <Text variant="body" tone="ink2" style={styles.center}>
                {body}
              </Text>
            ) : null}
            {suggestions?.length ? (
              <Text variant="meta" tone="ink2" style={styles.center}>
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
                variant="secondary"
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
  // Full screen: centered vertically with extra room below, so the block sits
  // above the middle (about 40% down). Inline (a section of a page with more
  // below it, e.g. My listings): its own height and a little air, no stretch.
  wrap: (inline: boolean) =>
    inline
      ? { paddingVertical: theme.space['2xl'] }
      : {
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: theme.space.screen,
          paddingTop: theme.space['2xl'],
          paddingBottom: theme.space['2xl'] * 3,
        },
  block: { gap: theme.space.xl, alignItems: 'center' },
  top: { gap: theme.space.lg, alignItems: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  copy: { gap: theme.space.xs, maxWidth: theme.size.copyMax, alignItems: 'center' },
  center: { textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
}));
