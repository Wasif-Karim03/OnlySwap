import { useNetInfo } from '@react-native-community/netinfo';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Banner, isOffline } from '@/components/Banner';
import { Button } from '@/components/Button';
import { NavBar } from '@/components/NavBar';
import { PermissionPrimer } from '@/components/PermissionPrimer';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { sell as copy } from '@/strings';

import { getDraftStore } from './draft';
import { bookListingTitle, isbnFromBarcode, lookupIsbn, TEXTBOOKS_CATEGORY } from './isbn';

type Status = 'scanning' | 'looking' | 'notBook' | 'notFound' | 'offline';

const PROBLEM: Partial<Record<Status, string>> = {
  notBook: copy.scanNotBook,
  notFound: copy.scanNotFound,
  offline: copy.scanOffline,
};

/**
 * Scan ISBN (DEC 131). Reads a book's EAN-13, looks the title up on Open
 * Library and fills the draft (title + Textbooks), then goes back to details.
 * The seller can always type the title instead. Native only (no web entry).
 */
export function SellScanScreen({
  store = getDraftStore(),
  lookup = lookupIsbn,
}: {
  store?: ReturnType<typeof getDraftStore>;
  lookup?: typeof lookupIsbn;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const net = useNetInfo();
  const [granted, setGranted] = useState(false);
  const [status, setStatus] = useState<Status>('scanning');
  // The camera reports the same code many times a second; take the first.
  const busy = useRef(false);

  const leave = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/sell/details')),
    [router],
  );
  const onGranted = useCallback(() => setGranted(true), []);

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (busy.current) return;
    busy.current = true;
    const isbn = isbnFromBarcode(data);
    if (!isbn) {
      setStatus('notBook');
      return;
    }
    if (isOffline(net)) {
      setStatus('offline');
      return;
    }
    setStatus('looking');
    try {
      const book = await lookup(isbn);
      if (!book) {
        setStatus('notFound');
        return;
      }
      // No haptic: the Toast and the filled form answer back (haptic budget, 3.03).
      store.getState().update({ title: bookListingTitle(book), categoryId: TEXTBOOKS_CATEGORY });
      useToastStore.getState().show('success', copy.scanFound);
      leave();
    } catch {
      setStatus(isOffline(net) ? 'offline' : 'notFound');
    }
  };

  const again = () => {
    busy.current = false;
    setStatus('scanning');
  };

  if (!granted) {
    return (
      <PermissionPrimer
        kind="camera"
        onGranted={onGranted}
        onClose={leave}
        testID="screen-sell-scan-permission"
      />
    );
  }

  const problem = PROBLEM[status];
  return (
    <View style={styles.screen} testID="screen-sell-scan">
      <NavBar title={copy.scanTitle} leading="close" onLeading={leave} />
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
          onBarcodeScanned={status === 'scanning' ? (r) => void onScan(r) : undefined}
          accessibilityLabel={copy.scanBody}
          testID="sell-scan-camera"
        />
        {/* Aim guide: a plain hairline frame, decorative only. */}
        <View style={styles.guideWrap} pointerEvents="none" accessible={false}>
          <View style={styles.guide} />
        </View>
      </View>
      <View style={styles.panel}>
        {problem ? (
          <>
            <View testID={`sell-scan-${status}`}>
              <Banner kind="warning" message={problem} />
            </View>
            <Button label={copy.scanAgain} onPress={again} testID="sell-scan-again" />
            <Button label={copy.scanType} variant="text" onPress={leave} testID="sell-scan-type" />
          </>
        ) : (
          <View style={styles.line}>
            {status === 'looking' ? (
              <ActivityIndicator color={theme.colors.ink2} accessible={false} />
            ) : null}
            <Text
              variant="body"
              tone="ink2"
              accessibilityLiveRegion="polite"
              style={styles.flex}
              testID={status === 'looking' ? 'sell-scan-looking' : 'sell-scan-hint'}
            >
              {status === 'looking' ? copy.scanLooking : copy.scanBody}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  camera: { flex: 1, overflow: 'hidden' },
  guideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space['2xl'],
  },
  // A barcode is wide and short: a landscape frame tells the user where to aim.
  guide: {
    width: '100%',
    maxWidth: theme.size.copyMax,
    aspectRatio: 2,
    borderWidth: 1,
    borderColor: theme.colors.onPhoto,
    borderRadius: theme.radius.card,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  flex: { flex: 1 },
  panel: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.lg,
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
}));
