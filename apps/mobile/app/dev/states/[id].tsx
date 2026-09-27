import { Redirect, useLocalSearchParams } from 'expo-router';

import { StateFrameScreen } from '@/features/dev/StatesGalleryScreen';

/** Dev-only route (P2-KIT-02); release builds redirect home. */
export default function DevStateFrame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!__DEV__) return <Redirect href="/discover" />;
  return <StateFrameScreen id={id} />;
}
