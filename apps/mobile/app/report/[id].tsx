import { useLocalSearchParams } from 'expo-router';

import { ReportUpdateScreen } from '@/features/safety/SafetyScreens';

export default function ReportRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportUpdateScreen id={id} />;
}
