import { Stack } from 'expo-router';

/** System states the launch gate can open (DESIGN_SYSTEM §10 X). */
export default function SystemLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
