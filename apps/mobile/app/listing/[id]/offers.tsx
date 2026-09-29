import { useLocalSearchParams } from 'expo-router';

import { ListingOffersScreen } from '@/features/offers/ListingOffersScreen';

export default function ListingOffersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListingOffersScreen listingId={id} />;
}
