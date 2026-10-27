import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { Toggle } from '@/components/Toggle';
import { getEnv } from '@/lib/env';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { osPermissions, type OsApi } from '@/lib/permissions';
import { campus as copy } from '@/strings';

import { sellApi, type PostedListing, type SellApi } from '../sell/api';
import { cleanPrice, DESCRIPTION_MAX, TITLE_MAX } from '../sell/logic';
import { campusKeys, wantedPrefsApi, type WantedPrefsApi } from './api';
import {
  formErrorText,
  NEED_BY,
  needByDate,
  validateWanted,
  wantedArgs,
  type FormError,
  type NeedBy,
} from './logic';
import {
  PhotoField,
  PostedView,
  PostForm,
  postFailure,
  usePostPhoto,
  useReservedId,
  type PhotoSource,
} from './PostShared';

type Deps = {
  api?: Pick<SellApi, 'reserveListingId' | 'uploadPhoto' | 'createListing' | 'categories'>;
  pick?: (source: PhotoSource) => Promise<PickedPhoto[]>;
  photosOs?: OsApi;
  cameraOs?: OsApi;
  openSettings?: () => Promise<unknown>;
  mediaBase?: () => string;
  prefs?: WantedPrefsApi;
  now?: () => Date;
};

/**
 * C03 Post a Wanted (P5-SELL-06; board C5): what you're looking for, an
 * optional budget and category, details and an optional photo. Sellers who
 * have one answer with "I have this" (P5-SELL-08); 5 a day.
 */
export function PostWantedScreen({
  api = sellApi,
  pick = (source) => pickPhotos(source, 1),
  photosOs = osPermissions.photos,
  cameraOs = osPermissions.camera,
  openSettings = () => Linking.openSettings(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  prefs = wantedPrefsApi,
  now = () => new Date(),
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
    staleTime: Infinity,
  });
  const reserved = useReservedId(api);
  const photo = usePostPhoto({ api, reserve: reserved.get, pick, photosOs, cameraOs });
  const [title, setTitle] = useState('');
  const [budget, setBudget] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [needBy, setNeedBy] = useState<NeedBy>('none');
  const [alerts, setAlerts] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<PostedListing | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/sell'));
  const form = { title, budget, categoryId, description, photo: photo.photo };
  const errors = validateWanted(form);
  const errorFor = (field: FormError['field']) => {
    if (!showErrors) return undefined;
    const e = errors.find((x) => x.field === field);
    return e ? formErrorText(e) : undefined;
  };

  const submit = async () => {
    if (posting || photo.busy) return;
    setError(null);
    if (errors.length > 0) {
      // One line in the dock, which rides above the keyboard (3.03): no Toast.
      setShowErrors(true);
      return;
    }
    setPosting(true);
    try {
      const id = await reserved.get();
      const listing = await api.createListing(wantedArgs(id, form));
      const date = needByDate(needBy, now());
      // Defaults (no date, alerts on) need no second call.
      if (date || !alerts) await prefs.setWantedPrefs(listing.id, date, alerts).catch(() => {});
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
          title={copy.wantedPostedTitle}
          body={copy.wantedPostedBody}
          onSeeFeed={() => router.navigate({ pathname: '/feed', params: { kind: 'wanted' } })}
          onDone={leave}
          testID="wanted-posted"
        />
      </View>
    );
  }

  const parents = (categories.data ?? []).filter((c) => c.parentId === null);

  return (
    <PostForm
      title={copy.wantedTitle}
      onClose={leave}
      fixing={showErrors && errors.length > 0}
      error={error}
      posting={posting}
      disabled={photo.busy}
      onPost={() => void submit()}
      testID="wanted"
      screenTestID="screen-post-wanted"
    >
      <Input
        label={copy.wantedWhat}
        placeholder={copy.wantedWhatPlaceholder}
        value={title}
        onChangeText={setTitle}
        maxLength={TITLE_MAX}
        error={errorFor('title')}
        testID="wanted-title"
      />
      {/* A photo of what you mean, right under the ask (owner review 2026-10-24). */}
      <PhotoField
        state={photo}
        mediaBase={mediaBase()}
        onOpenSettings={() => void openSettings()}
        testID="wanted"
      />
      <View style={styles.gap}>
        <Input
          label={copy.budgetLabel}
          kind="price"
          placeholder={copy.budgetPlaceholder}
          value={budget}
          onChangeText={(v) => setBudget(cleanPrice(v))}
          error={errorFor('budget')}
          testID="wanted-budget"
        />
        <Text variant="meta" tone="ink2">
          {copy.budgetHint}
        </Text>
      </View>
      <View style={styles.gap}>
        <Text variant="label" tone="ink2">
          {copy.needByLabel}
        </Text>
        <View
          style={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel={copy.needByLabel}
          testID="wanted-need-by"
        >
          {NEED_BY.map((n) => (
            <Chip
              key={n}
              label={copy.needBy[n]}
              selected={needBy === n}
              onPress={() => setNeedBy(n)}
              testID={`wanted-need-by-${n}`}
            />
          ))}
        </View>
      </View>
      <TextArea
        label={copy.detailsLabel}
        placeholder={copy.detailsPlaceholder}
        value={description}
        onChangeText={setDescription}
        maxLength={DESCRIPTION_MAX}
        testID="wanted-details"
      />
      {parents.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="label" tone="ink2">
            {copy.categoryLabel}
          </Text>
          <View
            style={styles.chips}
            accessibilityRole="radiogroup"
            accessibilityLabel={copy.categoryLabel}
            testID="wanted-categories"
          >
            {parents.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              />
            ))}
          </View>
          <Text variant="meta" tone="ink2">
            {copy.categoryHint}
          </Text>
        </View>
      ) : null}
      <Toggle
        label={copy.alertMe}
        description={copy.alertMeBody}
        value={alerts}
        onChange={setAlerts}
      />
    </PostForm>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  gap: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
}));
