import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner, isOffline } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip, ChipGroup } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { Toggle } from '@/components/Toggle';
import { fill } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { sell as copy } from '@/strings';

import { sellApi, type SellApi } from './api';
import { getDraftStore, useDraft, type DraftState } from './draft';
import {
  centsToPrice,
  cleanPrice,
  DESCRIPTION_MAX,
  dollars,
  TITLE_MAX,
  validateDetails,
  type Category,
  type Condition,
  type DetailsError,
  type ListingKind,
  type PickupBy,
  type PriceHint,
} from './logic';
import { SellStep } from './SellStep';

const CONDITIONS: Condition[] = ['new', 'like_new', 'good', 'fair'];
const PICKUPS: PickupBy[] = ['tomorrow', 'sunday', 'week'];

/** Category and condition settle for this long before the price hint is asked for. */
export const PRICE_HINT_DEBOUNCE_MS = 400;

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * R11-HINT-01 (D02 variant; DEC 90): what similar items sold for, right next
 * to the price, with a small button that fills the typical price. It never
 * blocks posting: while there are under 5 comparables (null), on any error and
 * offline it simply isn't there.
 */
function PriceHintLine({ hint, onUse }: { hint: PriceHint; onUse: (price: string) => void }) {
  const typical = dollars(hint.medianCents);
  const low = dollars(hint.p25Cents);
  const high = dollars(hint.p75Cents);
  return (
    <View style={styles.hint} testID="sell-price-hint">
      <View accessible accessibilityLabel={fill(copy.priceHint, { low, high, typical })}>
        <Text variant="meta" tone="ink3">
          {copy.priceHintLead}
        </Text>
        <Text variant="bodyStrong">{fill(copy.priceHintRange, { low, high })}</Text>
      </View>
      {/* A small secondary button (chip-sized) so screen readers hear a button, not a checkbox. */}
      <Button
        label={fill(copy.priceHintUse, { price: typical })}
        variant="secondary"
        size="S"
        fullWidth={false}
        accessibilityHint={fill(copy.priceHintUseHint, { price: typical })}
        onPress={() => onUse(centsToPrice(hint.medianCents))}
        testID="sell-price-hint-use"
      />
    </View>
  );
}

/**
 * Category as chips (DEC 90): the top-level categories, and once one with
 * sub-categories is picked (Tech), its sub-categories on a second row.
 * Tapping the picked sub-category again goes back to the parent.
 */
function CategoryChips({
  list,
  value,
  onPick,
}: {
  list: Category[];
  value: number | null;
  onPick: (id: number) => void;
}) {
  const picked = list.find((c) => c.id === value) ?? null;
  const parentId = picked ? (picked.parentId ?? picked.id) : null;
  const parent = list.find((c) => c.id === parentId) ?? null;
  const children = parentId === null ? [] : list.filter((c) => c.parentId === parentId);
  return (
    <>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={copy.categoryLabel}
        style={styles.chips}
      >
        {list
          .filter((c) => c.parentId === null)
          .map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={parentId === c.id}
              onPress={() => onPick(c.id)}
              testID={`sell-category-${c.id}`}
            />
          ))}
      </View>
      {parent && children.length > 0 ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={parent.name}
          style={styles.chips}
          testID="sell-subcategories"
        >
          {children.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={value === c.id}
              surface="card"
              onPress={() => onPick(value === c.id ? parent.id : c.id)}
              testID={`sell-category-${c.id}`}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

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
 * pickup day instead (DEC 54). The price hint (R11-HINT-01) shows once a
 * category and condition are picked for a sale.
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
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
    staleTime: Infinity,
  });
  const net = useNetInfo();
  const offline = isOffline(net);
  const hintArgs = useDebounced(
    draft.kind === 'sale' && draft.categoryId !== null && draft.condition
      ? { categoryId: draft.categoryId, condition: draft.condition }
      : null,
    PRICE_HINT_DEBOUNCE_MS,
  );
  const hintKey = hintArgs ? `${hintArgs.categoryId}:${hintArgs.condition}` : null;
  const hint = useQuery({
    queryKey: ['price_hint', hintArgs?.categoryId ?? null, hintArgs?.condition ?? null],
    queryFn: () => api.priceHint(hintArgs!.categoryId, hintArgs!.condition),
    enabled: hintArgs !== null && !offline,
    staleTime: 10 * 60_000,
    retry: false,
  });
  // Only the settled choice that's on screen now; never a stale or failed answer.
  const currentKey =
    draft.kind === 'sale' && draft.categoryId !== null && draft.condition
      ? `${draft.categoryId}:${draft.condition}`
      : null;
  const shownHint =
    !offline && hintKey !== null && hintKey === currentKey && !hint.isError
      ? (hint.data ?? null)
      : null;

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
        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <Input
              label={copy.priceLabel}
              kind="price"
              placeholder="0"
              value={draft.price}
              onChangeText={(t) => update({ price: cleanPrice(t) })}
              error={errorFor('price')}
              testID="sell-price"
            />
          </View>
          {shownHint ? (
            <PriceHintLine hint={shownHint} onUse={(price) => update({ price })} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.field}>
        <Text variant="label" tone="ink3">
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
          <View style={styles.field}>
            <Text variant="label" tone="ink3">
              {copy.categoryLabel}
            </Text>
            {categories.isPending ? (
              <SkeletonList rows={2} />
            ) : categories.isError ? (
              <ErrorState
                layout="inline"
                error={categories.error}
                onRetry={() => void categories.refetch()}
              />
            ) : (
              <View style={styles.field} testID="sell-category">
                <CategoryChips
                  list={list}
                  value={draft.categoryId}
                  onPick={(categoryId) => update({ categoryId })}
                />
              </View>
            )}
            {errorFor('category') ? (
              <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
                {errorFor('category')}
              </Text>
            ) : null}
          </View>
          <View style={styles.list}>
            <Toggle
              label={copy.offersLabel}
              description={copy.offersBody}
              value={draft.openToOffers}
              onChange={(openToOffers) => update({ openToOffers })}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text variant="label" tone="ink3">
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
          <View style={styles.list}>
            <View style={styles.freeRow}>
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
  field: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: theme.space.md,
  },
  priceField: { flexGrow: 1, flexBasis: '40%' },
  hint: { flexGrow: 1.3, flexBasis: '45%', gap: theme.space.xs, alignItems: 'flex-start' },
  // A plain grouped list (DEC 90): hairline border, rows inside.
  list: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  freeRow: { gap: theme.space.xs, paddingVertical: theme.space.md },
}));
