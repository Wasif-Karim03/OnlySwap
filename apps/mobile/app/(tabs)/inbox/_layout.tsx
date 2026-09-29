import { Stack } from 'expo-router';

// Inbox draws its own large-title header (E01).
export default function InboxLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
