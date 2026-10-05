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

  return (
    <View testID={testID} style={styles.wrap(layout)} accessibilityLiveRegion="polite">
      {layout === 'screen' ? <GlyphTile icon={offline ? 'wifi' : 'alert'} /> : null}
      <View style={styles.copy}>
        <Text variant="heading" accessibilityRole="header" style={styles.center}>
          {errorTitle(appError)}
        </Text>
        <Text variant="body" tone="ink2" style={styles.center}>
          {offline ? statesCopy.offlineBody : errorCopy(appError, { campusTimeZone })}
        </Text>
      </View>
      {onRetry ? (
        <Button
          label={statesCopy.retry}
          variant="secondary"
          loading={retrying}
          onPress={retry}
          size={layout === 'screen' ? 'L' : 'M'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (layout: 'screen' | 'inline') => ({
    flexGrow: layout === 'screen' ? 1 : 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.screen,
    paddingVertical: layout === 'screen' ? theme.space['2xl'] : theme.space.xl,
    gap: theme.space.lg,
  }),
  copy: { gap: theme.space.xs, alignItems: 'center', maxWidth: theme.size.copyMax },
  center: { textAlign: 'center' },
}));
