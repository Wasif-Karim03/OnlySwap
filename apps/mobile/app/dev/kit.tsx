import { Redirect } from 'expo-router';

import { KitScreen } from '@/features/dev/KitScreen';

/** Dev-only route; release builds redirect home (no hidden features in the store build). */
export default function DevKit() {
  if (!__DEV__) return <Redirect href="/discover" />;
  return <KitScreen />;
}
