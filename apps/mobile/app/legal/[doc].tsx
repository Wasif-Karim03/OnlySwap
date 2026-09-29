import { useLocalSearchParams } from 'expo-router';

import { LegalScreen } from '@/features/legal/LegalScreen';

export default function LegalRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  return <LegalScreen doc={doc} />;
}
