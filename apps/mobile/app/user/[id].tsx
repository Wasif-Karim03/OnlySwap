import { useLocalSearchParams } from 'expo-router';

import { ProfileViewScreen } from '@/features/profiles/ProfileViewScreen';

export default function UserRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileViewScreen id={id} />;
}
