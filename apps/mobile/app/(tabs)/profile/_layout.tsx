import { Stack } from 'expo-router';

import { shell } from '@/strings/en';

// Tab roots use a large title; pushed screens use inline titles (DESIGN_SYSTEM UX-04).
export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: shell.profileTitle, headerLargeTitle: true }} />
    </Stack>
  );
}
