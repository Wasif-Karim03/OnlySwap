import { useLocalSearchParams } from 'expo-router';

import { RateScreen } from '@/features/deals/DealScreens';

export default function RateRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <RateScreen chatId={chatId} />;
}
