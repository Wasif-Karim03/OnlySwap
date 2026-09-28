import { useLocalSearchParams } from 'expo-router';

import { ListingScreen } from '@/features/feed/ListingScreen';

export default function ListingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListingScreen id={id} />;
}
