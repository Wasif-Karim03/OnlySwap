import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { OptionRow } from '@/components/OptionRow';
import { SkeletonList } from '@/components/Skeleton';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { deal as copy } from '@/strings/en';

import { useSession } from '../auth/useSession';
import { chatApi, type ChatApi } from '../chat/api';
import { chatKey } from '../chat/ChatScreen';
import { listingKey } from '../feed/ListingScreen';
import { offersApi, type OffersApi } from '../offers/api';
import { profileApi, type ProfileApi } from '../profiles/api';
import { dealsApi, maybeAskForReview, type DealsApi } from './api';
import { BAD_TAGS, GOOD_TAGS, ratePhase, type DealOutcome, type RatingTag } from './logic';

/** E07 Did it sell? (P8-DEAL-02; board E16). */
export function DidItSellScreen({
  chatId,
  api = dealsApi,
  chats = chatApi,
}: {
  chatId: string;
  api?: DealsApi;
  chats?: Pick<ChatApi, 'chat'>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const info = useQuery({ queryKey: chatKey(chatId), queryFn: () => chats.chat(chatId) });
  const [confirmFell, setConfirmFell] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/chat/[id]', params: { id: chatId } });

  const answer = async (outcome: DealOutcome) => {
    setBusy(true);
    setError(null);
    try {
      await api.confirm(chatId, outcome);
      void qc.invalidateQueries({ queryKey: chatKey(chatId) });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      if (info.data?.listing_id)
        void qc.invalidateQueries({ queryKey: listingKey(info.data.listing_id) });
      if (outcome === 'done')
        router.replace({ pathname: '/deal/[chatId]/rate', params: { chatId } });
      else close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const seller = info.data?.role === 'seller';
  return (
    <View style={styles.root} testID="screen-did-it-sell">
      <NavBar
        leading="close"
        onLeading={close}
        title={seller ? copy.didItSellTitle : copy.didYouGetItTitle}
      />
      <View style={styles.body}>
        {info.data ? (
          <Text variant="heading" accessibilityRole="header">
            {info.data.listing_title}
          </Text>
        ) : null}
        <Button
          label={copy.done}
          loading={busy}
          onPress={() => answer('done')}
          testID="deal-done"
        />
        <Button
          label={copy.notYet}
          variant="secondary"
          onPress={() => answer('not_yet')}
          testID="deal-not-yet"
        />
        <Button
          label={copy.fellThrough}
          variant="text"
          onPress={() => setConfirmFell(true)}
          testID="deal-fell-through"
        />
        {error ? <Banner kind="error" message={error} /> : null}
      </View>
      <ConfirmDialog
        visible={confirmFell}
        title={copy.fellThroughTitle}
        message={copy.fellThroughBody}
        confirmLabel={copy.fellThroughConfirm}
        destructive
        onConfirm={async () => {
          setConfirmFell(false);
          await answer('fell_through');
        }}
        onCancel={() => setConfirmFell(false)}
      />
    </View>
  );
}

/** F07 Mark sold: pick the buyer or "someone not on OnlySwap" (P8-DEAL-02). */
export function MarkSoldScreen({
  listingId,
  api = dealsApi,
  offers = offersApi,
}: {
  listingId: string;
  api?: DealsApi;
  offers?: Pick<OffersApi, 'listingOffers'>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['listing-offers', listingId],
    queryFn: () => offers.listingOffers(listingId),
  });
  const [buyer, setBuyer] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/listing/[id]', params: { id: listingId } });

  const buyers = (q.data ?? [])
    .filter((o) => o.status === 'accepted' && o.other)
    .map((o) => ({ id: o.other!.id, name: o.other!.display_name ?? '' }));

  const submit = async () => {
    if (buyer === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await api.markSold(listingId, buyer);
      void qc.invalidateQueries({ queryKey: listingKey(listingId) });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="screen-mark-sold">
      <NavBar leading="close" onLeading={close} title={copy.markSoldTitle} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="body" tone="ink2">
          {copy.markSoldBody}
        </Text>
        {q.isPending ? <SkeletonList rows={2} /> : null}
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} layout="inline" />
        ) : null}
        {buyers.map((b) => (
          <OptionRow
            key={b.id}
            kind="radio"
            label={b.name}
            selected={buyer === b.id}
            onPress={() => setBuyer(b.id)}
          />
        ))}
        <OptionRow
          kind="radio"
          label={copy.someoneElse}
          selected={buyer === null}
          onPress={() => setBuyer(null)}
        />
        {error ? <Banner kind="error" message={error} /> : null}
      </ScrollView>
      <View style={styles.dock}>
        <Button
          label={copy.markSold}
          disabled={buyer === undefined}
          loading={busy}
          onPress={submit}
          testID="mark-sold"
        />
      </View>
    </View>
  );
}

/** E08 Rate the swap (P8-DEAL-02; E17 submit, E18 waiting and revealed). */
export function RateScreen({
  chatId,
  api = dealsApi,
  chats = chatApi,
  people = profileApi,
  askForReview = maybeAskForReview,
}: {
  chatId: string;
  api?: DealsApi;
  chats?: Pick<ChatApi, 'chat'>;
  people?: Pick<ProfileApi, 'getProfile'>;
  askForReview?: typeof maybeAskForReview;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const info = useQuery({ queryKey: chatKey(chatId), queryFn: () => chats.chat(chatId) });
  const rating = useQuery({ queryKey: ['rating', chatId], queryFn: () => api.myRating(chatId) });
  const [thumbs, setThumbs] = useState<boolean | null>(null);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/chat/[id]', params: { id: chatId } });

  if (rating.isPending || info.isPending) {
    return (
      <View style={styles.root}>
        <NavBar leading="close" onLeading={close} title={copy.rateTitle} />
        <SkeletonList rows={3} />
      </View>
    );
  }
  if (rating.isError) {
    return (
      <View style={styles.root}>
        <NavBar leading="close" onLeading={close} title={copy.rateTitle} />
        <ErrorState error={rating.error} onRetry={() => rating.refetch()} />
      </View>
    );
  }
  const name = info.data?.other?.display_name ?? '';
  const phase = ratePhase(rating.data);

  const submit = async () => {
    if (thumbs === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.rate(chatId, thumbs, tags, comment);
      await qc.invalidateQueries({ queryKey: ['rating', chatId] });
      const me = session.status === 'signedIn' ? session.session.user.id : null;
      if (me && thumbs) {
        const p = await people.getProfile(me).catch(() => null);
        if (p && 'swaps_count' in p && p.created_at) {
          void askForReview({
            swaps: p.swaps_count,
            accountCreatedAt: new Date(p.created_at),
            lastOutcome: 'done',
          });
        }
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (phase !== 'submit') {
    const r = rating.data!;
    return (
      <View style={styles.root} testID={`screen-rate-${phase}`}>
        <NavBar leading="close" onLeading={close} title={copy.rateTitle} />
        <View style={styles.body}>
          <SuccessCheck visible accessibilityLabel={copy.waitingTitle} />
          <Text variant="title" accessibilityRole="header">
            {phase === 'waiting' ? copy.waitingTitle : copy.revealedTitle}
          </Text>
          {phase === 'waiting' ? (
            <Text variant="body" tone="ink2">
              {copy.waitingBody}
            </Text>
          ) : (
            <View style={styles.reveal}>
              <Text variant="bodyStrong">{fill(copy.theirRating, { name })}</Text>
              <Text variant="body">
                {[
                  r.theirs!.thumbs_up ? copy.thumbsUp : copy.thumbsDown,
                  ...r.theirs!.tags.map((t) => copy.tags[t]),
                ].join(' · ')}
              </Text>
              {r.theirs!.comment ? <Text variant="body">{r.theirs!.comment}</Text> : null}
            </View>
          )}
          <Button label={copy.done_} variant="secondary" onPress={close} />
        </View>
      </View>
    );
  }

  const tagOptions = thumbs === false ? BAD_TAGS : GOOD_TAGS;
  return (
    <View style={styles.root} testID="screen-rate-submit">
      <NavBar leading="close" onLeading={close} title={copy.rateTitle} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="heading" accessibilityRole="header">
          {fill(copy.rateQuestion, { name })}
        </Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              label={copy.thumbsUp}
              variant={thumbs === true ? 'dark' : 'secondary'}
              onPress={() => {
                setThumbs(true);
                setTags([]);
              }}
              testID="rate-up"
            />
          </View>
          <View style={styles.flex}>
            <Button
              label={copy.thumbsDown}
              variant={thumbs === false ? 'dark' : 'secondary'}
              onPress={() => {
                setThumbs(false);
                setTags([]);
              }}
              testID="rate-down"
            />
          </View>
        </View>
        {thumbs !== null ? (
          <>
            <Text variant="label">{copy.tagsLabel}</Text>
            <View style={styles.chips}>
              {tagOptions.map((t) => (
                <Chip
                  key={t}
                  label={copy.tags[t]}
                  selected={tags.includes(t)}
                  onPress={() =>
                    setTags((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                />
              ))}
            </View>
            <TextArea
              label={copy.commentLabel}
              placeholder={copy.commentPlaceholder}
              value={comment}
              onChangeText={setComment}
              maxLength={200}
            />
          </>
        ) : null}
        {error ? <Banner kind="error" message={error} /> : null}
      </ScrollView>
      <View style={styles.dock}>
        <Button
          label={copy.submit}
          disabled={thumbs === null}
          loading={busy}
          onPress={submit}
          testID="rate-submit"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.md },
  row: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  reveal: {
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  dock: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
}));
