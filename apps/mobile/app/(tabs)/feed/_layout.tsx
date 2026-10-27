import { Stack } from 'expo-router';

// The Feed draws its own large-title header (DEC 98).
export default function FeedLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
