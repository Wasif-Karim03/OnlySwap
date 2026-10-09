import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { pctBucket, track } from '@/lib/analytics';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SkeletonList } from '@/components/Skeleton';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { getEnv } from '@/lib/env';
import { errorText, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { offers as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { feedApi, type FeedApi } from '../feed/api';
import { listingKey } from '../feed/ListingScreen';
import { isVisible, sellerName } from '../feed/logic';
import { dollarsToCents } from '../search/logic';
import { centsToPrice, cleanPrice, mediaUrl } from '../sell/logic';
import { offersApi, type OffersApi } from './api';
import { isLowOffer, money, quickAmounts } from './logic';

const QUICK_NOTES = ['today', 'campus', 'available', 'cash'] as const;

/**
 * B05 Make an offer (P7-OFF-02, P7-OFF-07; DEC 90): the item, a big offer
 * number, quick picks, a note, one plain line about paying in person, and the
 * ink Send offer button. Low-offer warning, limits and success are unchanged.
 */
export function OfferSheetScreen({
  listingId,
  api = offersApi,
  listings = feedApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  listingId: string;
  api?: OffersApi;
  listings?: Pick<FeedApi, 'getListing'>;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: listingKey(listingId),
    queryFn: () => listings.getListing(listingId),
  });
  const [amount, setAmount] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<'paused' | 'unavailable' | null>(null);
  const [sent, setSent] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/discover'));
  useEffect(() => track('offer_sheet_opened'), []);

  if (query.isPending) {
    return (
      <View style={styles.root}>
        <NavBar leading="close" onLeading={close} />
        <SkeletonList rows={3} />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View style={styles.root}>
        <NavBar leading="close" onLeading={close} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  }
  const item = query.data;
  if (!isVisible(item) || item.access === 'owner' || item.status !== 'active' || blocked) {
    return (
      <View style={styles.root} testID="offer-unavailable">
        <NavBar leading="close" onLeading={close} />
        <EmptyState
          icon={blocked === 'paused' ? 'lock' : 'tag'}
          title={blocked === 'paused' ? copy.pausedTitle : copy.unavailableTitle}
          body={
            blocked === 'paused'
              ? errorText({ message: 'OFFERS_PAUSED' })
              : errorText({ message: 'LISTING_UNAVAILABLE' })
          }
          action={{ label: copy.close, onPress: close }}
        />
      </View>
    );
  }

  const free = item.kind === 'free';
  const ask = item.price_cents;
  const firm = !free && !item.open_to_offers;
  const cents = free ? 0 : firm ? ask : amount === null ? ask : (dollarsToCents(amount) ?? 0);
  const name = sellerName(item);

  if (sent) {
    return (
      <View style={styles.root} testID="offer-sent">
        <View style={styles.success}>
          <SuccessCheck visible accessibilityLabel={free ? copy.askedTitle : copy.sentTitle} />
          <Text variant="title" accessibilityRole="header">
            {free ? copy.askedTitle : copy.sentTitle}
          </Text>
          <Text variant="body" tone="ink2" style={styles.center}>
            {fill(copy.sentBody, { name })}
          </Text>
        </View>
        <View style={styles.dock}>
          <Button label={copy.goInbox} variant="dark" onPress={() => router.replace('/inbox')} />
          <Button label={copy.keepSwiping} variant="secondary" onPress={close} />
        </View>
      </View>
    );
  }

  const send = async () => {
    setError(null);
    setSending(true);
    try {
      await api.make(
        item.id,
        cents,
        note,
        notes.map((n) => copy.quickNotes[n as keyof typeof copy.quickNotes]),
      );
      haptic('success'); // Budget: "offer sent" (DESIGN_SYSTEM §5).
      track('offer_sent', { pct_of_ask_bucket: pctBucket(cents, ask) });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      setSent(true);
    } catch (e) {
      const code = toAppError(e).code;
      if (code === 'OFFERS_PAUSED') setBlocked('paused');
      else if (code === 'LISTING_UNAVAILABLE') setBlocked('unavailable');
      else setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const valid = free || cents >= 100;

  const thumb = (item.photos ?? [])[0]?.thumb_path ?? null;
  const shown = amount ?? centsToPrice(ask);

  return (
    <View style={styles.root} testID="screen-offer">
      <NavBar leading="close" onLeading={close} title={free ? copy.askTitle : copy.sheetTitle} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.item}>
          <View style={styles.thumb}>
            <Photo source={thumb ? mediaUrl(mediaBase(), thumb) : null} rounded="thumb" />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {item.title}
            </Text>
            <Text variant="meta" tone="ink3" numberOfLines={1}>
              {free ? name : `${fill(copy.asking, { price: money(ask) })} · ${name}`}
            </Text>
          </View>
        </View>
        {free ? (
          <Text variant="body" tone="ink2" style={styles.center}>
            {copy.askBody}
          </Text>
        ) : (
          <View style={styles.amountBlock}>
            <Text variant="label" tone="ink3" style={styles.center}>
              {copy.amountLabel}
            </Text>
            {firm ? (
              <>
                <Text
                  style={[styles.center, styles.big]}
                  accessibilityLabel={`${copy.amountLabel}: ${money(ask)}`}
                >
                  {money(ask)}
                </Text>
                <Text variant="meta" tone="ink2" style={styles.center}>
                  {copy.firmNote}
                </Text>
              </>
            ) : (
              <>
                {/* The number itself is the field (DEC 90): big, centered, the $ kept in front. */}
                <TextInput
                  value={`$${shown}`}
                  onChangeText={(t) => setAmount(cleanPrice(t))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={copy.amountLabel}
                  selectionColor={theme.colors.ink}
                  // Enter sends from the keyboard on the web app (P13-WEB-07).
                  onSubmitEditing={() => valid && void send()}
                  style={[styles.big, styles.bigInput]}
                  testID="offer-amount"
                />
                <View style={styles.quick}>
                  {[...quickAmounts(ask)].reverse().map((q) => (
                    <Chip
                      key={q.cents}
                      label={
                        q.label === 'ask'
                          ? fill(copy.asking, { price: money(q.cents) })
                          : money(q.cents)
                      }
                      selected={cents === q.cents}
                      onPress={() => setAmount(centsToPrice(q.cents))}
                    />
                  ))}
                </View>
                {isLowOffer(cents, ask) ? (
                  <Text
                    variant="meta"
                    tone="amber"
                    style={styles.center}
                    accessibilityLiveRegion="polite"
                  >
                    {copy.lowWarning}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        )}
        <TextArea
          label={copy.notesLabel}
          placeholder={copy.notePlaceholder}
          value={note}
          onChangeText={setNote}
          maxLength={140}
          testID="offer-note"
        />
        <View style={styles.chips}>
          {QUICK_NOTES.map((n) => (
            <Chip
              key={n}
              label={copy.quickNotes[n]}
              selected={notes.includes(n)}
              onPress={() =>
                setNotes((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]))
              }
            />
          ))}
        </View>
        {error ? <Banner kind="error" message={error} /> : null}
        <Text variant="meta" tone="ink2" style={styles.center} testID="offer-pay-in-person">
          {copy.payInPerson}
        </Text>
      </ScrollView>
      <View style={styles.dock}>
        <Button
          label={free ? copy.sendAsk : copy.send}
          variant="dark"
          accessibilityHint={free ? undefined : money(cents)}
          loading={sending}
          disabled={!valid}
          onPress={send}
          testID="offer-send"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { ...readableColumn, padding: theme.space.screen, gap: theme.space.lg },
  flex: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  thumb: {
    width: theme.size.avatarM + theme.space.sm,
    height: theme.size.avatarM + theme.space.sm,
  },
  amountBlock: { gap: theme.space.sm, paddingTop: theme.space.md },
  // The offer number: the display style at almost twice the size (DEC 90).
  big: {
    fontSize: theme.type.display.fontSize * 1.85,
    lineHeight: theme.type.display.fontSize * 2.2,
    fontWeight: theme.type.display.fontWeight,
    letterSpacing: theme.type.display.letterSpacing * 1.85,
    color: theme.colors.ink,
    fontVariant: ['tabular-nums'],
  },
  bigInput: { textAlign: 'center', paddingVertical: 0 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  center: { textAlign: 'center' },
  success: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    padding: theme.space.screen,
  },
  dock: {
    ...readableColumn,
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
}));
