import { Stack } from 'expo-router';

// The Quad draws its own large-title header (Q02).
export default function QuadLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
