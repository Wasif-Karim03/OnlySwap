import { Stack, useLocalSearchParams } from 'expo-router';

import { DidItSellScreen } from '@/features/deals/DealScreens';

export default function DidItSellRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <DidItSellScreen chatId={id} />
    </>
  );
}
