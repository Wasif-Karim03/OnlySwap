import { Stack, useLocalSearchParams } from 'expo-router';

import { OfferSheetScreen } from '@/features/offers/OfferSheetScreen';

export default function OfferSheetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <OfferSheetScreen listingId={id} />
    </>
  );
}
