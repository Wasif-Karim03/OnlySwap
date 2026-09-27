import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Mark } from '@/components/Mark';
import { Text } from '@/components/Text';

/** Rendered at half size and captured at 1200 × 630 (MOB-06, board "W · Share image"). */
export const CARD_W = 600;
export const CARD_H = 315;

type Props = {
  photo: string | null;
  price: string;
  title: string;
  tags: string[];
  onReady: () => void;
};

/**
 * The link preview for a shared listing: the cover photo, the price, the
 * title and the campus. Never the seller's name. It sits on screen at
 * opacity 0 (view-shot needs a laid-out view) and is hidden from screen
 * readers.
 */
export const ShareCard = forwardRef<View, Props>(function ShareCard(
  { photo, price, title, tags, onReady },
  ref,
) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.hidden}
    >
      <View ref={ref} collapsable={false} style={styles.card}>
        <View style={styles.photo}>
          {photo ? (
            <Image
              source={photo}
              accessibilityIgnoresInvertColors
              style={styles.fill}
              contentFit="cover"
              onLoad={onReady}
              onError={onReady}
            />
          ) : null}
        </View>
        <View style={styles.side}>
          <View style={styles.brand}>
            <Mark size={22} tone="accent" />
            <Text variant="heading">onlyswap</Text>
          </View>
          <View style={styles.bottom}>
            <Text variant="display" numberOfLines={1} style={styles.price}>
              {price}
            </Text>
            <Text variant="heading" numberOfLines={2}>
              {title}
            </Text>
            <View style={styles.tags}>
              {tags.map((t, i) => (
                <View key={t} style={styles.tag(i === tags.length - 1)}>
                  <Text variant="meta" tone={i === tags.length - 1 ? 'onAccent' : 'ink2'}>
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  // The wrapper is invisible; the card itself is opaque so the capture is too.
  hidden: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  card: {
    width: CARD_W,
    height: CARD_H,
    flexDirection: 'row',
    backgroundColor: theme.colors.bg,
  },
  photo: { width: CARD_H, height: CARD_H, backgroundColor: theme.colors.photoBg },
  fill: { width: '100%', height: '100%' },
  side: { flex: 1, padding: theme.space.xl, justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  bottom: { gap: theme.space.xs },
  price: { fontSize: 54, lineHeight: 60 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, marginTop: theme.space.xs },
  tag: (accent: boolean) => ({
    paddingHorizontal: theme.space.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.chip,
    backgroundColor: accent ? theme.colors.accent : theme.colors.bg2,
  }),
}));
