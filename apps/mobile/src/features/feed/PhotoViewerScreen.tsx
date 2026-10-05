import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/components/NavBar';
import { Text } from '@/components/Text';
import { ZoomableImage } from '@/components/ZoomableImage';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { feed as copy } from '@/strings';

import { mediaUrl } from '../sell/logic';
import { feedApi, type FeedApi } from './api';
import { listingKey } from './ListingScreen';
import { isVisible } from './logic';

/** B04 Photo viewer (P6-LIST-03): page between photos, pinch to zoom, swipe down to close. */
export function PhotoViewerScreen({
  id,
  start = 0,
  api = feedApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  id: string;
  start?: number;
  api?: FeedApi;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const query = useQuery({ queryKey: listingKey(id), queryFn: () => api.getListing(id) });
  const [index, setIndex] = useState(start);
  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/listing/[id]', params: { id } });
  const item = query.data && isVisible(query.data) ? query.data : null;
  const photos = item?.photos ?? [];

  return (
    <View style={styles.root} testID="screen-photos">
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        initialScrollIndex={Math.min(start, Math.max(photos.length - 1, 0))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(p, i) => `${p.path}-${i}`}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))
        }
        renderItem={({ item: p, index: i }) => (
          <View style={{ width }}>
            <ZoomableImage
              source={mediaUrl(mediaBase(), p.path)}
              blurhash={p.blurhash}
              accessibilityLabel={fill(copy.photoOf, {
                n: i + 1,
                total: photos.length,
                title: item?.title ?? '',
              })}
              onDismiss={close}
              testID={`photo-${i}`}
            />
          </View>
        )}
      />
      <View style={styles.top} pointerEvents="box-none">
        <NavBar
          tone="onPhoto"
          leading="close"
          onLeading={close}
          trailing={
            photos.length > 1 ? (
              <Text variant="label" tone="onPhoto">
                {fill(copy.photoCount, { n: index + 1, total: photos.length })}
              </Text>
            ) : undefined
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.photoBg },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
}));
