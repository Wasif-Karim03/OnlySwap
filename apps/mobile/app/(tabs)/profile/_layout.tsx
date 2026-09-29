import { Stack } from 'expo-router';

// Profile draws its own large-title header (F01).
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
