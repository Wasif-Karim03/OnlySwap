import { Stack } from 'expo-router';

// Discover draws its own large-title header with the Search button (B01).
export default function DiscoverLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
