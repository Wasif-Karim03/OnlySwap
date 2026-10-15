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
      <GlyphTile icon="alert" />
      <View style={styles.copy}>
        <Text variant="heading" accessibilityRole="header" style={styles.center}>
          {copy.title}
        </Text>
        <Text variant="body" tone="ink2" style={styles.center}>
          {copy.body}
        </Text>
      </View>
      <Button
        label={copy.retry}
        variant="secondary"
        size="L"
        loading={retrying}
        onPress={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.space.screen,
    paddingTop: rt.insets.top + theme.space['2xl'],
    paddingBottom: rt.insets.bottom + theme.space['2xl'],
    gap: theme.space.lg,
  },
  copy: { gap: theme.space.xs, alignItems: 'center', maxWidth: theme.size.copyMax },
  center: { textAlign: 'center' },
}));
