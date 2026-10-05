import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { getEnv } from '@/lib/env';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { osPermissions, type OsApi } from '@/lib/permissions';
import { campus as copy } from '@/strings/en';

import { sellApi, type PostedListing, type SellApi } from '../sell/api';
import { cleanPrice, DESCRIPTION_MAX, TITLE_MAX } from '../sell/logic';
import { campusKeys } from './api';
import { formErrorText, validateWanted, wantedArgs, type FormError } from './logic';
import { PhotoField, PostedView, postFailure, usePostPhoto, useReservedId } from './PostShared';

type Deps = {
  api?: Pick<SellApi, 'reserveListingId' | 'uploadPhoto' | 'createListing' | 'categories'>;
  pick?: () => Promise<PickedPhoto[]>;
  photosOs?: OsApi;
  openSettings?: () => Promise<unknown>;
  mediaBase?: () => string;
};

/**
 * C03 Post a Wanted (P5-SELL-06; board C5): what you're looking for, an
 * optional budget and category, details and an optional photo. Sellers who
 * have one answer with "I have this" (P5-SELL-08); 5 a day.
 */
export function PostWantedScreen({
  api = sellApi,
  pick = () => pickPhotos('library', 1),
  photosOs = osPermissions.photos,
  openSettings = () => Linking.openSettings(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.categories,
    staleTime: Infinity,
  });
  const reserved = useReservedId(api);
  const photo = usePostPhoto({ api, reserve: reserved.get, pick, photosOs });
  const [title, setTitle] = useState('');
  const [budget, setBudget] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
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
      setShowErrors(true);
      return;
    }
    setPosting(true);
    try {
      const id = await reserved.get();
      const listing = await api.createListing(wantedArgs(id, form));
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
          onSeeFeed={() =>
            router.navigate({ pathname: '/discover/campus', params: { kind: 'wanted' } })
          }
          onDone={leave}
          testID="wanted-posted"
        />
      </View>
    );
  }

  const parents = (categories.data ?? []).filter((c) => c.parentId === null);

  return (
    <View style={styles.root} testID="screen-post-wanted">
      <NavBar
        title={copy.wantedTitle}
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
            testID="wanted-post"
          />
        }
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Input
            label={copy.wantedWhat}
            placeholder={copy.wantedWhatPlaceholder}
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            error={errorFor('title')}
            testID="wanted-title"
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
          <TextArea
            label={copy.detailsLabel}
            placeholder={copy.detailsPlaceholder}
            value={description}
            onChangeText={setDescription}
            maxLength={DESCRIPTION_MAX}
            testID="wanted-details"
          />
          <PhotoField
            state={photo}
            mediaBase={mediaBase()}
            onOpenSettings={() => void openSettings()}
            testID="wanted"
          />
          <View style={styles.note}>
            <Icon name="info" size={18} tone="ink2" />
            <Text variant="meta" tone="ink2" style={styles.flex}>
              {copy.wantedNote}
            </Text>
          </View>
          {showErrors && errors.length > 0 ? (
            <View testID="wanted-fix">
              <Banner kind="error" message={copy.fixFirst} />
            </View>
          ) : null}
          {error ? (
            <View testID="wanted-error">
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
  body: { gap: theme.space.lg, padding: theme.space.screen, paddingBottom: theme.space['2xl'] },
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
