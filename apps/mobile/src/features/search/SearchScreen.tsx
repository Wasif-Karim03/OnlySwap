import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Icon, type IconName } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { getStorage } from '@/lib/storage';
import { search as copy } from '@/strings';

import { searchApi, type SearchApi } from './api';
import { addRecent, parseRecent, type Suggestion } from './logic';

type RecentStorage = { get: () => unknown; set: (v: string[]) => void };
const defaultRecent: RecentStorage = {
  get: () => getStorage().get('search.recent'),
  set: (v) => getStorage().set('search.recent', v),
};

export const SUGGEST_DEBOUNCE_MS = 200;

const ICON = { saved: 'bookmark', category: 'grid', trending: 'trend', title: 'search' } as const;

/**
 * B06 Search (P6-SRCH-02): recent, popular terms and live suggestions (B14,
 * B15). DEC 90 mock screen 6: plain rows with a hairline, no grouped boxes.
 */
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

  const removeRecent = (q: string) => {
    const next = recent.filter((r) => r !== q);
    setRecent(next);
    recentStorage.set(next);
  };

  const countOf = (s: Suggestion) =>
    s.type === 'saved'
      ? copy.savedLabel
      : s.type === 'category' && s.count != null
        ? fill(copy.countLabel, { n: s.count })
        : undefined;

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
          <View style={styles.section} testID="search-suggestions">
            <Text variant="label" tone="ink3" accessibilityRole="header">
              {copy.suggestionsLabel}
            </Text>
            <View>
              {/* Always offer the typed text, so the list is never an empty header. */}
              {list.some((s) => s.label.toLowerCase() === text.trim().toLowerCase()) ? null : (
                <Row
                  icon="search"
                  label={fill(copy.searchFor, { q: text.trim() })}
                  onPress={() => go(text)}
                />
              )}
              {list.map((s) => (
                <Row
                  key={`${s.type}-${s.label}`}
                  icon={ICON[s.type]}
                  label={s.label}
                  value={countOf(s)}
                  onPress={() => go(s.label)}
                />
              ))}
            </View>
          </View>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={styles.section} testID="search-recent">
                <View style={styles.row}>
                  <Text variant="bodyStrong" accessibilityRole="header" style={styles.heading}>
                    {copy.recent}
                  </Text>
                  <Button label={copy.clearRecent} variant="text" size="S" onPress={clearRecent} />
                </View>
                <View>
                  {recent.map((r) => (
                    <Row
                      key={r}
                      icon="clock"
                      label={r}
                      onPress={() => go(r)}
                      onRemove={() => removeRecent(r)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {list.length > 0 ? (
              <View style={styles.section} testID="search-trending">
                <Text variant="bodyStrong" accessibilityRole="header" style={styles.heading}>
                  {copy.trending}
                </Text>
                <View>
                  {list.map((s) => (
                    <Row
                      key={`${s.type}-${s.label}`}
                      icon={ICON[s.type]}
                      label={s.label}
                      value={countOf(s)}
                      onPress={() => go(s.label)}
                    />
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

/** A plain search row: grey glyph, the text, an optional count, then a remove x or a chevron. */
function Row({
  icon,
  label,
  value,
  onPress,
  onRemove,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.line}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${value}` : label}
        onPress={onPress}
        style={styles.flex}
      >
        <View style={styles.rowHit}>
          <Icon name={icon} size={18} tone="ink3" />
          <Text variant="body" numberOfLines={1} style={styles.flex}>
            {label}
          </Text>
          {value ? (
            <Text variant="meta" tone="ink3">
              {value}
            </Text>
          ) : null}
          {onRemove ? null : <Icon name="chev" size={16} tone="ink3" />}
        </View>
      </Tappable>
      {onRemove ? (
        <IconButton
          icon="x"
          tone="ink3"
          accessibilityLabel={fill(copy.removeRecent, { q: label })}
          onPress={onRemove}
        />
      ) : null}
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
  heading: { flex: 1, fontWeight: theme.type.heading.fontWeight },
  body: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: theme.space['2xl'],
    gap: theme.space.xl,
  },
  section: { gap: theme.space.xs },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  rowHit: {
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.xs,
  },
}));
