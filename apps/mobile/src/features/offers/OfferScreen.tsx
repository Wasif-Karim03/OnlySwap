import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabaseRealtime, useUserChannel, type RealtimeSource } from '@/lib/realtime';
import { offers as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { dollarsToCents } from '../search/logic';
import { mediaUrl } from '../sell/logic';
import { offersApi, type OffersApi } from './api';
import {
  expirySpan,
  MAX_ROUND,
  money,
  offerLineShort,
  offerTitle,
  offerView,
  type Offer,
  type OfferAction,
} from './logic';

/** The round is worth a mention only near the end (round 3 of 4 and later). */
const SHOW_ROUND_FROM = 3;
/** Quick notes read as plain words, one after another. */
const NOTE_SEPARATOR = ' · ';

export const offerKey = (id: string) => ['offer', id] as const;

/** E02 Offer (P7-OFF-04): every status × role (E3-E8), counter, decline, withdraw. */
export function OfferScreen({
  id,
  api = offersApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
  realtime = supabaseRealtime,
}: {
  id: string;
  api?: OffersApi;
  mediaBase?: () => string;
  now?: () => Date;
  realtime?: RealtimeSource;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  // Always fresh: the other side can accept, counter or decline while this
  // screen is open (audit 2026-10-24: Withdraw stayed up on an accepted offer).
  const query = useQuery({ queryKey: offerKey(id), queryFn: () => api.get(id), staleTime: 0 });
  useUserChannel('inbox', () => void query.refetch(), realtime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  if (query.isPending) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} />
        <SkeletonList rows={3} />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  }
  const o: Offer = query.data;
  const view = offerView(o);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: offerKey(id) });
    void qc.invalidateQueries({ queryKey: ['inbox'] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e));
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const accept = () =>
    run(async () => {
      const { chat_id } = await api.accept(o.id);
      haptic('success'); // Budget: "offer accepted".
      router.replace({ pathname: '/chat/[id]', params: { id: chat_id } });
    });

  const counterCents = dollarsToCents(counterAmount);
  const base = mediaBase();
  const name = o.other?.display_name ?? copy.deletedUser;
  // One visible line without the amount (it is the big number); the label keeps it.
  const shortLine = offerLineShort(o, view.line);
  const span = view.open ? expirySpan(o.expires_at, now(), 'long') : null;
  const meta = view.open
    ? [
        o.round >= SHOW_ROUND_FROM ? fill(copy.round, { n: o.round }) : null,
        span ? fill(copy.expiresIn, { when: span }) : null,
      ]
        .filter(Boolean)
        .join('. ')
    : '';
  const declineReason =
    o.status === 'declined' && o.decline_reason
      ? fill(copy.declinedReason, { reason: o.decline_reason })
      : null;
  const has = (a: OfferAction) => view.actions.includes(a);

  return (
    <View style={styles.root} testID={`screen-offer-${view.frame}`}>
      <NavBar onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        {o.listing ? (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={o.listing.title}
            onPress={() =>
              router.push({ pathname: '/listing/[id]', params: { id: o.listing!.id } })
            }
          >
            <View style={styles.listing}>
              <View style={styles.thumb}>
                <Photo
                  source={o.listing.thumb_path ? mediaUrl(base, o.listing.thumb_path) : null}
                  rounded="thumb"
                />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {offerTitle(o)}
                </Text>
                {o.bundle?.length ? (
                  <Text variant="meta" tone="ink2" numberOfLines={3} testID="offer-bundle">
                    {fill(copy.bundleAlso, { items: o.bundle.map((b) => b.title).join(', ') })}
                  </Text>
                ) : null}
                <Text variant="meta" tone="ink2">
                  {money(o.listing.price_cents)}
                </Text>
              </View>
            </View>
          </Tappable>
        ) : null}

        <Text variant="price" accessibilityRole="header">
          {money(o.amount_cents)}
        </Text>
        <Text variant="bodyStrong" accessibilityLabel={view.line} testID="offer-line">
          {shortLine}
        </Text>
        {declineReason ? (
          <Text variant="body" tone="ink2" testID="offer-decline-reason">
            {declineReason}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Avatar
            name={name}
            uri={o.other?.avatar_path ? mediaUrl(base, o.other.avatar_path) : null}
            size="S"
          />
          <Text variant="label">{name}</Text>
        </View>
        {meta ? (
          <Text variant="meta" tone="ink2" testID="offer-meta">
            {meta}
          </Text>
        ) : null}
        {/* Quick notes are plain words, not chips: they are tags, not controls. */}
        {o.quick_notes.length ? (
          <Text variant="body" tone="ink2" testID="offer-quick-notes">
            {o.quick_notes.join(NOTE_SEPARATOR)}
          </Text>
        ) : null}
        {o.note ? <Text variant="body">{o.note}</Text> : null}
        {view.open && o.round >= MAX_ROUND && view.actions.includes('accept') ? (
          <Text variant="meta" tone="ink2">
            {copy.lastRound}
          </Text>
        ) : null}
        {error ? <Banner kind="error" message={error} /> : null}
      </ScrollView>

      {/* One filled action (P7): Accept, with Counter beside it; the rest are text buttons. */}
      <View style={styles.dock}>
        {has('accept') ? (
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Button
                label={fill(copy.accept, { amount: money(o.amount_cents) })}
                loading={busy}
                onPress={accept}
                testID="offer-accept"
              />
            </View>
            {has('counter') ? (
              <View style={styles.flex}>
                <Button
                  label={copy.counter}
                  variant="secondary"
                  onPress={() => setCounterOpen(true)}
                  testID="offer-counter"
                />
              </View>
            ) : null}
          </View>
        ) : null}
        {has('decline') ? (
          <Button
            label={copy.decline}
            variant="text"
            onPress={() => setDeclineOpen(true)}
            testID="offer-decline"
          />
        ) : null}
        {has('withdraw') ? (
          <Button
            label={copy.withdraw}
            variant="text"
            onPress={() => setWithdrawOpen(true)}
            testID="offer-withdraw"
          />
        ) : null}
        {view.actions.includes('open_chat') && o.chat_id ? (
          <Button
            label={copy.openChat}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: o.chat_id! } })}
            testID="offer-open-chat"
          />
        ) : null}
        {view.actions.includes('offer_again') && o.listing_id ? (
          <Button
            label={copy.offerAgain}
            onPress={() =>
              router.push({ pathname: '/listing/[id]/offer', params: { id: o.listing_id! } })
            }
            testID="offer-again"
          />
        ) : null}
      </View>

      <Sheet
        visible={counterOpen}
        onClose={() => setCounterOpen(false)}
        title={copy.counterTitle}
        testID="counter-sheet"
      >
        <View style={styles.sheet}>
          <Input
            kind="price"
            label={copy.amountLabel}
            value={counterAmount}
            onChangeText={setCounterAmount}
            testID="counter-amount"
          />
          <Button
            label={copy.counterSend}
            disabled={!counterCents || counterCents === o.amount_cents}
            loading={busy}
            onPress={async () => {
              setCounterOpen(false);
              await run(() => api.counter(o.id, counterCents!));
            }}
            testID="counter-send"
          />
        </View>
      </Sheet>

      <Sheet
        visible={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={copy.declineTitle}
        testID="decline-sheet"
      >
        <View style={styles.sheet}>
          <View style={styles.chips}>
            {(Object.keys(copy.declineReasons) as (keyof typeof copy.declineReasons)[]).map((k) => (
              <Chip
                key={k}
                label={copy.declineReasons[k]}
                selected={reason === copy.declineReasons[k]}
                onPress={() =>
                  setReason(reason === copy.declineReasons[k] ? null : copy.declineReasons[k])
                }
              />
            ))}
          </View>
          <Button
            label={copy.declineConfirm}
            variant="destructive"
            onPress={async () => {
              setDeclineOpen(false);
              await run(() => api.decline(o.id, reason ?? undefined));
            }}
            testID="decline-confirm"
          />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={withdrawOpen}
        title={copy.withdrawTitle}
        message={copy.withdrawBody}
        confirmLabel={copy.withdrawConfirm}
        destructive
        onConfirm={async () => {
          try {
            await api.withdraw(o.id);
          } catch (e) {
            // Usually the offer moved on (accepted or expired) before the tap.
            setError(errorText(e));
          } finally {
            setWithdrawOpen(false);
            void refresh();
          }
        }}
        onCancel={() => setWithdrawOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { ...readableColumn, padding: theme.space.screen, gap: theme.space.md },
  // A plain hairline row, not a boxed card (2.1 surface rule).
  listing: {
    flexDirection: 'row',
    gap: theme.space.md,
    alignItems: 'center',
    minHeight: theme.space.rowMin,
    paddingBottom: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  thumb: { width: theme.size.buttonL, height: theme.size.buttonL },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  pair: { flexDirection: 'row', gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  sheet: { gap: theme.space.lg, paddingBottom: theme.space.xl },
  dock: {
    ...readableColumn,
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
}));
