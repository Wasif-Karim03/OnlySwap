import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { GlyphTile } from '@/components/EmptyState';
import { Icon } from '@/components/icons/Icon';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { quad as copy } from '@/strings/en';

import { blockedKey, heldKey, offersListing } from '../logic';

export type Outcome = { status: 'held' | 'blocked'; reason: string | null };

/** Copy for a blocked post or reply (Q9): says exactly why. */
export function blockedText(reason: string | null): string {
  const { key, term } = blockedKey(reason);
  return key === 'term' ? fill(copy.blocked.term, { term: term ?? '' }) : copy.blocked[key];
}

export function heldText(reason: string | null): string {
  return copy.held[heldKey(reason)];
}

type Props = {
  outcome: Outcome | null;
  onClose: () => void;
  /** Blocked: back to the text to fix it. */
  onEdit: () => void;
  /** Blocked for contact details: open Sell instead. */
  onListing?: () => void;
  /** Held: leave the composer. */
  onDone: () => void;
};

/**
 * Q9 Post blocked and Q10 Post held. Nothing blocked is saved; a held post
 * waits for a moderator and shows in Your Quad.
 */
export function OutcomeSheet({ outcome, onClose, onEdit, onListing, onDone }: Props) {
  const blocked = outcome?.status === 'blocked';
  const reason = outcome?.reason ?? null;
  return (
    <Sheet visible={!!outcome} onClose={onClose} testID={blocked ? 'quad-blocked' : 'quad-held'}>
      {outcome ? (
        <View style={styles.body}>
          <GlyphTile icon={blocked ? 'lock' : 'clock'} />
          <Text variant="heading" accessibilityRole="header">
            {blocked ? copy.blockedTitle : copy.heldTitle}
          </Text>
          <Text variant="body" tone="ink2">
            {blocked ? blockedText(reason) : heldText(reason)}
          </Text>
          {blocked && offersListing(reason) && onListing ? (
            <View style={styles.hint}>
              <Icon name="tag" size={18} tone="ink" />
              <Text variant="label" style={styles.flex}>
                {copy.listingHint}
              </Text>
            </View>
          ) : null}
          {!blocked ? (
            <Text variant="meta" tone="ink2">
              {copy.heldNote}
            </Text>
          ) : null}
          {blocked ? (
            <View style={styles.actions}>
              <Button label={copy.editPost} variant="secondary" onPress={onEdit} />
              {offersListing(reason) && onListing ? (
                <Button label={copy.makeListing} variant="dark" onPress={onListing} />
              ) : null}
            </View>
          ) : (
            <Button label={copy.backToQuad} variant="dark" onPress={onDone} />
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.space.md, paddingBottom: theme.space.md },
  hint: {
    flexDirection: 'row',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  flex: { flex: 1 },
  actions: { gap: theme.space.sm },
}));
