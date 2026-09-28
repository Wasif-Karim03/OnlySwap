import { Stack, useLocalSearchParams } from 'expo-router';

import { PhotoViewerScreen } from '@/features/feed/PhotoViewerScreen';

export default function PhotosRoute() {
  const { id, i } = useLocalSearchParams<{ id: string; i?: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <PhotoViewerScreen id={id} start={Number(i) || 0} />
    </>
  );
}
