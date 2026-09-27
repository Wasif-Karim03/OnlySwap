import { Stack } from 'expo-router';

/** Onboarding and sign-in (DESIGN_SYSTEM §10 A). */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
