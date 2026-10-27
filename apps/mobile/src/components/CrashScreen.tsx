import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { captureError } from '@/lib/sentry';
import { crash as copy } from '@/strings';

import { Button } from './Button';
import { GlyphTile } from './EmptyState';
import { Text } from './Text';

type Props = {
  error: Error;
  /** Re-renders the routes (Expo Router's ErrorBoundary retry). */
  retry: () => Promise<void> | void;
};

/**
 * Render crash fallback for the root ErrorBoundary (F-08, DEC 103). It
 * replaces the whole root layout, so it needs no provider: theme from
 * Unistyles, plain React Native views. The error text is never shown.
 */
export function CrashScreen({ error, retry }: Props) {
  const [retrying, setRetrying] = useState(false);
  useEffect(() => captureError(error), [error]);

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View testID="crash-screen" style={styles.wrap} accessibilityLiveRegion="polite">
      {/* Same left-aligned block as ErrorState; Try again is the one docked `dark` action. */}
      <View style={styles.top}>
        <GlyphTile icon="alert" />
        <View style={styles.copy}>
          <Text variant="heading" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="body" tone="ink2">
            {copy.body}
          </Text>
        </View>
      </View>
      <Button label={copy.retry} variant="dark" size="L" loading={retrying} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  wrap: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.space.screen,
    paddingTop: rt.insets.top + theme.space['2xl'],
    paddingBottom: rt.insets.bottom + theme.space.lg,
    gap: theme.space.lg,
  },
  top: { gap: theme.space.lg, alignItems: 'flex-start' },
  copy: { gap: theme.space.xs, maxWidth: theme.size.copyMax },
}));
