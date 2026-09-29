import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { Avatar } from '@/components/Avatar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { ListingTile } from '@/components/ListingTile';
import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { ReportSheet } from '@/components/ReportSheet';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { feed as feedCopy, profileView as copy } from '@/strings/en';

import { mediaUrl, priceLabel } from '../sell/logic';
import { profileApi, type ProfileApi, type ProfileResult, type PublicProfile } from './api';

export function swapsLabel(n: number): string {
  return n === 1 ? copy.swapsOne : fill(copy.swaps, { n });
}

export function thumbsLabel(up: number, total: number): string {
  if (total === 0) return copy.noRatings;
  return fill(copy.thumbs, { pct: Math.round((up / total) * 100) });
}

export function replyLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  const time =
    minutes < 60
      ? fill(copy.minutes, { n: Math.max(1, Math.round(minutes)) })
      : fill(copy.hours, { n: Math.round(minutes / 60) });
  return fill(copy.replies, { time });
}

export function joinedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return fill(copy.memberSince, { date });
}

/** B10 Seller profile (P6-USER-01; board B20-B22): listings, reviews, new seller, blocked. */
export function ProfileViewScreen({
  id,
  api = profileApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  id: string;
  api?: ProfileApi;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['profile', id], queryFn: () => api.getProfile(id) });
  const [options, setOptions] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/discover'));
  const refresh = () => qc.invalidateQueries({ queryKey: ['profile', id] });

  if (query.isPending) {
    return (
      <View style={styles.root} testID="screen-profile-loading">
        <NavBar onLeading={leave} />
        <SkeletonList />
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
  const data: ProfileResult = query.data;
  if (data.access === 'gone') {
    return (
      <View style={styles.root} testID="screen-profile-gone">
        <NavBar onLeading={leave} />
        <EmptyState icon="user" title={copy.goneTitle} body={copy.goneBody} />
      </View>
    );
  }
  if (data.access === 'blocked') {
    const name = data.display_name ?? '';
    return (
      <View style={styles.root} testID="screen-profile-blocked">
        <NavBar onLeading={leave} />
        <EmptyState
          icon="ban"
          title={fill(copy.blocked, { name })}
          body={copy.blockedBody}
          action={{
            label: copy.unblock,
            onPress: async () => {
              await api.unblock(id);
              await refresh();
            },
          }}
        />
      </View>
    );
  }

  const p: PublicProfile = data;
  const base = mediaBase();
  const name = p.display_name ?? '';
  const facts = [
    p.year ? copy.years[p.year] : null,
    joinedLabel(p.created_at),
    replyLabel(p.median_reply_minutes),
  ].filter(Boolean);

  return (
    <View style={styles.root} testID="screen-profile">
      <NavBar
        onLeading={leave}
        trailing={
          p.access === 'ok' ? (
            <IconButton
              icon="more"
              accessibilityLabel={copy.more}
              onPress={() => setOptions(true)}
              testID="profile-more"
            />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <Avatar name={name} uri={p.avatar_path ? mediaUrl(base, p.avatar_path) : null} size="L" />
          <Text variant="title" accessibilityRole="header">
            {name}
          </Text>
          <Text variant="meta" tone="ink2">
            {facts.join(feedCopy.metaSeparator)}
          </Text>
          <View style={styles.tags}>
            {p.founding_seller ? <Tag label={copy.founding} tone="accent" /> : null}
            {p.new_seller ? <Tag label={copy.newSeller} tone="amber" /> : null}
          </View>
          <View style={styles.stats}>
            <Text variant="label">{swapsLabel(p.swaps_count)}</Text>
            <Text variant="label">{thumbsLabel(p.thumbs_up, p.thumbs_total)}</Text>
          </View>
        </View>

        {p.new_seller && p.access === 'ok' ? (
          <View style={styles.note} testID="profile-new-seller">
            <Text variant="body">{copy.newSellerBody}</Text>
          </View>
        ) : null}

        <Text variant="heading" accessibilityRole="header">
          {copy.listings}
        </Text>
        {p.listings.length === 0 ? (
          <Text variant="body" tone="ink2">
            {copy.noListings}
          </Text>
        ) : (
          <View style={styles.grid}>
            {p.listings.map((l) => (
              <View key={l.id} style={styles.cell}>
                <ListingTile
                  title={l.title}
                  price={priceLabel(l.kind, l.price_cents, feedCopy.free)}
                  photo={l.photos[0] ? mediaUrl(base, l.photos[0].thumb_path) : null}
                  blurhash={l.photos[0]?.blurhash}
                  state={l.status === 'hold' ? 'hold' : 'default'}
                  onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })}
                  testID={`profile-listing-${l.id}`}
                />
              </View>
            ))}
          </View>
        )}

        <Text variant="heading" accessibilityRole="header">
          {copy.reviews}
        </Text>
        {p.reviews.length === 0 ? (
          <Text variant="body" tone="ink2">
            {copy.noReviews}
          </Text>
        ) : (
          p.reviews.map((r) => (
            <View key={r.id} style={styles.review}>
              <Text variant="bodyStrong">
                {`${r.thumbs_up ? copy.thumbsUp : copy.thumbsDown} · ${r.rater_name ?? copy.deletedUser}`}
              </Text>
              {r.comment ? <Text variant="body">{r.comment}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>

      <Sheet visible={options} onClose={() => setOptions(false)} testID="profile-options">
        <GroupedList>
          <ListRow
            label={fill(copy.report, { name })}
            icon="flag"
            onPress={() => {
              setOptions(false);
              setReporting(true);
            }}
          />
          <ListRow
            label={fill(copy.block, { name })}
            icon="ban"
            destructive
            onPress={() => {
              setOptions(false);
              setConfirmBlock(true);
            }}
          />
        </GroupedList>
      </Sheet>
      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        target="user"
        name={name}
        onSubmit={async ({ reason, details, block }) => {
          await api.reportUser(id, reason, details);
          track('report_submitted', { target_type: 'user' });
          if (block) {
            await api.block(id);
            await refresh();
          }
        }}
      />
      <ConfirmDialog
        visible={confirmBlock}
        title={fill(copy.blockTitle, { name })}
        message={copy.blockBody}
        confirmLabel={copy.blockConfirm}
        destructive
        onConfirm={async () => {
          await api.block(id);
          setConfirmBlock(false);
          await refresh();
        }}
        onCancel={() => setConfirmBlock(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.md },
  head: { alignItems: 'center', gap: theme.space.sm, paddingBottom: theme.space.lg },
  tags: { flexDirection: 'row', gap: theme.space.sm },
  stats: { flexDirection: 'row', gap: theme.space.lg },
  note: {
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.amberBg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  cell: { width: '47%' },
  review: {
    gap: theme.space.xs,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
}));
