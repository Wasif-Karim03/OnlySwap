import { useLocalSearchParams } from 'expo-router';

import { QuadThreadScreen } from '@/features/quad/QuadThreadScreen';

export default function QuadThreadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <QuadThreadScreen id={id} />;
}
