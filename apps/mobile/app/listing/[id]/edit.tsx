import { useLocalSearchParams } from 'expo-router';

import { EditListingScreen } from '@/features/me/MeScreens';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditListingScreen id={id} />;
}
