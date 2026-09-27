import { Redirect } from 'expo-router';

import { StatesGalleryScreen } from '@/features/dev/StatesGalleryScreen';

/** Dev-only route (P2-KIT-02); release builds redirect home. */
export default function DevStates() {
  if (!__DEV__) return <Redirect href="/discover" />;
  return <StatesGalleryScreen />;
}
