import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { Toggle } from '@/components/Toggle';
import { fill } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { sell as copy } from '@/strings/en';

import { sellApi, type SellApi } from './api';
import { getDraftStore, useDraft, type DraftState } from './draft';
import {
  categoryLabel,
  cleanPrice,
  DESCRIPTION_MAX,
  TITLE_MAX,
  validateDetails,
  type Category,
  type Condition,
  type DetailsError,
  type ListingKind,
  type PickupBy,
} from './logic';
import { SellStep } from './SellStep';

const CONDITIONS: Condition[] = ['new', 'like_new', 'good', 'fair'];
const PICKUPS: PickupBy[] = ['tomorrow', 'sunday', 'week'];

/** Banned-word hits from the server check, tied to the text that was checked. */
type Banned = {
  title?: { text: string; term: string };
  description?: { text: string; term: string };
};

export function errorText(e: DetailsError): string {
  if (e.kind === 'banned') return fill(copy.errors.banned, { term: e.term });
  switch (e.field) {
    case 'title':
      return e.kind === 'short' ? copy.errors.titleShort : copy.errors.titleLong;
    case 'category':
      return copy.errors.category;
    case 'price':
      return e.kind === 'too_high'
        ? copy.errors.priceHigh
        : e.kind === 'too_low'
          ? copy.errors.priceLow
          : copy.errors.priceMissing;
    default:
      return copy.errors.descriptionLong;
  }
}

/**
 * D02 Sell · details (P5-SELL-03; board D2, D3, D4). Next shows every problem
 * at once next to its field, with a count on top, and keeps Next disabled
 * until they're fixed. "Give it away" hides category and price and asks for a
 * pickup day instead (DEC 54). No price hint in R1.0.
 */
export function SellDetailsScreen({
  api = sellApi,
  store = getDraftStore(),
}: {
  api?: SellApi;
  store?: ReturnType<typeof getDraftStore>;
}) {
  const router = useRouter();
  const draft = useDraft((s: DraftState) => s.draft, store);
  const { update } = store.getState();
  const [submitted, setSubmitted] = useState(false);
  const [banned, setBanned] = useState<Banned>({});
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
    staleTime: Infinity,
  });

  const bannedErrors = (): DetailsError[] => {
    const out: DetailsError[] = [];
    if (banned.title && banned.title.text === draft.title) {
      out.push({ field: 'title', kind: 'banned', term: banned.title.term });
    }
    if (banned.description && banned.description.text === draft.description) {
      out.push({ field: 'description', kind: 'banned', term: banned.description.term });
    }
    return out;
  };
  const errors = submitted ? [...validateDetails(draft), ...bannedErrors()] : [];
  const errorFor = (field: DetailsError['field']) => {
    const e =
      errors.find((x) => x.field === field && x.kind === 'banned') ??
      errors.find((x) => x.field === field);
    return e ? errorText(e) : undefined;
  };

  const next = async () => {
    setCheckFailed(false);
    const local = validateDetails(draft);
    setChecking(true);
    let found: Banned = {};
    try {
      const [t, d] = await Promise.all([
        draft.title.trim() ? api.checkText(draft.title) : null,
        draft.description.trim() ? api.checkText(draft.description) : null,
      ]);
      if (t?.result === 'block' && t.term) found.title = { text: draft.title, term: t.term };
      if (d?.result === 'block' && d.term)
        found.description = { text: draft.description, term: d.term };
    } catch {
      found = {};
      setCheckFailed(true);
      setChecking(false);
      return;
    }
    setChecking(false);
    setBanned(found);
    if (local.length > 0 || found.title || found.description) {
      setSubmitted(true);
      haptic('warning');
      return;
    }
    router.push('/sell/meetup');
  };

  const sale = draft.kind === 'sale';
  const count = errors.length;
  const list = categories.data ?? [];

  return (
    <SellStep
      testID="screen-sell-details"
      step={2}
      leading="back"
      onLeading={() => (router.canGoBack() ? router.back() : router.replace('/sell'))}
      dock={
        <Button
          label={copy.next}
          onPress={() => void next()}
          loading={checking}
          disabled={count > 0}
          testID="sell-details-next"
        />
      }
      overlay={
        <Sheet
          visible={picking}
          onClose={() => setPicking(false)}
          title={copy.categoriesTitle}
          testID="sheet-sell-category"
        >
          {categories.isPending ? (
            <SkeletonList rows={6} />
          ) : categories.isError ? (
            <ErrorState
              layout="inline"
              error={categories.error}
              onRetry={() => void categories.refetch()}
            />
          ) : (
            <ScrollView style={styles.sheetList}>
              {list
                .filter((c) => c.parentId === null)
                .flatMap((parent) => [parent, ...list.filter((c) => c.parentId === parent.id)])
                .map((c: Category) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: draft.categoryId === c.id }}
                    accessibilityLabel={categoryLabel(list, c.id) ?? c.name}
                    testID={`sell-category-${c.id}`}
                    onPress={() => {
                      update({ categoryId: c.id });
                      setPicking(false);
                    }}
                    style={styles.option(c.parentId !== null)}
                  >
                    <Text variant={c.parentId === null ? 'bodyStrong' : 'body'}>{c.name}</Text>
                    {draft.categoryId === c.id ? <Icon name="check" size={18} /> : null}
                  </Pressable>
                ))}
            </ScrollView>
          )}
        </Sheet>
      }
    >
      <SegmentedControl<ListingKind>
        label={copy.modeLabel}
        segments={[
          { value: 'sale', label: copy.sellIt },
          { value: 'free', label: copy.giveAway },
        ]}
        value={draft.kind}
        onChange={(kind) => update({ kind })}
      />
      {count > 0 ? (
        <View testID="sell-details-fix-banner">
          <Banner
            kind="error"
            message={count === 1 ? copy.fixOne : fill(copy.fixCount, { count })}
          />
        </View>
      ) : null}
      {checkFailed ? <Banner kind="warning" message={copy.errors.checkFailed} /> : null}

      <Input
        label={copy.titleLabel}
        placeholder={copy.titlePlaceholder}
        value={draft.title}
        maxLength={TITLE_MAX}
        onChangeText={(title) => update({ title })}
        error={errorFor('title')}
        testID="sell-title"
      />

      {sale ? (
        <View style={styles.field}>
          <Text variant="label" tone="ink2">
            {copy.categoryLabel}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.categoryLabel}
            accessibilityValue={{
              text: categoryLabel(list, draft.categoryId) ?? copy.categoryPlaceholder,
            }}
            accessibilityHint={errorFor('category')}
            onPress={() => setPicking(true)}
            testID="sell-category"
            style={styles.picker(Boolean(errorFor('category')))}
          >
            <Text
              variant="body"
              tone={draft.categoryId === null ? 'ink3' : 'ink'}
              style={styles.flex}
            >
              {categoryLabel(list, draft.categoryId) ?? copy.categoryPlaceholder}
            </Text>
            <Icon name="chev" size={18} tone="ink2" />
          </Pressable>
          {errorFor('category') ? (
            <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
              {errorFor('category')}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.field}>
        <Text variant="label" tone="ink2">
          {copy.conditionLabel}
        </Text>
        <SegmentedControl<Condition | ''>
          label={copy.conditionLabel}
          segments={CONDITIONS.map((c) => ({ value: c, label: copy.conditions[c] }))}
          value={draft.condition ?? ''}
          onChange={(c) => update({ condition: c === '' ? null : c })}
        />
      </View>

      {sale ? (
        <>
          <Input
            label={copy.priceLabel}
            kind="price"
            placeholder="0"
            value={draft.price}
            onChangeText={(t) => update({ price: cleanPrice(t) })}
            error={errorFor('price')}
            testID="sell-price"
          />
          <Toggle
            label={copy.offersLabel}
            description={copy.offersBody}
            value={draft.openToOffers}
            onChange={(openToOffers) => update({ openToOffers })}
          />
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text variant="label" tone="ink2">
              {copy.pickupLabel}
            </Text>
            <ChipGroup<PickupBy>
              label={copy.pickupLabel}
              mode="single"
              options={PICKUPS.map((p) => ({ value: p, label: copy.pickup[p] }))}
              value={[draft.pickupBy]}
              onChange={(v) => {
                const pick = v[0];
                if (pick) update({ pickupBy: pick });
              }}
            />
          </View>
          <View style={styles.freeCard}>
            <View style={styles.freeIcon}>
              <Icon name="gift" size={20} tone="onAccent" />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{copy.freeTitle}</Text>
              <Text variant="meta" tone="ink2">
                {copy.freeBody}
              </Text>
            </View>
          </View>
        </>
      )}

      <TextArea
        label={copy.descriptionLabel}
        placeholder={copy.descriptionPlaceholder}
        maxLength={DESCRIPTION_MAX}
        value={draft.description}
        onChangeText={(description) => update({ description })}
        error={errorFor('description')}
        testID="sell-description"
      />
    </SellStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  field: { gap: theme.space.xs },
  picker: (error: boolean) => ({
    minHeight: theme.size.buttonL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.control,
    borderWidth: error ? 1.5 : 1,
    borderColor: error ? theme.colors.red : theme.colors.line,
    backgroundColor: error ? theme.colors.redBg : theme.colors.card,
  }),
  sheetList: { maxHeight: 420 },
  option: (child: boolean) => ({
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: child ? theme.space.lg : 0,
  }),
  freeCard: {
    flexDirection: 'row',
    gap: theme.space.md,
    padding: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  freeIcon: {
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
}));
