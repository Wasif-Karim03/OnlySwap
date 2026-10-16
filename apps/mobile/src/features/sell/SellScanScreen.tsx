import { useNetInfo } from '@react-native-community/netinfo';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner, isOffline } from '@/components/Banner';
import { Button } from '@/components/Button';
import { NavBar } from '@/components/NavBar';
import { PermissionPrimer } from '@/components/PermissionPrimer';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { haptic } from '@/lib/haptics';
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
      store.getState().update({ title: bookListingTitle(book), categoryId: TEXTBOOKS_CATEGORY });
      haptic('success');
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
          <Text
            variant="body"
            tone="ink2"
            accessibilityLiveRegion="polite"
            testID={status === 'looking' ? 'sell-scan-looking' : 'sell-scan-hint'}
          >
            {status === 'looking' ? copy.scanLooking : copy.scanBody}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  camera: { flex: 1, overflow: 'hidden' },
  panel: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.lg,
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
}));
