import { useLocalSearchParams } from 'expo-router';

import { MeetupDayScreen } from '@/features/meetups/MeetupDayScreen';

export default function MeetupRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <MeetupDayScreen id={id} otherName={name ?? ''} />;
}
