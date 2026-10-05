import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { Input } from '@/components/Input';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { search as copy, sell as sellCopy } from '@/strings';

import type { Category, Condition } from '../sell/logic';
import {
  centsToDollars,
  cleanFilters,
  dollarsToCents,
  type SearchFilters,
  type SortKey,
} from './logic';

const CONDITIONS: Condition[] = ['new', 'like_new', 'good', 'fair'];

/** B08 Filters sheet (P6-SRCH-04; board B17). */
export function FiltersSheet({
  visible,
  onClose,
  value,
  onApply,
  categories,
  hasQuery,
}: {
  visible: boolean;
  onClose: () => void;
  value: SearchFilters;
  onApply: (f: SearchFilters) => void;
  categories: Category[];
  hasQuery: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [min, setMin] = useState(centsToDollars(value.min_cents));
  const [max, setMax] = useState(centsToDollars(value.max_cents));
  const [wasVisible, setWasVisible] = useState(visible);
  // Opening the sheet starts from the applied filters.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(value);
      setMin(centsToDollars(value.min_cents));
      setMax(centsToDollars(value.max_cents));
    }
  }

  const sorts: SortKey[] = hasQuery
    ? ['relevance', 'new', 'price_asc', 'price_desc']
    : ['new', 'price_asc', 'price_desc'];
  const top = categories.filter((c) => c.parentId === null);

  const apply = () =>
    onApply(
      cleanFilters({ ...draft, min_cents: dollarsToCents(min), max_cents: dollarsToCents(max) }),
    );

  return (
    <Sheet visible={visible} onClose={onClose} title={copy.filters} testID="filters-sheet">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ChipGroup
          label={copy.category}
          mode="multi"
          options={top.map((c) => ({ value: String(c.id), label: c.name }))}
          value={(draft.category_ids ?? []).map(String)}
          onChange={(v) => setDraft({ ...draft, category_ids: v.map(Number) })}
        />
        <View style={styles.section}>
          <Text variant="label">{copy.price}</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Input
                kind="price"
                label={copy.minPrice}
                value={min}
                onChangeText={setMin}
                testID="filter-min"
              />
            </View>
            <View style={styles.flex}>
              <Input
                kind="price"
                label={copy.maxPrice}
                value={max}
                onChangeText={setMax}
                testID="filter-max"
              />
            </View>
          </View>
        </View>
        <ChipGroup
          label={copy.condition}
          mode="multi"
          options={CONDITIONS.map((c) => ({ value: c, label: sellCopy.conditions[c] }))}
          value={draft.conditions ?? []}
          onChange={(v) => setDraft({ ...draft, conditions: v })}
        />
        <Toggle
          label={copy.freeOnly}
          value={!!draft.free_only}
          onChange={(v) => setDraft({ ...draft, free_only: v })}
        />
        <Toggle
          label={copy.hideSwiped}
          value={!!draft.hide_swiped}
          onChange={(v) => setDraft({ ...draft, hide_swiped: v })}
        />
        <SegmentedControl
          label={copy.sort}
          segments={sorts.map((s) => ({ value: s, label: copy.sorts[s] }))}
          value={draft.sort && sorts.includes(draft.sort) ? draft.sort : sorts[0]!}
          onChange={(s) => setDraft({ ...draft, sort: s })}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              label={copy.reset}
              variant="secondary"
              onPress={() => {
                setDraft({});
                setMin('');
                setMax('');
              }}
            />
          </View>
          <View style={styles.flex}>
            <Button label={copy.apply} onPress={apply} testID="filters-apply" />
          </View>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.space.lg, paddingBottom: theme.space.xl },
  section: { gap: theme.space.sm },
  row: { flexDirection: 'row', gap: theme.space.md },
  flex: { flex: 1 },
}));
