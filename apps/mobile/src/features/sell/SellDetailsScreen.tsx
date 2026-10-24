import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { sell as copy } from '@/strings';

import { sellApi, type SellApi } from './api';
import { getDraftStore, useDraft, type DraftState } from './draft';
import { addStarter, categoryExample, STARTERS, topCategory } from './help';
import { TEXTBOOKS_CATEGORY } from './isbn';
import {
  centsToPrice,
  priceInput,
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
import { SellStep, useErrorShake } from './SellStep';

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
 * R11-HINT-01 (D02 variant; DEC 90): what similar items sold for, as one meta
 * line under the price with a text button at its end that fills the typical
 * price (3.03). It never blocks posting: while there are under 5 comparables
 * (null), on any error and offline it simply isn't there.
 */
function PriceHintLine({ hint, onUse }: { hint: PriceHint; onUse: (price: string) => void }) {
  const typical = dollars(hint.medianCents);
  const low = dollars(hint.p25Cents);
  const high = dollars(hint.p75Cents);
  return (
    <View style={styles.hint} testID="sell-price-hint">
      <View
        accessible
        accessibilityLabel={fill(copy.priceHint, { low, high, typical })}
        style={styles.hintText}
      >
        <Text variant="meta" tone="ink2">
          {copy.priceHintLead}
        </Text>
        <Text variant="meta" tone="ink" style={styles.strong}>
          {fill(copy.priceHintRange, { low, high })}
        </Text>
      </View>
      <Button
        label={fill(copy.priceHintUse, { price: typical })}
        variant="text"
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
 * at once next to its field, with a count in the dock above Next (shaken with
 * the warning haptic, 3.03), and keeps Next disabled until they're fixed. "Give it away" hides category and price and asks for a
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
  const { style: shakeStyle, shake } = useErrorShake();
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
      // The warning haptic fires with the dock line's error shake (budget, 3.03).
      shake();
      return;
    }
    router.push('/sell/meetup');
  };

  const sale = draft.kind === 'sale';
  const count = errors.length;
  const list = categories.data ?? [];
  // DEC 131: the scan offer stays until a category other than Textbooks is picked.
  const top = topCategory(list, draft.categoryId);
  const canScan = Platform.OS !== 'web' && sale && (top === null || top === TEXTBOOKS_CATEGORY);

  return (
    <SellStep
      testID="screen-sell-details"
      step={2}
      leading="back"
      onLeading={() => (router.canGoBack() ? router.back() : router.replace('/sell'))}
      title={copy.detailsTitle}
      dock={
        <>
          {/* Messages sit with Next, where the eye is after tapping it. The
              wrapper stays mounted so the button never jumps on re-insert. */}
          <View collapsable={false} style={styles.dockMessages}>
            {count > 0 ? (
              <Animated.View style={shakeStyle} testID="sell-details-fix-banner">
                <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
                  {count === 1 ? copy.fixOne : fill(copy.fixCount, { count })}
                </Text>
              </Animated.View>
            ) : null}
            {checkFailed ? <Banner kind="warning" message={copy.errors.checkFailed} /> : null}
          </View>
          <Button
            label={copy.next}
            onPress={() => void next()}
            loading={checking}
            disabled={count > 0}
            testID="sell-details-next"
          />
        </>
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
      <View style={styles.field}>
        {/* The category's example title is the placeholder (3.03; DEC 129 content). */}
        <Input
          label={copy.titleLabel}
          placeholder={
            draft.categoryId === null
              ? copy.titlePlaceholder
              : fill(copy.titlePlaceholderExample, {
                  example: categoryExample(list, draft.categoryId),
                })
          }
          value={draft.title}
          maxLength={TITLE_MAX}
          onChangeText={(title) => update({ title })}
          error={errorFor('title')}
          testID="sell-title"
        />
        {/* Scan ISBN (DEC 131): native only, the web has no barcode camera. */}
        {canScan ? (
          <View style={styles.start}>
            <Button
              label={copy.scanBook}
              variant="text"
              size="S"
              fullWidth={false}
              onPress={() => router.push('/sell/scan')}
              testID="sell-scan-book"
            />
          </View>
        ) : null}
      </View>
      {sale ? (
        <View style={styles.field}>
          <Input
            label={copy.priceLabel}
            kind="price"
            placeholder="0"
            value={draft.price}
            onChangeText={(t) => update(priceInput(t))}
            error={errorFor('price')}
            testID="sell-price"
          />
          {shownHint ? (
            <PriceHintLine hint={shownHint} onUse={(price) => update({ price })} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.field}>
        <Text variant="label" tone="ink3">
          {copy.conditionLabel}
        </Text>
        {/* Chips wrap at large text sizes, where four segments would crowd (3.03). */}
        <ChipGroup<Condition>
          label={copy.conditionLabel}
          mode="single"
          options={CONDITIONS.map((c) => ({ value: c, label: copy.conditions[c] }))}
          value={draft.condition ? [draft.condition] : []}
          onChange={(v) => update({ condition: v[0] ?? null })}
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
          {/* One meta line instead of a tip box (3.03, DEC 90). */}
          <Text variant="meta" tone="ink2">
            <Text variant="meta" tone="ink" style={styles.strong}>
              {copy.freeTitle}
            </Text>
            {`. ${copy.freeBody}`}
          </Text>
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
      {/* Quick details: one scrolling row of chips, no label (3.03). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.starters}
        testID="sell-starters"
      >
        {STARTERS.map((s) => (
          <Chip
            key={s}
            label={copy.starters[s]}
            selected={draft.description.includes(copy.starters[s])}
            onPress={() => update({ description: addStarter(draft.description, s) })}
            testID={`sell-starter-${s}`}
          />
        ))}
      </ScrollView>
    </SellStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  field: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  start: { flexDirection: 'row' },
  dockMessages: { gap: theme.space.xs },
  hint: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: theme.space.sm },
  hintText: { flexDirection: 'row', flexWrap: 'wrap', columnGap: theme.space.xs, flexShrink: 1 },
  strong: { fontWeight: theme.type.bodyStrong.fontWeight },
  starters: { flexDirection: 'row', gap: theme.space.sm },
  // A plain grouped list (DEC 90): hairline border, rows inside.
  list: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
}));
