import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { ListingTile } from '@/components/ListingTile';
import { IconButton } from '@/components/IconButton';
import { Icon } from '@/components/icons/Icon';
import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { Toggle } from '@/components/Toggle';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { feed as feedCopy, me as copy, profileView, intlLocale } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { avatarDeps, type AvatarDeps } from '../auth/avatar';
import { feedApi, type FeedApi } from '../feed/api';
import { listingKey } from '../feed/ListingScreen';
import { isVisible } from '../feed/logic';
import type { ClassYear } from '../profiles/api';
import { centsToDollars, dollarsToCents } from '../search/logic';
import { mediaUrl, priceLabel } from '../sell/logic';
import { listingTab, meApi, type Me, type MeApi, type MyListing } from './api';

export const meKey = ['me'] as const;
const YEARS: ClassYear[] = ['freshman', 'sophomore', 'junior', 'senior', 'grad', 'other'];

function Screen({
  title,
  testID,
  children,
  onBack,
}: {
  title: string;
  testID: string;
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <View style={styles.root} testID={testID}>
      <NavBar title={title} onLeading={onBack} />
      {children}
    </View>
  );
}

/** Splits a one-placeholder template ("{n} sold") around its value, for a bold number. */
export function splitAround(template: string, key: string): [string, string] {
  const [before = '', after = ''] = template.split(`{${key}}`);
  return [before, after];
}

/**
 * The one inline line of real numbers under the name (DEC 90: no stat boxes,
 * nothing invented): sold, swaps, thumbs up only once someone rated, and the
 * month you joined.
 */
export function profileStats(m: Pick<Me, 'counts' | 'created_at'>, locale: string) {
  const out: { key: string; value: string; template: string; name: string }[] = [
    { key: 'sold', value: String(m.counts.sold), template: copy.statsSold, name: 'n' },
    { key: 'swaps', value: String(m.counts.swaps), template: copy.statsSwaps, name: 'n' },
  ];
  if (m.counts.thumbs_total > 0) {
    const pct = Math.round((m.counts.thumbs_up / m.counts.thumbs_total) * 100);
    out.push({ key: 'thumbs', value: String(pct), template: profileView.thumbs, name: 'pct' });
  }
  const joined = new Date(m.created_at);
  if (!Number.isNaN(joined.getTime())) {
    out.push({
      key: 'joined',
      value: '',
      template: fill(profileView.memberSince, {
        date: joined.toLocaleDateString(locale, { month: 'short', year: 'numeric' }),
      }),
      name: '',
    });
  }
  return out;
}

/**
 * F01 Profile tab (P11-SET-01; DEC 90 mock screen 15): your initial on the
 * accent, name, year and school with a check, one inline line of real
 * numbers, Edit profile, then Active and Sold as a three-column photo grid
 * with small white price tags. Notifications, Saved and Settings sit top
 * right; My listings and your public profile are plain rows under the grid.
 */
export function ProfileTabScreen({
  api = meApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  devLinks,
}: {
  api?: MeApi;
  mediaBase?: () => string;
  devLinks?: ReactNode;
}) {
  const router = useRouter();
  const q = useQuery({ queryKey: meKey, queryFn: () => api.me() });
  const mine = useQuery({ queryKey: ['my-listings'], queryFn: () => api.listings() });
  const [tab, setTab] = useState<'active' | 'sold'>('active');
  let body;
  if (q.isPending) body = <SkeletonList rows={5} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const m = q.data;
    const name = m.display_name ?? '';
    const base = mediaBase();
    const school = m.campus
      ? m.year
        ? fill(copy.yearAt, { year: profileView.years[m.year], campus: m.campus.name })
        : fill(copy.verifiedAt, { campus: m.campus.name })
      : null;
    const stats = profileStats(m, intlLocale);
    const items = (mine.data ?? []).filter((l) => listingTab(l.status) === tab);
    const counts = {
      active: (mine.data ?? []).filter((l) => listingTab(l.status) === 'active').length,
      sold: (mine.data ?? []).filter((l) => listingTab(l.status) === 'sold').length,
    };
    let grid;
    if (mine.isPending) grid = <SkeletonList rows={2} />;
    else if (mine.isError)
      grid = <ErrorState error={mine.error} onRetry={() => mine.refetch()} layout="inline" />;
    else if (items.length === 0)
      grid =
        tab === 'active' ? (
          <View style={styles.emptyGrid} testID="profile-sell-nudge">
            <Text variant="bodyStrong">{copy.sellNudgeTitle}</Text>
            <Text variant="label" tone="ink2" style={styles.regular}>
              {copy.sellNudgeBody}
            </Text>
            <Button
              label={copy.sellNudge}
              size="M"
              fullWidth={false}
              onPress={() => router.push('/sell')}
            />
          </View>
        ) : (
          <Text variant="label" tone="ink2" style={styles.emptyGrid} testID="profile-sold-empty">
            {copy.soldEmpty}
          </Text>
        );
    else
      grid = (
        <View style={styles.photoGrid} testID="profile-grid">
          {items.map((l) => {
            const price = priceLabel(l.kind, l.price_cents, feedCopy.free);
            return (
              <Tappable
                key={l.id}
                accessibilityRole="button"
                accessibilityLabel={`${l.title}, ${price}`}
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })}
                style={styles.gridCell}
                testID={`profile-listing-${l.id}`}
              >
                <View style={styles.gridPhoto}>
                  <Photo
                    source={l.photos[0] ? mediaUrl(base, l.photos[0].thumb_path) : null}
                    fill
                  />
                  <View style={styles.priceTag}>
                    <Text variant="meta" overlay style={styles.priceText}>
                      {price}
                    </Text>
                  </View>
                </View>
              </Tappable>
            );
          })}
        </View>
      );
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <Avatar
            name={name}
            uri={m.avatar_path ? mediaUrl(base, m.avatar_path) : null}
            size="L"
            fill="accent"
            letters={1}
          />
          <View style={styles.flex}>
            <Text variant="title" accessibilityRole="header">
              {name}
            </Text>
            {school ? (
              <View style={styles.school} accessible testID="profile-school">
                <Text variant="label" tone="ink2" style={styles.regular}>
                  {school}
                </Text>
                <Icon name="check" size={14} tone="green" strokeWidth={2.4} />
              </View>
            ) : null}
            {m.founding_seller ? (
              <View style={styles.tagRow}>
                <Tag label={profileView.founding} tone="accent" />
              </View>
            ) : null}
          </View>
        </View>
        <Text variant="label" tone="ink2" style={styles.stats} testID="profile-stats">
          {stats.map((st, i) => {
            const [before, after] = st.name ? splitAround(st.template, st.name) : [st.template, ''];
            return (
              <Text key={st.key} variant="label" tone="ink2" style={styles.regular}>
                {i > 0 ? '   ' : ''}
                {before}
                {st.value ? (
                  <Text variant="label" tone="ink">
                    {st.value}
                  </Text>
                ) : null}
                {after}
              </Text>
            );
          })}
        </Text>
        <Button
          label={copy.edit}
          variant="secondary"
          size="M"
          onPress={() => router.push('/profile/edit')}
          testID="profile-edit"
        />
        <View style={styles.segment}>
          <SegmentedControl
            label={copy.listingsTitle}
            segments={[
              { value: 'active', label: `${copy.tabs.active} ${counts.active}` },
              { value: 'sold', label: `${copy.tabs.sold} ${counts.sold}` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        {grid}
        <View style={styles.links}>
          <GroupedList>
            <ListRow label={copy.myListings} onPress={() => router.push('/profile/listings')} />
            <ListRow
              label={copy.viewProfile}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.id } })}
            />
          </GroupedList>
        </View>
        {devLinks}
      </ScrollView>
    );
  }
  return (
    <View style={styles.root} testID="screen-profile">
      <View style={styles.topBar}>
        <IconButton
          icon="bell"
          filled
          accessibilityLabel={copy.notifications}
          onPress={() => router.push('/notifications')}
          testID="profile-open-notifications"
        />
        <IconButton
          icon="bookmark"
          filled
          accessibilityLabel={copy.saved}
          onPress={() => router.push('/saved')}
          testID="profile-open-saved"
        />
        <IconButton
          icon="gear"
          filled
          accessibilityLabel={copy.settings}
          onPress={() => router.push('/settings')}
          testID="profile-open-settings"
        />
      </View>
      {body}
    </View>
  );
}

/** F02 Edit profile (P11-SET-01). */
export function EditProfileScreen({
  api = meApi,
  avatar = avatarDeps,
}: {
  api?: MeApi;
  avatar?: AvatarDeps;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: meKey, queryFn: () => api.me() });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const [draft, setDraft] = useState<{
    first: string;
    initial: string;
    year: ClassYear | null;
    bio: string;
    avatar: string | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isPending)
    return (
      <Screen title={copy.editTitle} testID="screen-edit-profile" onBack={leave}>
        <SkeletonList rows={4} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen title={copy.editTitle} testID="screen-edit-profile" onBack={leave}>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Screen>
    );
  const m = q.data;
  const d = draft ?? {
    first: m.first_name ?? '',
    initial: m.last_initial ?? '',
    year: m.year,
    bio: m.bio ?? '',
    avatar: m.avatar_path,
  };
  const set = (patch: Partial<typeof d>) => setDraft({ ...d, ...patch });

  const changePhoto = async () => {
    const picked = await avatar.pick();
    if (!picked) return;
    setUploading(true);
    try {
      set({ avatar: await avatar.upload(picked, () => {}) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({
        firstName: d.first,
        lastInitial: d.initial || null,
        year: d.year,
        bio: d.bio || null,
        avatarPath: d.avatar,
      });
      await qc.invalidateQueries({ queryKey: meKey });
      useToastStore.getState().show('success', copy.saved_);
      leave();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={copy.editTitle} testID="screen-edit-profile" onBack={leave}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Avatar
            name={d.first}
            uri={d.avatar ? mediaUrl(getEnv().EXPO_PUBLIC_MEDIA_URL, d.avatar) : null}
            size="L"
          />
          <Button
            label={uploading ? copy.uploading : copy.changePhoto}
            variant="secondary"
            size="S"
            loading={uploading}
            onPress={changePhoto}
          />
        </View>
        <Input
          label={copy.firstName}
          value={d.first}
          onChangeText={(v) => set({ first: v })}
          maxLength={30}
          testID="edit-first"
        />
        <Input
          label={copy.lastInitial}
          value={d.initial}
          onChangeText={(v) => set({ initial: v.slice(0, 1).toUpperCase() })}
          maxLength={1}
        />
        <Text variant="label">{copy.year}</Text>
        <View style={styles.chips}>
          {YEARS.map((y) => (
            <Chip
              key={y}
              label={profileView.years[y]}
              selected={d.year === y}
              onPress={() => set({ year: d.year === y ? null : y })}
            />
          ))}
        </View>
        <TextArea
          label={copy.bio}
          placeholder={copy.bioPlaceholder}
          value={d.bio}
          onChangeText={(v) => set({ bio: v })}
          maxLength={80}
        />
        {error ? <Banner kind="error" message={error} /> : null}
        <Button
          label={copy.save}
          loading={busy}
          disabled={!d.first.trim() || uploading}
          onPress={save}
          testID="edit-save"
        />
      </ScrollView>
    </Screen>
  );
}

/** F03 My listings (P11-SET-01; X37 empty). */
export function MyListingsScreen({
  api = meApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  api?: MeApi;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['my-listings'], queryFn: () => api.listings() });
  const [tab, setTab] = useState<'active' | 'sold' | 'other'>('active');
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  let body;
  if (q.isPending) body = <SkeletonList />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const items = q.data.filter((l) => listingTab(l.status) === tab);
    body =
      items.length === 0 ? (
        <EmptyState
          icon="tag"
          title={copy.listingsEmptyTitle}
          body={copy.listingsEmptyBody}
          action={
            tab === 'active'
              ? { label: copy.sellNudge, onPress: () => router.push('/sell') }
              : undefined
          }
          testID="my-listings-empty"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {items.map((l: MyListing) => (
            <View key={l.id} style={styles.cell}>
              <ListingTile
                title={l.title}
                price={priceLabel(l.kind, l.price_cents, feedCopy.free)}
                photo={l.photos[0] ? mediaUrl(mediaBase(), l.photos[0].thumb_path) : null}
                state={l.status === 'sold' ? 'sold' : l.status === 'hold' ? 'hold' : 'default'}
                note={
                  l.status in copy.statusLabels && l.status !== 'active'
                    ? copy.statusLabels[l.status as keyof typeof copy.statusLabels]
                    : null
                }
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })}
                testID={`my-listing-${l.id}`}
              />
              <View style={styles.row}>
                <Button
                  label={copy.stats}
                  variant="text"
                  size="S"
                  onPress={() =>
                    router.push({ pathname: '/listing/[id]/stats', params: { id: l.id } })
                  }
                />
                {l.can_relist ? (
                  <Button
                    label={copy.relist}
                    variant="text"
                    size="S"
                    onPress={() =>
                      router.push({ pathname: '/listing/[id]/relist', params: { id: l.id } })
                    }
                    testID={`relist-${l.id}`}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      );
  }
  return (
    <Screen title={copy.listingsTitle} testID="screen-my-listings" onBack={leave}>
      <View style={styles.tabs}>
        <SegmentedControl
          label={copy.listingsTitle}
          segments={[
            { value: 'active', label: copy.tabs.active },
            { value: 'sold', label: copy.tabs.sold },
            { value: 'other', label: copy.tabs.other },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {body}
    </Screen>
  );
}

/** F04 Listing stats (P11-SET-01). */
export function ListingStatsScreen({ id, api = meApi }: { id: string; api?: MeApi }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['listing-stats', id], queryFn: () => api.stats(id) });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile/listings'));
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' });
  let body;
  if (q.isPending) body = <SkeletonList rows={4} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const s = q.data;
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statGrid}>
          {[
            [copy.views, s.views],
            [copy.saves, s.saves],
            [copy.offers, s.offers],
            [copy.openOffers, s.open_offers],
          ].map(([label, n]) => (
            <View key={String(label)} style={styles.statCell}>
              <Text variant="price">{String(n)}</Text>
              <Text variant="meta" tone="ink2">
                {String(label)}
              </Text>
            </View>
          ))}
        </View>
        {s.best_offer_cents ? (
          <Text variant="bodyStrong">{`${copy.bestOffer}: $${centsToDollars(s.best_offer_cents)}`}</Text>
        ) : null}
        <Text variant="meta" tone="ink2">
          {fill(copy.listed, { date: date(s.created_at) })}
          {s.expires_at ? ` · ${fill(copy.expires, { date: date(s.expires_at) })}` : ''}
        </Text>
        <Text variant="heading" accessibilityRole="header">
          {copy.priceHistory}
        </Text>
        {s.price_changes.length === 0 ? (
          <Text variant="body" tone="ink2">
            {copy.noPriceChanges}
          </Text>
        ) : (
          s.price_changes.map((c) => (
            <Text
              key={c.at}
              variant="body"
            >{`${date(c.at)}: $${centsToDollars(c.old)} → $${centsToDollars(c.new)}`}</Text>
          ))
        )}
      </ScrollView>
    );
  }
  return (
    <Screen title={copy.statsTitle} testID="screen-listing-stats" onBack={leave}>
      {body}
    </Screen>
  );
}

/** F06 Edit listing (P11-SET-01): title, description, price (a drop tells savers), offers, delete. */
export function EditListingScreen({
  id,
  api = meApi,
  listings = feedApi,
}: {
  id: string;
  api?: MeApi;
  listings?: Pick<FeedApi, 'getListing'>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: listingKey(id), queryFn: () => listings.getListing(id) });
  const [draft, setDraft] = useState<{
    title: string;
    description: string;
    price: string;
    open: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile/listings'));

  if (q.isPending)
    return (
      <Screen title={copy.editListingTitle} testID="screen-edit-listing" onBack={leave}>
        <SkeletonList rows={4} />
      </Screen>
    );
  if (q.isError || !q.data || !isVisible(q.data) || q.data.access !== 'owner')
    return (
      <Screen title={copy.editListingTitle} testID="screen-edit-listing" onBack={leave}>
        <ErrorState error={q.error ?? { message: 'NOT_FOUND' }} />
      </Screen>
    );
  const l = q.data;
  const d = draft ?? {
    title: l.title,
    description: l.description ?? '',
    price: centsToDollars(l.price_cents),
    open: l.open_to_offers,
  };
  const set = (patch: Partial<typeof d>) => setDraft({ ...d, ...patch });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const cents = l.kind === 'free' ? undefined : dollarsToCents(d.price);
      await api.updateListing(id, {
        title: d.title.trim(),
        description: d.description.trim(),
        ...(cents !== undefined && cents !== l.price_cents ? { price_cents: cents } : {}),
        open_to_offers: d.open,
      });
      await qc.invalidateQueries({ queryKey: listingKey(id) });
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      leave();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={copy.editListingTitle} testID="screen-edit-listing" onBack={leave}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Input
          label={copy.titleLabel}
          value={d.title}
          onChangeText={(v) => set({ title: v })}
          maxLength={80}
          testID="edit-title"
        />
        <TextArea
          label={copy.descriptionLabel}
          value={d.description}
          onChangeText={(v) => set({ description: v })}
          maxLength={1000}
        />
        {l.kind !== 'free' ? (
          <>
            <Input
              kind="price"
              label={copy.priceLabel}
              value={d.price}
              onChangeText={(v) => set({ price: v })}
              testID="edit-price"
            />
            <Toggle label={copy.openToOffers} value={d.open} onChange={(v) => set({ open: v })} />
          </>
        ) : null}
        {error ? <Banner kind="error" message={error} /> : null}
        <Button
          label={copy.saveChanges}
          loading={busy}
          disabled={d.title.trim().length < 3}
          onPress={save}
          testID="edit-listing-save"
        />
        <Button
          label={copy.deleteListing}
          variant="text"
          onPress={() => setConfirmDelete(true)}
          testID="edit-listing-delete"
        />
      </ScrollView>
      <ConfirmDialog
        visible={confirmDelete}
        title={copy.deleteTitle}
        message={copy.deleteBody}
        confirmLabel={copy.deleteConfirm}
        destructive
        onConfirm={async () => {
          await api.deleteListing(id);
          setConfirmDelete(false);
          void qc.invalidateQueries({ queryKey: ['my-listings'] });
          router.replace('/profile/listings');
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

/** F08 Relist (P11-SET-01). */
export function RelistScreen({ id, api = meApi }: { id: string; api?: MeApi }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile/listings'));
  const relist = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.relist(id, dollarsToCents(price) ?? null);
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      useToastStore.getState().show('success', copy.relisted);
      leave();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title={copy.relistTitle} testID="screen-relist" onBack={leave}>
      <View style={styles.body}>
        <Text variant="body">{copy.relistBody}</Text>
        <Input
          kind="price"
          label={copy.relistPrice}
          value={price}
          onChangeText={setPrice}
          testID="relist-price"
        />
        {error ? <Banner kind="error" message={error} /> : null}
        <Button label={copy.relistButton} loading={busy} onPress={relist} testID="relist-button" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
    paddingTop: rt.insets.top + theme.space.xs,
    paddingHorizontal: theme.space.lg,
  },
  regular: { fontWeight: '400' },
  school: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs, flexWrap: 'wrap' },
  segment: { marginTop: theme.space.xs },
  links: { marginTop: theme.space.md },
  emptyGrid: { gap: theme.space.sm, paddingVertical: theme.space.md, alignItems: 'flex-start' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs },
  gridCell: { width: '32.3%' },
  gridPhoto: {
    aspectRatio: 1,
    borderRadius: theme.radius.thumb,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg2,
  },
  priceTag: {
    position: 'absolute',
    left: theme.space.sm,
    bottom: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs / 2,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.card,
  },
  priceText: { fontWeight: '700' },
  body: {
    ...readableColumn,
    padding: theme.space.screen,
    gap: theme.space.md,
    paddingBottom: theme.space['2xl'],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  flex: { flex: 1 },
  tagRow: { flexDirection: 'row', marginTop: theme.space.xs },
  stats: { marginTop: -theme.space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  tabs: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
    padding: theme.space.screen,
  },
  cell: { width: '47%', gap: theme.space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  statCell: {
    width: '46%',
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
    gap: theme.space.xs,
  },
}));
