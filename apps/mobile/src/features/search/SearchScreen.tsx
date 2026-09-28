import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { GroupedList, ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { getStorage } from '@/lib/storage';
import { search as copy } from '@/strings/en';

import { searchApi, type SearchApi } from './api';
import { addRecent, parseRecent, type Suggestion } from './logic';

type RecentStorage = { get: () => unknown; set: (v: string[]) => void };
const defaultRecent: RecentStorage = {
  get: () => getStorage().get('search.recent'),
  set: (v) => getStorage().set('search.recent', v),
};

export const SUGGEST_DEBOUNCE_MS = 200;

const ICON = { saved: 'bookmark', category: 'grid', trending: 'trend', title: 'search' } as const;

/** B06 Search (P6-SRCH-02): recent, popular terms and live suggestions (B14, B15). */
export function SearchScreen({
  api = searchApi,
  recentStorage = defaultRecent,
}: {
  api?: SearchApi;
  recentStorage?: RecentStorage;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recent, setRecent] = useState(() => parseRecent(recentStorage.get()));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const typing = debounced.length >= 2;
  const suggestions = useQuery({
    queryKey: ['search-suggest', typing ? debounced.toLowerCase() : ''],
    queryFn: () => api.suggest(typing ? debounced : ''),
    staleTime: 60_000,
  });

  const go = (q: string) => {
    const next = addRecent(recent, q);
    setRecent(next);
    recentStorage.set(next);
    router.push({ pathname: '/search/results', params: { q: q.trim() } });
  };

  const clearRecent = () => {
    setRecent([]);
    recentStorage.set([]);
  };

  const list: Suggestion[] = suggestions.data ?? [];

  return (
    <View style={styles.root} testID="screen-search">
      <View style={styles.bar}>
        <View style={styles.flex}>
          <Input
            kind="search"
            label={copy.inputLabel}
            hideLabel
            placeholder={copy.placeholder}
            value={text}
            onChangeText={setText}
            autoFocus
            onSubmitEditing={() => text.trim() && go(text)}
            testID="search-input"
          />
        </View>
        <Button label={copy.cancel} variant="text" size="S" onPress={() => router.back()} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {typing ? (
          <GroupedList header={copy.suggestionsLabel}>
            {list.map((s) => (
              <ListRow
                key={`${s.type}-${s.label}`}
                label={s.label}
                icon={ICON[s.type]}
                value={
                  s.type === 'saved'
                    ? copy.savedLabel
                    : s.type === 'category' && s.count != null
                      ? fill(copy.countLabel, { n: s.count })
                      : undefined
                }
                onPress={() => go(s.label)}
              />
            ))}
          </GroupedList>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={styles.section} testID="search-recent">
                <View style={styles.row}>
                  <Text variant="heading" accessibilityRole="header" style={styles.flex}>
                    {copy.recent}
                  </Text>
                  <Button label={copy.clearRecent} variant="text" size="S" onPress={clearRecent} />
                </View>
                <GroupedList>
                  {recent.map((r) => (
                    <ListRow key={r} label={r} icon="clock" onPress={() => go(r)} />
                  ))}
                </GroupedList>
              </View>
            ) : null}
            {list.length > 0 ? (
              <View style={styles.section} testID="search-trending">
                <Text variant="heading" accessibilityRole="header">
                  {copy.trending}
                </Text>
                <View style={styles.chips}>
                  {list.map((s) => (
                    <Chip key={s.label} label={s.label} onPress={() => go(s.label)} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: rt.insets.top },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingVertical: theme.space.sm,
  },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { padding: theme.space.screen, gap: theme.space.xl },
  section: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
}));
