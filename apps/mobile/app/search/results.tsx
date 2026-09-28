import { useLocalSearchParams } from 'expo-router';

import { decodeFilters } from '@/features/search/logic';
import { ResultsScreen } from '@/features/search/ResultsScreen';

export default function ResultsRoute() {
  const { q, f, saved } = useLocalSearchParams<{ q?: string; f?: string; saved?: string }>();
  return <ResultsScreen q={q ?? ''} initialFilters={decodeFilters(f)} savedId={saved} />;
}
