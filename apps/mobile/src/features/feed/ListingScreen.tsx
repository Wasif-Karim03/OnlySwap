import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ReportSheet } from '@/components/ReportSheet';
import { Sheet } from '@/components/Sheet';
import { SkeletonCard } from '@/components/Skeleton';
import { Icon } from '@/components/icons/Icon';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { useLayout } from '@/theme/layout';
import {
  campus as campusCopy,
  deal as dealCopy,
  feed as copy,
  nav as navCopy,
  sell as sellCopy,
  system as systemCopy,
} from '@/strings';

import { FoodTimeTag } from '../campus/CampusCards';
import { canAnswer } from '../campus/logic';
import { sellApi } from '../sell/api';
import { answerWanted, getDraftStore } from '../sell/draft';
import {
  listingLink,
  mediaUrl,
  priceLabel,
  sortSpots,
  type Availability,
  type Spot,
} from '../sell/logic';
import { feedApi, type FeedApi } from './api';
import {
  isVisible,
  metaLine,
  sellerName,
  yearLabel,
  type FeedItem,
  type ListingResult,
} from './logic';

export const listingKey = (id: string) => ['listing', id] as const;

/**
 * B02 Listing (P6-LIST-01) with the options sheet and report (B03, P6-LIST-02).
 * Buyer, owner, on hold ("Tell me"), sold, and gone / blocked / other campus.
 */
export function ListingScreen({
  id,
  api = feedApi,
  spots = () => sellApi.spots(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  share = (content) => Share.share(content),
  now = () => new Date(),
  draftStore = getDraftStore(),
}: {
  id: string;
  api?: FeedApi;
  spots?: () => Promise<Spot[]>;
  mediaBase?: () => string;
  site?: () => string;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  now?: () => Date;
  draftStore?: ReturnType<typeof getDraftStore>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  // iPad, wide window: photos on the left, details on the right.
  const wide = useLayout().wide;
  const query = useQuery({ queryKey: listingKey(id), queryFn: () => api.getListing(id) });
  const spotsQuery = useQuery({ queryKey: ['spots'], queryFn: spots, staleTime: 3600_000 });
  const [options, setOptions] = useState(false);
  const [reporting, setReporting] = useState(false);
  const viewed = useRef(false);
  const data = query.data;

  useEffect(() => {
    if (data?.access === 'buyer' && !viewed.current) {
      viewed.current = true;
      api.recordView(id).catch(() => {});
      track('listing_viewed', { source: 'other' });
    }
  }, [data, api, id]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/discover'));

  if (query.isPending) {
    return (
      <View style={styles.root} testID="screen-listing-loading">
        <NavBar onLeading={leave} />
        <View style={styles.pad}>
          <SkeletonCard />
        </View>
      </View>
    );
  }
  if (query.isError || !data) {
    return (
      <View style={styles.root} testID="screen-listing-error">
        <NavBar onLeading={leave} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  }
  if (!isVisible(data)) {
    return <Unavailable result={data} onBack={leave} />;
  }

  const item = data;
  const owner = item.access === 'owner';
  const base = mediaBase();
  // Food and Wanted posts (R1.1) never take offers: no price, no offer button.
  const campusKind = item.kind === 'food' || item.kind === 'wanted';
  const price =
    item.kind === 'food'
      ? campusCopy.listingFood
      : item.kind === 'wanted'
        ? campusCopy.listingWanted
        : priceLabel(item.kind, item.price_cents, copy.free);
  const setItem = (patch: Partial<FeedItem>) =>
    qc.setQueryData<ListingResult>(listingKey(id), (old) =>
      old && isVisible(old) ? { ...old, ...patch } : old,
    );

  const toggleSave = async () => {
    const was = item.saved;
    setItem({ saved: !was });
    try {
      const n = was ? await api.unsave(id) : await api.save(id);
      setItem({ saved: !was, save_count: n });
    } catch {
      setItem({ saved: was });
      useToastStore.getState().show('error', copy.saveFailed);
    }
  };

  const watch = async () => {
    setItem({ watching: true });
    try {
      await api.watch(id);
    } catch {
      setItem({ watching: false });
    }
  };

  const onShare = async () => {
    const url = listingLink(site(), id);
    const text = fill(copy.shareMessage, { title: item.title, price });
    track('share_tapped', { surface: 'listing' });
    await share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text} ${url}` });
  };

  const hide = async () => {
    setOptions(false);
    try {
      await api.hide(id);
      useToastStore.getState().show('info', copy.notInterestedDone);
      leave();
    } catch {
      useToastStore.getState().show('error', copy.hideFailed);
    }
  };

  const chosenSpots = sortSpots(spotsQuery.data ?? []).filter((s) =>
    item.meet_spot_ids.includes(s.id),
  );
  const statusTag =
    item.status === 'hold'
      ? copy.onHold
      : item.status === 'sold'
        ? copy.sold
        : item.status === 'held_review'
          ? copy.inReview
          : null;

  const statusTone = item.status === 'sold' ? 'ink3' : 'amber';
  const sellerAvatar = item.seller.avatar_path ? mediaUrl(base, item.seller.avatar_path) : null;
  const sellerMeta = yearLabel(item.seller.year) ?? copy.sellerTitle;
  const meetupNote = chosenSpots.length === 0 && !item.meet_note;

  let cta: ReactNode = null;
  if (!owner) {
    if (item.status === 'hold') {
      cta = (
        <Button
          label={item.watching ? copy.watching : copy.tellMe}
          variant="dark"
          disabled={item.watching}
          onPress={watch}
          testID="listing-watch"
        />
      );
    } else if (item.status === 'sold') {
      cta = <Button label={copy.sold} disabled onPress={() => {}} />;
    } else if (item.kind === 'wanted') {
      cta = canAnswer(item) ? (
        <Button
          label={campusCopy.iHaveThis}
          variant="dark"
          accessibilityHint={fill(campusCopy.iHaveThisLabel, { title: item.title })}
          onPress={() => {
            answerWanted(draftStore, item);
            router.push('/sell');
          }}
          testID="listing-i-have-this"
        />
      ) : null;
    } else if (item.kind !== 'food') {
      cta = (
        <Button
          label={item.kind === 'free' ? copy.askForIt : copy.offer}
          variant="dark"
          onPress={() => router.push({ pathname: '/listing/[id]/offer', params: { id } })}
          testID="listing-offer"
        />
      );
    }
  }
  const docked = owner || cta !== null;

  return (
    <View style={styles.root} testID="screen-listing">
      <ScrollView
        contentContainerStyle={[
          docked ? styles.scroll : styles.scrollBare,
          wide ? styles.scrollWide : null,
        ]}
      >
        <View
          style={wide ? styles.photoPane : null}
          testID={wide ? 'listing-photo-pane' : undefined}
        >
          <PhotoCarousel
            photos={item.photos.map((p, i) => ({
              key: `${p.path}-${i}`,
              source: mediaUrl(base, p.path),
              blurhash: p.blurhash,
            }))}
            label={item.title}
            aspectRatio={1}
            onPressPhoto={(i) =>
              router.push({ pathname: '/listing/[id]/photos', params: { id, i: String(i) } })
            }
            testID="listing-photos"
          />
        </View>
        <View style={[styles.body, wide ? styles.infoPane : null]}>
          <View style={styles.priceRow}>
            <Text variant="price" style={styles.flex}>
              {price}
            </Text>
            {statusTag ? (
              <Text variant="label" tone={statusTone} testID="listing-status">
                {statusTag}
              </Text>
            ) : null}
            {item.kind === 'food' && !statusTag ? (
              <FoodTimeTag expiresAt={item.expires_at} now={now} />
            ) : null}
          </View>
          <Text variant="heading" accessibilityRole="header">
            {item.title}
          </Text>
          <Text variant="meta" tone="ink2">
            {metaLine(item, now())}
          </Text>
          {campusKind ? (
            <Text variant="body" tone="ink2" testID="listing-campus-note">
              {item.kind === 'food'
                ? campusCopy.listingFoodBody
                : owner
                  ? campusCopy.wantedOwnBody
                  : campusCopy.listingWantedBody}
            </Text>
          ) : null}
          {!item.open_to_offers && item.kind === 'sale' ? (
            <Text variant="meta" tone="ink2">
              {copy.notOpenToOffers}
            </Text>
          ) : null}

          {owner && item.status === 'held_review' ? (
            <Banner kind="info" message={systemCopy.underReview} />
          ) : null}
          {owner ? (
            <View style={styles.stats} testID="listing-owner-stats">
              <Text variant="label" tone="ink2">
                {fill(copy.statViews, { n: item.view_count })}
              </Text>
              <Text variant="label" tone="ink2">
                {fill(copy.statSaves, { n: item.save_count })}
              </Text>
              <Text variant="label" tone="ink2">
                {fill(copy.statOffers, { n: item.offer_count })}
              </Text>
            </View>
          ) : null}

          {item.status === 'hold' && !owner ? (
            <View style={styles.hold} testID="listing-hold">
              <Text variant="bodyStrong" tone="amber">
                {copy.onHold}
              </Text>
              <Text variant="body" tone="ink2">
                {copy.onHoldBody}
              </Text>
            </View>
          ) : null}

          {/* Seller and meetup spots as plain rows in one bordered list (DEC 90 mock screen 7). */}
          <View style={styles.list}>
            {!owner ? (
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={`${copy.sellerTitle}: ${sellerName(item)}`}
                onPress={() =>
                  item.seller.id
                    ? router.push({ pathname: '/user/[id]', params: { id: item.seller.id } })
                    : undefined
                }
                testID="listing-seller"
              >
                <View style={styles.listRow}>
                  <Avatar name={sellerName(item)} uri={sellerAvatar} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {sellerName(item)}
                    </Text>
                    <Text variant="meta" tone="ink3">
                      {sellerMeta}
                    </Text>
                  </View>
                  <Icon name="chev" size={18} tone="ink3" />
                </View>
              </Tappable>
            ) : null}
            {meetupNote ? (
              <View style={[styles.listRow, !owner ? styles.divider : null]}>
                <View style={styles.glyph}>
                  <Icon name="pin" size={22} tone="sky" />
                </View>
                <Text variant="body" tone="ink2" style={styles.flex}>
                  {copy.meetupDecide}
                </Text>
              </View>
            ) : null}
            {chosenSpots.map((s, i) => (
              <View
                key={s.id}
                style={[styles.listRow, !owner || i > 0 ? styles.divider : null]}
                accessible
                accessibilityLabel={`${s.name}, ${s.police ? sellCopy.police : copy.meetupSpot}`}
              >
                <View style={styles.glyph}>
                  <Icon name="pin" size={22} tone="sky" />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{s.name}</Text>
                  <Text variant="meta" tone="ink3">
                    {s.police ? sellCopy.police : copy.meetupSpot}
                  </Text>
                </View>
              </View>
            ))}
            {item.meet_note ? (
              <View
                style={[styles.listRow, !owner || chosenSpots.length > 0 ? styles.divider : null]}
              >
                <View style={styles.glyph}>
                  <Icon name="pin" size={22} tone="sky" />
                </View>
                <Text variant="body" style={styles.flex}>
                  {item.meet_note}
                </Text>
              </View>
            ) : null}
          </View>
          {item.availability.length > 0 ? (
            <Text variant="meta" tone="ink2">
              {`${copy.availabilityTitle}: ${item.availability
                .map((a) => sellCopy.availability[a as Availability] ?? a)
                .join(', ')}`}
            </Text>
          ) : null}

          {item.description ? (
            <Text
              variant="body"
              accessibilityLabel={`${copy.descriptionTitle}. ${item.description}`}
              style={styles.description}
            >
              {item.description}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* White circles over the photo (DEC 90 mock screen 7): back, share, save, more. */}
      <View style={styles.top(wide)} pointerEvents="box-none">
        <IconButton
          icon="back"
          filled
          surface="card"
          accessibilityLabel={navCopy.back}
          onPress={leave}
        />
        <View style={styles.row}>
          <IconButton
            icon="share"
            filled
            surface="card"
            accessibilityLabel={copy.share}
            onPress={onShare}
          />
          {!owner ? (
            <IconButton
              icon="heart"
              filled
              surface={item.saved ? 'accent' : 'card'}
              accessibilityLabel={item.saved ? copy.saved : copy.save}
              onPress={toggleSave}
              testID="listing-save"
            />
          ) : null}
          {!owner ? (
            <IconButton
              icon="more"
              filled
              surface="card"
              accessibilityLabel={copy.more}
              onPress={() => setOptions(true)}
              testID="listing-more"
            />
          ) : null}
        </View>
      </View>

      {docked ? (
        <View style={styles.dock}>
          {owner ? (
            <>
              <View style={styles.flex}>
                <Button
                  label={copy.edit}
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/listing/[id]/edit', params: { id } })}
                />
              </View>
              {!campusKind && (item.status === 'active' || item.status === 'hold') ? (
                <View style={styles.flex}>
                  <Button
                    label={dealCopy.markSold}
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/listing/[id]/sold', params: { id } })}
                    testID="listing-mark-sold"
                  />
                </View>
              ) : null}
              {campusKind ? null : (
                <View style={styles.flex}>
                  <Button
                    label={copy.seeOffers}
                    variant="dark"
                    onPress={() =>
                      router.push({ pathname: '/listing/[id]/offers', params: { id } })
                    }
                  />
                </View>
              )}
            </>
          ) : (
            <View style={styles.flex}>{cta}</View>
          )}
        </View>
      ) : null}

      <Sheet
        visible={options}
        onClose={() => setOptions(false)}
        title={copy.optionsTitle}
        testID="listing-options"
      >
        <GroupedList>
          <ListRow label={copy.notInterested} icon="eye" onPress={hide} />
          <ListRow
            label={copy.reportListing}
            icon="flag"
            destructive
            onPress={() => {
              setOptions(false);
              setReporting(true);
            }}
          />
        </GroupedList>
      </Sheet>
      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        target="listing"
        onSubmit={async ({ reason, details }) => {
          await api.reportListing(id, reason, details);
          track('report_submitted', { target_type: 'listing' });
        }}
        testID="listing-report"
      />
    </View>
  );
}

function Unavailable({ result, onBack }: { result: { access: string }; onBack: () => void }) {
  const router = useRouter();
  const [title, body] =
    result.access === 'blocked'
      ? [copy.blockedTitle, copy.blockedBody]
      : result.access === 'other_campus'
        ? [copy.otherCampusTitle, copy.otherCampusBody]
        : [copy.goneTitle, copy.goneBody];
  return (
    <View style={styles.root} testID={`screen-listing-${result.access}`}>
      <NavBar onLeading={onBack} />
      <EmptyState
        icon={result.access === 'blocked' ? 'ban' : 'tag'}
        title={title}
        body={body}
        action={{ label: copy.backToDiscover, onPress: () => router.replace('/discover') }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  pad: { flex: 1, padding: theme.space.screen },
  scroll: { paddingBottom: theme.size.buttonL + theme.space['2xl'] * 2 },
  scrollBare: { paddingBottom: theme.space['2xl'] + rt.insets.bottom },
  scrollWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.xl,
    paddingTop: rt.insets.top + theme.size.navBar + theme.space.sm,
    paddingHorizontal: theme.space.screen,
  },
  photoPane: { flex: 1, borderRadius: theme.radius.card, overflow: 'hidden' },
  infoPane: { flex: 1, paddingHorizontal: 0, paddingTop: 0 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: theme.space.sm },
  top: (wide: boolean) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: rt.insets.top + theme.space.sm,
    paddingHorizontal: wide ? theme.space.screen : theme.space.md,
  }),
  body: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.lg,
    gap: theme.space.xs,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.lg, marginTop: theme.space.sm },
  hold: { gap: theme.space.xs, marginTop: theme.space.md },
  list: {
    marginTop: theme.space.lg,
    marginBottom: theme.space.sm,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    overflow: 'hidden',
  },
  listRow: {
    minHeight: theme.space.rowMin + theme.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md + theme.space.xs,
    paddingVertical: theme.space.sm,
  },
  divider: { borderTopWidth: 1, borderColor: theme.colors.line },
  glyph: { width: theme.size.avatarM, alignItems: 'center' },
  description: { marginTop: theme.space.md },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderColor: theme.colors.line,
  },
}));
