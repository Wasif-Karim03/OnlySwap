import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track as trackActivity, type ActivitySource } from '@/lib/activity';
import { track, type AnalyticsEvents } from '@/lib/analytics';
import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { Material } from '@/components/Material';
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
  safety as safetyCopy,
  sell as sellCopy,
  system as systemCopy,
} from '@/strings';

import { FoodTimeTag } from '../campus/CampusCards';
import { canAnswer, eventLabel, linkHost } from '../campus/logic';
import { AppealSheet, type AppealReason } from '../safety/AppealSheet';
import { safetyApi } from '../safety/api';
import { sellApi } from '../sell/api';
import type { getDraftStore } from '../sell/draft';
import { wantedChatApi, type WantedChatApi } from '../campus/api';
import {
  listingLink,
  mediaUrl,
  priceLabel,
  sortSpots,
  type Availability,
  type Spot,
} from '../sell/logic';
import { feedApi, moreApi, type FeedApi, type MoreApi } from './api';
import { ListingStrip } from './ListingStrip';
import { rememberViewed, viewedStorage, type ViewedStorage } from './recent';
import {
  isVisible,
  metaLine,
  sellerName,
  trustLine,
  yearLabel,
  type FeedItem,
  type ListingResult,
} from './logic';

export const listingKey = (id: string) => ['listing', id] as const;

/**
 * B02 Listing (P6-LIST-01) with the options sheet and report (B03, P6-LIST-02).
 * Buyer, owner, on hold ("Tell me"), sold, and gone / blocked / other campus.
 */
/** PostHog's coarser source enum for the same `from` (PRD §5.4). */
function analyticsSource(from?: ActivitySource): AnalyticsEvents['listing_viewed']['source'] {
  if (from === 'discover') return 'feed';
  if (from === 'campus' || !from) return 'other';
  return from;
}

export function ListingScreen({
  id,
  from,
  api = feedApi,
  spots = () => sellApi.spots(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  share = (content) => Share.share(content),
  openUrl = (url) => Linking.openURL(url),
  now = () => new Date(),
  wantedChat = wantedChatApi,
  appeal = (listingId, reason, body) => safetyApi.appeal('listing', listingId, reason, body),
  more = moreApi,
  viewedStore = viewedStorage,
}: {
  id: string;
  /** Where it was opened from (route param `from`), for the activity event (DEC 93). */
  from?: ActivitySource;
  api?: FeedApi;
  spots?: () => Promise<Spot[]>;
  mediaBase?: () => string;
  site?: () => string;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  /** Opens a news post's link (DEC 98). */
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
  /** Unused since DEC 149; kept so callers still compile. */
  draftStore?: ReturnType<typeof getDraftStore>;
  wantedChat?: WantedChatApi;
  /** Appeals an admin removal (create_appeal 'listing', DEC 99). */
  appeal?: (listingId: string, reason: AppealReason, body: string) => Promise<void>;
  /** More like this (DEC 128). */
  more?: MoreApi;
  /** Recently viewed ids on this phone (DEC 128). */
  viewedStore?: ViewedStorage;
}) {
  const router = useRouter();
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealed, setAppealed] = useState(false);
  const qc = useQueryClient();
  // iPad, wide window: photos on the left, details on the right.
  const wide = useLayout().wide;
  const query = useQuery({ queryKey: listingKey(id), queryFn: () => api.getListing(id) });
  const spotsQuery = useQuery({ queryKey: ['spots'], queryFn: spots, staleTime: 3600_000 });
  const [options, setOptions] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState(false);
  const [reporting, setReporting] = useState(false);
  const viewed = useRef(false);
  const data = query.data;
  const shoppable = data?.access === 'buyer' && (data.kind === 'sale' || data.kind === 'free');
  const similar = useQuery({
    queryKey: ['similar', id],
    queryFn: () => more.similar(id),
    enabled: shoppable,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data?.access === 'buyer' && !viewed.current) {
      viewed.current = true;
      api.recordView(id).catch(() => {});
      if (data.kind === 'sale' || data.kind === 'free') rememberViewed(id, viewedStore);
      track('listing_viewed', { source: analyticsSource(from) });
    }
  }, [data, api, id, from, viewedStore]);

  // listing_viewed activity (DEC 93): one event, stamped when the listing
  // opened, with the time on the page, sent when the student leaves it or the
  // app goes to the background. Buyers only, like the view count.
  const buyer = data?.access === 'buyer';
  useEffect(() => {
    if (!buyer) return;
    const opened = Date.now();
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      trackActivity('listing_viewed', {
        listingId: id,
        source: from,
        dwellMs: Date.now() - opened,
        at: new Date(opened),
      });
    };
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') send();
    });
    return () => {
      sub.remove();
      send();
    };
  }, [buyer, id, from]);

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
  // Food, Wanted (R1.1) and news (DEC 98) never take offers: no price, no offer button.
  const news = item.kind === 'news';
  const campusKind = item.kind === 'food' || item.kind === 'wanted' || news;
  const price =
    item.kind === 'food'
      ? campusCopy.listingFood
      : item.kind === 'wanted'
        ? campusCopy.listingWanted
        : news
          ? campusCopy.listingNews
          : priceLabel(item.kind, item.price_cents, copy.free);
  const link = news ? (item.link_url ?? null) : null;
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
      if (was) trackActivity('unsaved', { listingId: id, source: from });
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
    const text = news ? item.title : fill(copy.shareMessage, { title: item.title, price });
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
          : item.status === 'removed'
            ? copy.removed
            : null;

  const sellerAvatar = item.seller.avatar_path ? mediaUrl(base, item.seller.avatar_path) : null;
  const sellerMeta = yearLabel(item.seller.year) ?? (news ? '' : copy.sellerTitle);
  // A news post's place is in meet_note; it has no meetup to plan.
  const meetupNote = !news && chosenSpots.length === 0 && !item.meet_note;

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
      // Sold: no dock; the word beside the price says it (DESIGN_REVIEW 3.02 B02).
      cta = null;
    } else if (item.kind === 'wanted') {
      cta = canAnswer(item) ? (
        <Button
          label={campusCopy.iHaveThis}
          variant="dark"
          accessibilityHint={fill(campusCopy.iHaveThisLabel, { title: item.title })}
          onPress={async () => {
            // DEC 149: straight into a chat with the asker.
            try {
              const { chat_id } = await wantedChat.start(item.id, campusCopy.iHaveThisMessage);
              router.push({ pathname: '/chat/[id]', params: { id: chat_id } });
            } catch {
              useToastStore.getState().show('error', campusCopy.iHaveThisFailed);
            }
          }}
          testID="listing-i-have-this"
        />
      ) : null;
    } else if (news) {
      cta = link ? (
        <Button
          label={campusCopy.openLink}
          variant="dark"
          accessibilityHint={linkHost(link)}
          onPress={() => void openUrl(link)}
          testID="listing-open-link"
        />
      ) : null;
    } else if (item.seller.away && (item.kind === 'sale' || item.kind === 'free')) {
      // Away: the dock keeps only the heart; the note under the meta explains why.
      cta = null;
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
  // Buyers keep Save in the thumb zone whenever the listing isn't sold.
  const buyerDock = !owner && item.status !== 'sold';
  const ownerDock = owner && !campusKind;
  const docked = buyerDock || ownerDock;
  const firm = !item.open_to_offers && item.kind === 'sale';
  const meta = [metaLine(item, now()), firm ? copy.notOpenToOffers : null]
    .filter(Boolean)
    .join(copy.metaSeparator);
  const commentsRow = !owner && item.comments_enabled === true;
  const openStats = () => router.push({ pathname: '/listing/[id]/stats', params: { id } });

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
              <Text variant="label" tone="ink2" testID="listing-status">
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
            {meta}
          </Text>
          {item.status === 'hold' && !owner ? (
            <Text variant="body" tone="ink2" testID="listing-hold">
              {copy.onHoldBody}
            </Text>
          ) : null}
          {!owner && item.seller.away && (item.kind === 'sale' || item.kind === 'free') ? (
            <Text variant="body" tone="ink2" testID="listing-away-note">
              {fill(copy.sellerAwayBody, { name: sellerName(item) })}
            </Text>
          ) : null}
          {news && item.event_at ? (
            <View style={styles.event} testID="listing-event">
              <Icon name="cal" size={18} tone="sky" />
              <Text variant="bodyStrong" tone="sky" style={styles.flex}>
                {eventLabel(item.event_at, now())}
              </Text>
            </View>
          ) : null}
          {link ? (
            <Text variant="meta" tone="ink2" numberOfLines={1} testID="listing-link-host">
              {linkHost(link)}
            </Text>
          ) : null}
          {campusKind && !news ? (
            <Text variant="body" tone="ink2" testID="listing-campus-note">
              {item.kind === 'food'
                ? campusCopy.listingFoodBody
                : owner
                  ? campusCopy.wantedOwnBody
                  : campusCopy.listingWantedBody}
            </Text>
          ) : null}

          {owner && item.status === 'held_review' ? (
            <Banner kind="info" message={systemCopy.underReview} />
          ) : null}
          {owner && item.status === 'removed' ? (
            <Banner
              kind="warning"
              message={
                item.removed_reason
                  ? fill(systemCopy.removedByAdmin, { reason: item.removed_reason })
                  : systemCopy.removedByAdminNoReason
              }
            />
          ) : null}
          {owner && item.status === 'removed' ? (
            appealed ? (
              <Text variant="meta" tone="ink2" testID="listing-appealed">
                {safetyCopy.appealed}
              </Text>
            ) : (
              <Button
                label={safetyCopy.appeal}
                variant="secondary"
                onPress={() => setAppealOpen(true)}
                testID="listing-appeal"
              />
            )
          ) : null}
          {owner ? (
            <View style={styles.list} testID="listing-owner-stats">
              <LinkRow
                label={copy.statsRow}
                values={[
                  fill(copy.statViews, { n: item.view_count }),
                  fill(copy.statSaves, { n: item.save_count }),
                  fill(copy.statOffers, { n: item.offer_count }),
                ]}
                onPress={openStats}
                testID="listing-stats"
              />
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
                    {sellerMeta ? (
                      <Text variant="meta" tone="ink3">
                        {sellerMeta}
                      </Text>
                    ) : null}
                    <View style={styles.trust} testID="listing-trust">
                      <Icon name="shield" size={14} tone="green" />
                      <Text variant="meta" tone="ink2" style={styles.flex}>
                        {trustLine(item.seller)}
                      </Text>
                    </View>
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
            {commentsRow ? (
              <View style={styles.divider}>
                <LinkRow
                  label={copy.comments}
                  values={[String(item.comment_count ?? 0)]}
                  onPress={() =>
                    router.push({ pathname: '/listing/[id]/comments', params: { id } })
                  }
                  testID="listing-comments"
                />
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

          {shoppable ? (
            <ListingStrip
              title={copy.moreLikeThis}
              items={similar.data ?? []}
              mediaBase={base}
              onOpen={(next) => router.push({ pathname: '/listing/[id]', params: { id: next } })}
              testID="listing-more-like-this"
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Quiet chrome over the photo: back, share and more. Save lives in the dock (thumb zone). */}
      <View style={styles.top(wide)} pointerEvents="box-none">
        <PhotoButton>
          <IconButton
            icon="back"
            tone="onPhoto"
            accessibilityLabel={navCopy.back}
            onPress={leave}
          />
        </PhotoButton>
        <View style={styles.row}>
          <PhotoButton>
            <IconButton
              icon="share"
              tone="onPhoto"
              accessibilityLabel={copy.share}
              onPress={onShare}
            />
          </PhotoButton>
          {/* A sold listing has no dock, so a buyer un-saves it up here. */}
          {!owner && !buyerDock ? (
            <IconButton
              icon="heart"
              filled
              surface={item.saved ? 'accent' : 'card'}
              accessibilityLabel={item.saved ? copy.saved : copy.save}
              onPress={toggleSave}
              testID="listing-save"
            />
          ) : null}
          <PhotoButton>
            <IconButton
              icon="more"
              tone="onPhoto"
              accessibilityLabel={copy.more}
              onPress={() => (owner ? setOwnerOptions(true) : setOptions(true))}
              testID="listing-more"
            />
          </PhotoButton>
        </View>
      </View>

      {docked ? (
        <View style={styles.dock}>
          {owner ? (
            <>
              {item.status === 'active' || item.status === 'hold' ? (
                <View style={styles.flex}>
                  <Button
                    label={dealCopy.markSold}
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/listing/[id]/sold', params: { id } })}
                    testID="listing-mark-sold"
                  />
                </View>
              ) : null}
              <View style={styles.flex}>
                <Button
                  label={copy.seeOffers}
                  variant="dark"
                  onPress={() => router.push({ pathname: '/listing/[id]/offers', params: { id } })}
                />
              </View>
            </>
          ) : (
            <>
              <IconButton
                icon="heart"
                filled
                surface={item.saved ? 'accent' : 'card'}
                accessibilityLabel={item.saved ? copy.saved : copy.save}
                onPress={toggleSave}
                testID="listing-save"
              />
              {cta ? <View style={styles.flex}>{cta}</View> : null}
            </>
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
      <Sheet
        visible={ownerOptions}
        onClose={() => setOwnerOptions(false)}
        title={copy.optionsTitle}
        testID="listing-owner-options"
      >
        <GroupedList>
          <ListRow
            label={copy.edit}
            icon="edit"
            onPress={() => {
              setOwnerOptions(false);
              router.push({ pathname: '/listing/[id]/edit', params: { id } });
            }}
          />
          <ListRow
            label={copy.statsRow}
            icon="chart"
            onPress={() => {
              setOwnerOptions(false);
              openStats();
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
      <AppealSheet
        visible={appealOpen}
        onClose={() => setAppealOpen(false)}
        onSend={(reason, body) => appeal(id, reason, body)}
        onSent={() => {
          setAppealOpen(false);
          setAppealed(true);
          useToastStore.getState().show('success', safetyCopy.appealed);
        }}
        testID="listing-appeal-sheet"
      />
    </View>
  );
}

/**
 * A row in the listing's hairline list that opens another screen: label on
 * the left, its values in ink2 on the right, then a chevron (Comments, Stats).
 */
function LinkRow({
  label,
  values,
  onPress,
  testID,
}: {
  label: string;
  values: string[];
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={[label, ...values].join(', ')}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.listRow}>
        <Text variant="body" style={styles.flex}>
          {label}
        </Text>
        {/* One Text per value so each wraps whole at large text sizes. */}
        <View style={styles.values}>
          {values.map((v, i) => (
            <View key={`${i}-${v}`} style={styles.valueItem}>
              {i > 0 ? (
                <Text variant="body" tone="ink3">
                  {copy.metaSeparator}
                </Text>
              ) : null}
              <Text variant="body" tone="ink2">
                {v}
              </Text>
            </View>
          ))}
        </View>
        <Icon name="chev" size={18} tone="ink3" />
      </View>
    </Tappable>
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
        icon={
          result.access === 'blocked'
            ? 'ban'
            : result.access === 'other_campus'
              ? 'building'
              : 'tag'
        }
        title={title}
        body={body}
        action={{ label: copy.backToDiscover, onPress: () => router.replace('/discover') }}
      />
    </View>
  );
}

/** A button over the photo, on the clear material (DEC 143). */
function PhotoButton({ children }: { children: ReactNode }) {
  return (
    <Material variant="clear" style={styles.photoButton}>
      {children}
    </Material>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  photoButton: { borderRadius: theme.radius.chip },
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
  trust: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
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
  event: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  list: {
    marginTop: theme.space.lg,
    marginBottom: theme.space.sm,
    // Round 2: a soft grouped tile instead of a bordered box.
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
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
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line2,
    marginLeft: theme.space.md + theme.space.xs,
  },
  values: {
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  valueItem: { flexDirection: 'row' },
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
  },
}));
