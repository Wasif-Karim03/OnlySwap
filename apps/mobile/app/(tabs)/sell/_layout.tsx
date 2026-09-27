import { Stack } from 'expo-router';

// The Sell steps draw their own "New listing" bar with the step count (board D1 to D5).
export default function SellLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
