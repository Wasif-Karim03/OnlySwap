import { Redirect, useLocalSearchParams } from 'expo-router';

import { ListingScreen } from '@/features/feed/ListingScreen';
import { rememberListingLink } from '@/features/auth/pendingLink';
import { useSession } from '@/features/auth/useSession';
import { toSource } from '@/lib/activity';

export default function ListingRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const session = useSession();
  // A shared link opened while signed out: sign in first, then this listing
  // opens (UX audit 2026-10-25; it used to end on an error screen).
  if (session.status === 'loading') return null;
  if (session.status === 'signedOut') {
    if (id) rememberListingLink(id);
    return <Redirect href="/welcome" />;
  }
  return <ListingScreen id={id} from={toSource(from)} />;
}
