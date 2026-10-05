import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { osPermissions, type OsApi } from '@/lib/permissions';
import { campus as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { sellApi, type PostedListing, type SellApi } from '../sell/api';
import { MEET_NOTE_MAX, sortSpots, TITLE_MAX } from '../sell/logic';
import { campusKeys } from './api';
import {
  FOOD_MINUTES,
  FOOD_MINUTES_DEFAULT,
  foodArgs,
  foodMinutesLabel,
  formErrorText,
  validateFood,
  type FormError,
} from './logic';
import { PhotoField, PostedView, postFailure, usePostPhoto, useReservedId } from './PostShared';

const OTHER = 'other';

type Deps = {
  api?: Pick<SellApi, 'reserveListingId' | 'uploadPhoto' | 'createListing' | 'spots'>;
  pick?: () => Promise<PickedPhoto[]>;
  photosOs?: OsApi;
  openSettings?: () => Promise<unknown>;
  mediaBase?: () => string;
};

/**
 * C02 Post free food (P5-SELL-06; board C2): what, where (a meetup spot or
 * typed place), how long it's around (30 min to 3 h) and an optional photo.
 * create_listing(kind food) expires it on its own; 3 a day.
 */
export function PostFoodScreen({
  api = sellApi,
  pick = () => pickPhotos('library', 1),
  photosOs = osPermissions.photos,
  openSettings = () => Linking.openSettings(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  const spotsQuery = useQuery({ queryKey: ['safe_spots'], queryFn: api.spots });
  const reserved = useReservedId(api);
  const photo = usePostPhoto({ api, reserve: reserved.get, pick, photosOs });
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [minutes, setMinutes] = useState<number>(FOOD_MINUTES_DEFAULT);
  const [showErrors, setShowErrors] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<PostedListing | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/sell'));
  const form = {
    title,
    spotId: where && where !== OTHER ? where : null,
    place: where === OTHER ? place : '',
    minutes,
    photo: photo.photo,
  };
  const errors = validateFood(form);
  const errorFor = (field: FormError['field']) => {
    if (!showErrors) return undefined;
    const e = errors.find((x) => x.field === field);
    return e ? formErrorText(e) : undefined;
  };

  const submit = async () => {
    if (posting || photo.busy) return;
    setError(null);
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    setPosting(true);
    try {
      const id = await reserved.get();
      const listing = await api.createListing(foodArgs(id, form));
      void qc.invalidateQueries({ queryKey: campusKeys.all });
      setPosted(listing);
    } catch (e) {
      const f = postFailure(e);
      if (f.forbidden) reserved.drop();
      setError(f.text);
    } finally {
      setPosting(false);
    }
  };

  if (posted) {
    return (
      <View style={styles.root}>
        <NavBar leading="close" onLeading={leave} />
        <PostedView
          listing={posted}
          title={copy.foodPostedTitle}
          body={copy.foodPostedBody}
          onSeeFeed={() =>
            router.navigate({ pathname: '/discover/campus', params: { kind: 'food' } })
          }
          onDone={leave}
          testID="food-posted"
        />
      </View>
    );
  }

  const spots = sortSpots(spotsQuery.data ?? []);
  const placeError = errorFor('place');

  return (
    <View style={styles.root} testID="screen-post-food">
      <NavBar
        title={copy.foodTitle}
        leading="close"
        onLeading={leave}
        trailing={
          <Button
            label={copy.post}
            size="S"
            variant="dark"
            fullWidth={false}
            loading={posting}
            disabled={photo.busy}
            onPress={() => void submit()}
            testID="food-post"
          />
        }
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Input
            label={copy.foodWhat}
            placeholder={copy.foodWhatPlaceholder}
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            error={errorFor('title')}
            testID="food-title"
          />

          <View style={styles.gap}>
            <Text variant="label" tone="ink2">
              {copy.foodWhere}
            </Text>
            <Text variant="meta" tone="ink2">
              {copy.foodWhereBody}
            </Text>
            {spotsQuery.isPending ? (
              <SkeletonList rows={2} />
            ) : spotsQuery.isError ? (
              <ErrorState
                layout="inline"
                error={spotsQuery.error}
                onRetry={() => spotsQuery.refetch()}
              />
            ) : (
              <View
                style={styles.chips}
                accessibilityRole="radiogroup"
                accessibilityLabel={copy.foodWhere}
                testID="food-spots"
              >
                {spots.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={where === s.id}
                    onPress={() => setWhere(where === s.id ? null : s.id)}
                  />
                ))}
                <Chip
                  label={copy.foodOther}
                  selected={where === OTHER}
                  onPress={() => setWhere(where === OTHER ? null : OTHER)}
                />
              </View>
            )}
            {where === OTHER ? (
              <Input
                label={copy.foodOther}
                placeholder={copy.foodOtherPlaceholder}
                value={place}
                onChangeText={setPlace}
                maxLength={MEET_NOTE_MAX}
                error={placeError}
                testID="food-place"
              />
            ) : placeError ? (
              <Text
                variant="meta"
                tone="red"
                accessibilityLiveRegion="polite"
                testID="food-place-error"
              >
                {placeError}
              </Text>
            ) : null}
          </View>

          <View style={styles.gap}>
            <Text variant="label" tone="ink2">
              {copy.foodFor}
            </Text>
            <View
              style={styles.chips}
              accessibilityRole="radiogroup"
              accessibilityLabel={copy.foodFor}
              testID="food-minutes"
            >
              {FOOD_MINUTES.map((m) => (
                <Chip
                  key={m}
                  label={foodMinutesLabel(m)}
                  selected={minutes === m}
                  onPress={() => setMinutes(m)}
                />
              ))}
            </View>
          </View>

          <PhotoField
            state={photo}
            mediaBase={mediaBase()}
            onOpenSettings={() => void openSettings()}
            testID="food"
          />

          <View style={styles.note}>
            <Icon name="clock" size={18} tone="ink2" />
            <Text variant="meta" tone="ink2" style={styles.flex}>
              {copy.foodNote}
            </Text>
          </View>

          {showErrors && errors.length > 0 ? (
            <View testID="food-fix">
              <Banner kind="error" message={copy.fixFirst} />
            </View>
          ) : null}
          {error ? (
            <View testID="food-error">
              <Banner kind="error" message={error} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  body: {
    ...readableColumn,
    gap: theme.space.lg,
    padding: theme.space.screen,
    paddingBottom: theme.space['2xl'],
  },
  gap: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  note: {
    flexDirection: 'row',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
}));
