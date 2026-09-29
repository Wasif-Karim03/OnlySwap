import { Stack, useLocalSearchParams } from 'expo-router';

import { PlanMeetupScreen } from '@/features/meetups/PlanMeetupScreen';

export default function PlanMeetupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <PlanMeetupScreen chatId={id} />
    </>
  );
}
