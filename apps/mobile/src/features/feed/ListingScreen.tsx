import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
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
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { feed as copy, sell as sellCopy } from '@/strings/en';

import { sellApi } from '../sell/api';
import {
  listingLink,
  mediaUrl,
  priceLabel,
  sortSpots,
  type Availability,
  type Spot,
} from '../sell/logic';
import { feedApi, type FeedApi } from './api';
import { isVisible, metaLine, sellerName, type FeedItem, type ListingResult } from './logic';

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
}: {
  id: string;
  api?: FeedApi;
  spots?: () => Promise<Spot[]>;
  mediaBase?: () => string;
  site?: () => string;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  now?: () => Date;
}) {
  const router = useRouter();
  const qc = useQueryClient();
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
  const price = priceLabel(item.kind, item.price_cents, copy.free);
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

  return (
    <View style={styles.root} testID="screen-listing">
      <ScrollView contentContainerStyle={styles.scroll}>
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
        <View style={styles.body}>
          <View style={styles.priceRow}>
            <Text variant="price" style={styles.flex}>
              {price}
            </Text>
            {statusTag ? (
              <Tag label={statusTag} tone={item.status === 'sold' ? 'neutral' : 'amber'} />
            ) : null}
          </View>
          <Text variant="title" accessibilityRole="header">
            {item.title}
          </Text>
          <Text variant="meta" tone="ink2">
            {metaLine(item, now())}
          </Text>
          {!item.open_to_offers && item.kind === 'sale' ? (
            <Text variant="meta" tone="ink2">
              {copy.notOpenToOffers}
            </Text>
          ) : null}

          {owner ? (
            <View style={styles.stats} testID="listing-owner-stats">
              <Text variant="label">{fill(copy.statViews, { n: item.view_count })}</Text>
              <Text variant="label">{fill(copy.statSaves, { n: item.save_count })}</Text>
              <Text variant="label">{fill(copy.statOffers, { n: item.offer_count })}</Text>
            </View>
          ) : null}

          {item.status === 'hold' && !owner ? (
            <View style={styles.hold} testID="listing-hold">
              <Text variant="bodyStrong">{copy.onHold}</Text>
              <Text variant="body" tone="ink2">
                {copy.onHoldBody}
              </Text>
            </View>
          ) : null}

          {item.description ? (
            <View style={styles.section}>
              <Text variant="heading" accessibilityRole="header">
                {copy.descriptionTitle}
              </Text>
              <Text variant="body">{item.description}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text variant="heading" accessibilityRole="header">
              {copy.meetupTitle}
            </Text>
            {chosenSpots.length === 0 && !item.meet_note ? (
              <Text variant="body" tone="ink2">
                {copy.meetupDecide}
              </Text>
            ) : null}
            {chosenSpots.map((s) => (
              <Text key={s.id} variant="body">
                {s.police ? `${s.name} (${sellCopy.police})` : s.name}
              </Text>
            ))}
            {item.meet_note ? <Text variant="body">{item.meet_note}</Text> : null}
            {item.availability.length > 0 ? (
              <Text variant="meta" tone="ink2">
                {`${copy.availabilityTitle}: ${item.availability
                  .map((a) => sellCopy.availability[a as Availability] ?? a)
                  .join(', ')}`}
              </Text>
            ) : null}
          </View>

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
              <View style={styles.seller}>
                <Avatar
                  name={sellerName(item)}
                  uri={item.seller.avatar_path ? mediaUrl(base, item.seller.avatar_path) : null}
                />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{sellerName(item)}</Text>
                  <Text variant="meta" tone="ink2">
                    {copy.sellerTitle}
                  </Text>
                </View>
              </View>
            </Tappable>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.top} pointerEvents="box-none">
        <NavBar
          tone="onPhoto"
          onLeading={leave}
          trailing={
            <View style={styles.row}>
              <IconButton
                icon="share"
                tone="onPhoto"
                accessibilityLabel={copy.share}
                onPress={onShare}
              />
              {!owner ? (
                <IconButton
                  icon="more"
                  tone="onPhoto"
                  accessibilityLabel={copy.more}
                  onPress={() => setOptions(true)}
                  testID="listing-more"
                />
              ) : null}
            </View>
          }
        />
      </View>

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
              icon="bookmark"
              filled={item.saved}
              accessibilityLabel={item.saved ? copy.saved : copy.save}
              onPress={toggleSave}
              testID="listing-save"
            />
            <View style={styles.flex}>
              {item.status === 'hold' ? (
                <Button
                  label={item.watching ? copy.watching : copy.tellMe}
                  variant="dark"
                  disabled={item.watching}
                  onPress={watch}
                  testID="listing-watch"
                />
              ) : item.status === 'sold' ? (
                <Button label={copy.sold} disabled onPress={() => {}} />
              ) : (
                <Button
                  label={item.kind === 'free' ? copy.askForIt : copy.offer}
                  onPress={() => router.push({ pathname: '/listing/[id]/offer', params: { id } })}
                  testID="listing-offer"
                />
              )}
            </View>
          </>
        )}
      </View>

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
        onSubmit={({ reason, details }) => api.reportListing(id, reason, details)}
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
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  body: { padding: theme.space.screen, gap: theme.space.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  stats: {
    flexDirection: 'row',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  hold: {
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.amberBg,
    gap: theme.space.xs,
  },
  section: { gap: theme.space.xs, marginTop: theme.space.lg },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    marginTop: theme.space.lg,
    paddingVertical: theme.space.md,
    borderTopWidth: 1,
    borderColor: theme.colors.line,
  },
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
