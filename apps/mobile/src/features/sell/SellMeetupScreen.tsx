import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { Checkbox } from '@/components/OptionRow';
import { Photo } from '@/components/Photo';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { errorCopy, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { sell as copy } from '@/strings/en';

import { sellApi, type SellApi } from './api';
import { getDraftStore, useDraft, type DraftState } from './draft';
import {
  AVAILABILITY,
  categoryLabel,
  chosenSpots,
  createArgs,
  directionsUrl,
  listingPriceCents,
  mediaUrl,
  MEET_NOTE_MAX,
  priceLabel,
  sortSpots,
  toggleSpot,
  type Availability,
  type Spot,
} from './logic';
import { usePostedStore } from './posted';
import { SellStep } from './SellStep';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * D03 Sell · meetup (P5-SELL-04; board D5, DESIGN_SYSTEM D3 delta): a list of
 * the campus meetup spots, police-designated first, with Directions to Maps.
 * No map and no location permission in R1.0. Post creates the listing on the
 * id reserved in step 1, so a retry never makes a second one (BE-05).
 */
export function SellMeetupScreen({
  api = sellApi,
  store = getDraftStore(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  openUrl = (url: string) => Linking.openURL(url),
}: {
  api?: SellApi;
  store?: ReturnType<typeof getDraftStore>;
  mediaBase?: () => string;
  openUrl?: (url: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const draft = useDraft((s: DraftState) => s.draft, store);
  const { update, reset } = store.getState();
  const [maxHint, setMaxHint] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [confirmHint, setConfirmHint] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spotsQuery = useQuery({ queryKey: ['safe_spots'], queryFn: api.spots });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
    staleTime: Infinity,
  });
  const spots = sortSpots(spotsQuery.data ?? []);
  const chosen = chosenSpots(draft, spots);

  const toggle = (spot: Spot) => {
    const next = toggleSpot(chosen, spot.id);
    if (next === null) {
      setMaxHint(true);
      return;
    }
    setMaxHint(false);
    update({ spotIds: next });
  };

  const post = async () => {
    setError(null);
    if (!allowed) {
      setConfirmHint(true);
      return;
    }
    setPosting(true);
    try {
      const listing = await api.createListing(createArgs(draft, chosen));
      usePostedStore.getState().set(listing, draft.photos[0]?.uri ?? null);
      reset();
      router.replace('/sell/posted');
    } catch (e) {
      const appError = toAppError(e);
      setError(
        appError.code === 'ERR_OFFLINE' || appError.code === 'UNKNOWN'
          ? copy.postFailed
          : errorCopy(appError, { campusTimeZone: deviceTz() }),
      );
    } finally {
      setPosting(false);
    }
  };

  const cover = draft.photos[0];
  const coverSource =
    cover?.uri || (cover?.thumbPath ? mediaUrl(mediaBase(), cover.thumbPath) : null);
  const meta = [
    draft.condition ? copy.conditions[draft.condition] : null,
    draft.kind === 'sale' ? categoryLabel(categories.data ?? [], draft.categoryId) : null,
    spots.find((s) => s.id === chosen[0])?.name ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SellStep
      testID="screen-sell-meetup"
      step={3}
      leading="back"
      onLeading={() => (router.canGoBack() ? router.back() : router.replace('/sell/details'))}
      title={copy.meetupTitle}
      body={copy.meetupBody}
      dock={
        <Button
          label={copy.post}
          onPress={() => void post()}
          loading={posting}
          testID="sell-post"
        />
      }
    >
      {spotsQuery.isPending ? (
        <SkeletonList rows={3} />
      ) : spotsQuery.isError ? (
        <ErrorState
          layout="inline"
          error={spotsQuery.error}
          onRetry={() => void spotsQuery.refetch()}
        />
      ) : (
        <View style={styles.list} testID="sell-spots">
          {spots.length === 0 ? (
            <Text variant="meta" tone="ink2">
              {copy.noSpots}
            </Text>
          ) : null}
          {spots.map((spot) => {
            const selected = chosen.includes(spot.id);
            return (
              <View key={spot.id} style={styles.spot(selected)}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={[
                    spot.name,
                    spot.police ? copy.police : null,
                    spot.description,
                    spot.hours,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onPress={() => toggle(spot)}
                  testID={`sell-spot-${spot.id}`}
                  style={styles.spotMain}
                >
                  <View style={styles.box(selected)} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{spot.name}</Text>
                    {spot.description || spot.hours ? (
                      <Text variant="meta" tone="ink2">
                        {[spot.description, spot.hours].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    {spot.police ? (
                      <View style={styles.tag}>
                        <Tag label={copy.police} tone="green" />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                <Button
                  label={copy.directions}
                  variant="text"
                  size="S"
                  accessibilityHint={fill(copy.directionsLabel, { name: spot.name })}
                  onPress={() => void openUrl(directionsUrl(spot, Platform.OS))}
                />
              </View>
            );
          })}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: chosen.length === 0 }}
            accessibilityLabel={`${copy.decideInChat}, ${copy.decideInChatBody}`}
            onPress={() => {
              setMaxHint(false);
              update({ spotIds: [] });
            }}
            testID="sell-spot-chat"
            style={[styles.spot(chosen.length === 0), styles.spotMain]}
          >
            <View style={styles.box(chosen.length === 0)} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{copy.decideInChat}</Text>
              <Text variant="meta" tone="ink2">
                {copy.decideInChatBody}
              </Text>
            </View>
          </Pressable>
          {maxHint ? (
            <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
              {copy.spotsMax}
            </Text>
          ) : null}
        </View>
      )}

      <Input
        label={copy.noteLabel}
        placeholder={copy.notePlaceholder}
        value={draft.meetNote}
        maxLength={MEET_NOTE_MAX}
        onChangeText={(meetNote) => update({ meetNote })}
        testID="sell-meet-note"
      />

      <View style={styles.field}>
        <Text variant="label" tone="ink2">
          {copy.availabilityLabel}
        </Text>
        <ChipGroup<Availability>
          label={copy.availabilityLabel}
          options={AVAILABILITY.map((a) => ({ value: a, label: copy.availability[a] }))}
          value={draft.availability}
          onChange={(availability) => update({ availability })}
        />
      </View>

      <View style={styles.field}>
        <Text variant="label" tone="ink2">
          {copy.preview}
        </Text>
        <View style={styles.preview} testID="sell-preview">
          <View style={styles.thumb}>
            <Photo source={coverSource} blurhash={cover?.blurhash} rounded="thumb" />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {draft.title.trim()}
            </Text>
            <Text variant="bodyStrong">
              {priceLabel(draft.kind, listingPriceCents(draft), copy.free)}
            </Text>
            {meta ? (
              <Text variant="meta" tone="ink2" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <Checkbox
        label={copy.notBanned}
        selected={allowed}
        onPress={() => {
          setAllowed((v) => !v);
          setConfirmHint(false);
        }}
      />
      {confirmHint ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="sell-confirm-hint">
          {copy.confirmBanned}
        </Text>
      ) : null}
      {error ? (
        <View testID="sell-post-error">
          <Banner kind="error" message={error} />
        </View>
      ) : null}
    </SellStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, gap: theme.space.xs },
  list: { gap: theme.space.sm },
  field: { gap: theme.space.xs },
  spot: (selected: boolean) => ({
    borderRadius: theme.radius.control,
    borderWidth: 1.5,
    borderColor: selected ? theme.colors.ink : theme.colors.line,
    backgroundColor: theme.colors.card,
  }),
  spotMain: {
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    padding: theme.space.md,
  },
  box: (selected: boolean) => ({
    width: 22,
    height: 22,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: selected ? theme.colors.ink : theme.colors.line2,
    backgroundColor: selected ? theme.colors.ink : 'transparent',
  }),
  tag: { flexDirection: 'row' },
  preview: {
    flexDirection: 'row',
    gap: theme.space.md,
    padding: theme.space.sm,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  thumb: { width: 60, height: 60 },
}));
