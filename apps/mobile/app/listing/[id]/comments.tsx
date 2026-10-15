import { useLocalSearchParams } from 'expo-router';

import { CommentsScreen } from '@/features/comments/CommentsScreen';

export default function ListingCommentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CommentsScreen listingId={id} />;
}
