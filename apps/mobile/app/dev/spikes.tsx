import { Redirect } from 'expo-router';

import { SpikesScreen } from '@/features/dev/SpikesScreen';

/** Dev-only route; release builds redirect home (no hidden features in the store build). */
export default function DevSpikes() {
  if (!__DEV__) return <Redirect href="/discover" />;
  return <SpikesScreen />;
}
