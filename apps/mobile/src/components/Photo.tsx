import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { motion } from '@onlyswap/tokens';
import { photo as photoCopy } from '@/strings/en';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Icon } from './icons/Icon';

export type PhotoState = 'loading' | 'loaded' | 'error';

/** A photo with no source is still loading (the blurhash shows); a failed load shows the placeholder. */
export function photoState(source: unknown, loaded: boolean, failed: boolean): PhotoState {
  if (failed) return 'error';
  if (!source || !loaded) return 'loading';
  return 'loaded';
}

export type PhotoProps = {
  /** Remote URI (the media Worker) or a bundled `require()` for fixtures. */
  source?: string | number | ImageSource | null;
  /** Shown while loading (DESIGN_SYSTEM §6). */
  blurhash?: string | null;
  /** Spoken description; photos are decorative when omitted. */
  accessibilityLabel?: string;
  /** Width / height. Defaults to square. */
  aspectRatio?: number;
  rounded?: 'none' | 'thumb' | 'card';
  contentFit?: 'cover' | 'contain';
  /** Neutral fill behind the photo; off in the dark full-screen viewer. */
  backdrop?: boolean;
  /** Blurs the image (chat photos from a new contact, P8-CHAT-04). */
  blurRadius?: number;
  /** The loaded image's pixel size. */
  onLoad?: (size: { width: number; height: number }) => void;
  /** Called once when the image fails, e.g. an expired signed URL. */
  onError?: () => void;
  testID?: string;
};

/**
 * Item photo (P2-CMP-07): expo-image with a blurhash while loading and a
 * neutral placeholder with an image glyph when it fails. Fades in 150 ms,
 * instantly with reduce motion.
 */
export function Photo({
  source,
  blurhash,
  accessibilityLabel,
  aspectRatio = 1,
  rounded = 'none',
  contentFit = 'cover',
  backdrop = true,
  blurRadius,
  onLoad,
  onError,
  testID,
}: PhotoProps) {
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastSource, setLastSource] = useState(source);
  // A new source starts over (recycled list cells).
  if (lastSource !== source) {
    setLastSource(source);
    setLoaded(false);
    setFailed(false);
  }
  const state = photoState(source, loaded, failed);
  const resolved = typeof source === 'string' ? { uri: source } : (source ?? undefined);

  return (
    <View
      testID={testID}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={
        accessibilityLabel && state === 'error'
          ? `${accessibilityLabel}. ${photoCopy.failed}`
          : accessibilityLabel
      }
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={styles.frame(aspectRatio, rounded, backdrop)}
    >
      {state === 'error' ? (
        <View testID={testID ? `${testID}-error` : undefined} style={styles.placeholder}>
          <Icon name="image" size={28} tone="ink3" />
        </View>
      ) : (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          source={resolved}
          placeholder={blurhash ? { blurhash } : undefined}
          placeholderContentFit="cover"
          contentFit={contentFit}
          transition={reduced ? 0 : motion.fade.duration}
          recyclingKey={typeof source === 'string' ? source : undefined}
          blurRadius={blurRadius}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.({ width: e.source.width, height: e.source.height });
          }}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
          accessible={false}
          accessibilityIgnoresInvertColors
          style={styles.image}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: (aspectRatio: number, rounded: 'none' | 'thumb' | 'card', backdrop: boolean) => ({
    width: '100%',
    aspectRatio,
    overflow: 'hidden',
    backgroundColor: backdrop ? theme.colors.bg2 : 'transparent',
    borderRadius: rounded === 'none' ? 0 : theme.radius[rounded],
  }),
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg2,
  },
}));
