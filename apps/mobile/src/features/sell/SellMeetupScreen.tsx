import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { devTrace } from '@/lib/devTrace';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { Icon } from '@/components/icons/Icon';
import { GroupedList } from '@/components/ListRow';
import { Checkbox } from '@/components/OptionRow';
import { Photo } from '@/components/Photo';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { errorCopy, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { sell as copy } from '@/strings';

import { sellApi, type SellApi } from './api';
import { getDraftStore, useDraft, type DraftState } from './draft';
import {
  AVAILABILITY,
  chosenSpots,
  createArgs,
  directionsUrl,
  listingPriceCents,
  mediaUrl,
  MEET_NOTE_MAX,
  priceLabel,
  releaseReservation,
  sortSpots,
  toggleSpot,
  type Availability,
  type Spot,
} from './logic';
import { draftCarry, usePostedStore } from './posted';
import { SellStep } from './SellStep';
import { a11yState } from '@/lib/a11y';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The shared checkbox mark (OptionRow), with its check glyph when on. */
function CheckMark({ on }: { on: boolean }) {
  return (
    <View style={styles.box(on)}>{on ? <Icon name="check" size={16} tone="inverse" /> : null}</View>
  );
}

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
    devTrace('post: loading on');
    try {
      const listing = await api.createListing(createArgs(draft, chosen));
      devTrace('post: created');
      track('listing_posted', { photos_count: draft.photos.length });
      usePostedStore.getState().set(listing, draft.photos[0]?.uri ?? null, draftCarry(draft));
      devTrace('post: draft reset');
      reset();
      devTrace('post: navigate');
      router.replace('/sell/posted');
    } catch (e) {
      const appError = toAppError(e);
      if (appError.code === 'FORBIDDEN') {
        // The reserved id is gone (a draft older than a day, or a reset
        // server): upload the photos again under a new one (step 1 retries).
        update(releaseReservation(store.getState().draft));
        // Say why the seller is back on step 1 instead of moving them silently (3.03).
        useToastStore.getState().show('error', copy.reservationExpired);
        router.replace('/sell');
        return;
      }
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

  return (
    <SellStep
      testID="screen-sell-meetup"
      step={3}
      leading="back"
      onLeading={() => (router.canGoBack() ? router.back() : router.replace('/sell/details'))}
      title={copy.meetupTitle}
      body={copy.meetupBody}
      dock={
        <>
          {/* The banned-items box sits right above Post (3.03), with the confirm
              hint and post errors. The wrapper is always mounted (not
              flattened) so messages appearing and leaving never re-insert
              views next to the button. */}
          <Checkbox
            label={copy.notBanned}
            selected={allowed}
            testID="sell-allowed"
            onPress={() => {
              setAllowed((v) => !v);
              setConfirmHint(false);
            }}
          />
          <View collapsable={false} style={styles.dockMessages}>
            {confirmHint ? (
              <Text
                variant="meta"
                tone="red"
                accessibilityLiveRegion="polite"
                testID="sell-confirm-hint"
              >
                {copy.confirmBanned}
              </Text>
            ) : null}
            {error ? (
              <View testID="sell-post-error">
                <Banner kind="error" message={error} />
              </View>
            ) : null}
          </View>
          <Button
            label={copy.post}
            onPress={() => void post()}
            loading={posting}
            testID="sell-post"
          />
        </>
      }
    >
      {/* What buyers will see, up top (P1, trust): photo, title, price. */}
      <View style={styles.preview} testID="sell-preview">
        <View style={styles.thumb}>
          <Photo source={coverSource} blurhash={cover?.blurhash} rounded="thumb" />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {draft.title.trim()}
          </Text>
          <Text variant="body" tone="ink2">
            {priceLabel(draft.kind, listingPriceCents(draft), copy.free)}
          </Text>
        </View>
      </View>

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
          <GroupedList surface="card">
            {[
              ...spots.map((spot) => {
                const selected = chosen.includes(spot.id);
                return (
                  <View key={spot.id} style={styles.spot}>
                    <Pressable
                      accessibilityRole="checkbox"
                      {...a11yState({ checked: selected })}
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
                      style={({ pressed }) => [styles.spotMain, pressed && styles.pressed]}
                    >
                      <CheckMark on={selected} />
                      <View style={styles.flex}>
                        {spot.police ? (
                          <View style={styles.tag}>
                            <Tag label={copy.police} tone="green" />
                          </View>
                        ) : null}
                        <Text variant="bodyStrong">{spot.name}</Text>
                        {spot.description || spot.hours ? (
                          <Text variant="meta" tone="ink2" numberOfLines={1}>
                            {[spot.description, spot.hours].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    <Button
                      label={copy.directions}
                      variant="text"
                      size="M"
                      fullWidth={false}
                      accessibilityHint={fill(copy.directionsLabel, { name: spot.name })}
                      onPress={() => void openUrl(directionsUrl(spot, Platform.OS))}
                    />
                  </View>
                );
              }),
              <Pressable
                key="chat"
                accessibilityRole="checkbox"
                {...a11yState({ checked: chosen.length === 0 })}
                accessibilityLabel={`${copy.decideInChat}, ${copy.decideInChatBody}`}
                onPress={() => {
                  setMaxHint(false);
                  update({ spotIds: [] });
                }}
                testID="sell-spot-chat"
                style={({ pressed }) => [styles.spotMain, pressed && styles.pressed]}
              >
                <CheckMark on={chosen.length === 0} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{copy.decideInChat}</Text>
                  <Text variant="meta" tone="ink2">
                    {copy.decideInChatBody}
                  </Text>
                </View>
              </Pressable>,
            ]}
          </GroupedList>
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
    </SellStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, gap: theme.space.xs },
  list: { gap: theme.space.sm },
  dockMessages: { gap: theme.space.xs },
  field: { gap: theme.space.xs },
  spot: { flexDirection: 'row', alignItems: 'center', paddingRight: theme.space.xs },
  spotMain: {
    flex: 1,
    minHeight: theme.space.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
  },
  pressed: { backgroundColor: theme.colors.bg3 },
  // Same mark as the shared Checkbox (OptionRow).
  box: (selected: boolean) => ({
    width: theme.space.xl,
    height: theme.space.xl,
    borderRadius: theme.space.sm,
    borderWidth: 2,
    borderColor: selected ? theme.colors.ink : theme.colors.line2,
    backgroundColor: selected ? theme.colors.ink : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  tag: { flexDirection: 'row' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  // 64 pt, the summary-row thumbnail shared with Posted (3.03).
  thumb: { width: theme.space['2xl'] * 2, height: theme.space['2xl'] * 2 },
}));
