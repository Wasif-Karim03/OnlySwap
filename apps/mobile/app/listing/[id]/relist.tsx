import { useLocalSearchParams } from 'expo-router';

import { RelistScreen } from '@/features/me/MeScreens';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RelistScreen id={id} />;
}
