import { Redirect, useLocalSearchParams } from 'expo-router';

// Around campus moved to its own Feed tab (DEC 98); old links and pushes land there.
export default function CampusRoute() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  return <Redirect href={kind ? { pathname: '/feed', params: { kind } } : '/feed'} />;
}
