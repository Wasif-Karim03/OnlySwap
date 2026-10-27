import { Stack, useLocalSearchParams } from 'expo-router';

import { MarkSoldScreen } from '@/features/deals/DealScreens';

export default function MarkSoldRoute() {
  const { id, buyer } = useLocalSearchParams<{ id: string; buyer?: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <MarkSoldScreen listingId={id} preselect={buyer} />
    </>
  );
}
