import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { errorCopy, toAppError, type AppError } from '@/lib/errors';
import { states as statesCopy } from '@/strings';

import { Button } from './Button';
import { GlyphTile } from './EmptyState';
import { Text } from './Text';

/** Device time zone until the campus zone is loaded with the profile. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/** Title for a failed load: offline gets its own, everything else a plain one. */
export function errorTitle(error: AppError): string {
  return error.code === 'ERR_OFFLINE' ? statesCopy.offlineTitle : statesCopy.errorTitle;
}

type Props = {
  error: unknown;
  /** Retries the failed query. The button shows a spinner until it settles. */
  onRetry?: () => unknown;
  /** IANA zone of the campus, for "try again after 6:00 PM". */
  campusTimeZone?: string;
  /** `inline` fits inside a section; `screen` fills the screen. */
  layout?: 'screen' | 'inline';
  testID?: string;
};

/**
 * Load failure with retry (P2-CMP-08; DESIGN_SYSTEM §10 global states).
 * Copy comes from `errors.*` so every error code reads the same everywhere.
 * Same left-aligned block as EmptyState; on a full screen Try again docks at the bottom.
 */
export function ErrorState({
  error,
  onRetry,
  campusTimeZone = deviceTimeZone(),
  layout = 'screen',
  testID,
}: Props) {
  const appError = toAppError(error);
  const [retrying, setRetrying] = useState(false);
  const offline = appError.code === 'ERR_OFFLINE';

  const retry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // The query shows the new error; nothing else to do here.
    } finally {
      setRetrying(false);
    }
  };

  const screen = layout === 'screen';
  return (
    <View testID={testID} style={styles.wrap(layout)} accessibilityLiveRegion="polite">
      <View style={styles.top}>
        {screen ? <GlyphTile icon={offline ? 'wifi' : 'alert'} /> : null}
        <View style={styles.copy}>
          <Text variant="heading" accessibilityRole="header">
            {errorTitle(appError)}
          </Text>
          <Text variant="body" tone="ink2">
            {offline ? statesCopy.offlineBody : errorCopy(appError, { campusTimeZone })}
          </Text>
        </View>
      </View>
      {onRetry ? (
        // Full screen: the one docked `dark` action (P7). Inline: a medium grey button.
        <Button
          label={statesCopy.retry}
          variant={screen ? 'dark' : 'secondary'}
          loading={retrying}
          onPress={retry}
          size={screen ? 'L' : 'M'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (layout: 'screen' | 'inline') => ({
    flexGrow: layout === 'screen' ? 1 : 0,
    justifyContent: layout === 'screen' ? 'space-between' : 'flex-start',
    paddingHorizontal: theme.space.screen,
    paddingVertical: layout === 'screen' ? theme.space['2xl'] : theme.space.xl,
    gap: theme.space.lg,
  }),
  top: { gap: theme.space.lg, alignItems: 'flex-start' },
  copy: { gap: theme.space.xs, maxWidth: theme.size.copyMax },
}));
