import { useLocalSearchParams } from 'expo-router';

import { ListingStatsScreen } from '@/features/me/MeScreens';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListingStatsScreen id={id} />;
}
