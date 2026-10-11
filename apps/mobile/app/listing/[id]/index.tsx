import { useLocalSearchParams } from 'expo-router';

import { ListingScreen } from '@/features/feed/ListingScreen';
import { toSource } from '@/lib/activity';

export default function ListingRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  return <ListingScreen id={id} from={toSource(from)} />;
}
