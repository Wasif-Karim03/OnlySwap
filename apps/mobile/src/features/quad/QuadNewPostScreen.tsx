import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Icon } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { errorText, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { osPermissions, primerStep, type OsApi } from '@/lib/permissions';
import { uuid } from '@/lib/uuid';
import { quad as copy } from '@/strings';

import { mediaUrl } from '../sell/logic';
import { quadApi, type NewQuadPost, type QuadApi } from './api';
import { quadKeys } from './cache';
import { OutcomeSheet, type Outcome } from './components/OutcomeSheet';
import {
  BODY_MAX,
  canAddOption,
  canPost,
  canRemoveOption,
  checkinBody,
  PLACE_MAX,
  POLL_OPTION_MAX,
  VIBES,
  type PostMode,
  type Vibe,
} from './logic';

const MODES: PostMode[] = ['text', 'photo', 'poll', 'checkin'];

type Deps = {
  api?: QuadApi;
  pick?: () => Promise<PickedPhoto[]>;
  photosOs?: OsApi;
  openSettings?: () => Promise<unknown>;
  newId?: () => string;
  mediaBase?: () => string;
};

/**
 * Q07 New post (P10-QUAD-05; check-in is R2-QUAD-CHECKIN). Text, one photo,
 * a 2 to 4 option poll, or a check-in that ends after 3 hours. The server's
 * filter answers live, held (Q10) or blocked (Q9, nothing saved).
 */
export function QuadNewPostScreen({
  api = quadApi,
  pick = () => pickPhotos('library', 1),
  photosOs = osPermissions.photos,
  openSettings = () => Linking.openSettings(),
  newId = uuid,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  // One id per draft: the photo folder, and a retry returns the same post.
  const [postId] = useState(newId);
  const [mode, setMode] = useState<PostMode>('text');
  const [body, setBody] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [place, setPlace] = useState('');
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photosOff, setPhotosOff] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/quad'));
  const valid = canPost({ mode, body, photoPath, photoBusy, options, place });

  const addPhoto = async () => {
    setError(null);
    let step = primerStep(await photosOs.get());
    if (step === 'primer') step = primerStep(await photosOs.request());
    if (step !== 'granted') {
      setPhotosOff(true);
      return;
    }
    setPhotosOff(false);
    let picked: PickedPhoto | undefined;
    try {
      picked = (await pick())[0];
    } catch {
      setPhotosOff(true);
      return;
    }
    if (!picked) return;
    setPhotoUri(picked.uri);
    setPhotoPath(null);
    setPhotoBusy(true);
    try {
      setPhotoPath(await api.uploadPhoto(postId, picked, () => {}));
    } catch {
      setPhotoUri(null);
      setError(copy.photoFailed);
    } finally {
      setPhotoBusy(false);
    }
  };

  const input = (): NewQuadPost => {
    const id = postId;
    if (mode === 'checkin') {
      const labels = vibes.map((v) => copy.vibes[v]);
      return {
        kind: 'checkin',
        body: checkinBody(body, labels, place),
        place: place.trim(),
        post_id: id,
      };
    }
    if (mode === 'poll') {
      return {
        kind: 'poll',
        body: body.trim(),
        poll: { options: options.map((o) => o.trim()) },
        post_id: id,
      };
    }
    if (mode === 'photo')
      return { kind: 'photo', body: body.trim(), photo_path: photoPath, post_id: id };
    return { kind: 'text', body: body.trim(), post_id: id };
  };

  const submit = async () => {
    if (!valid || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await api.createPost(input());
      if (res.status === 'live') {
        void qc.invalidateQueries({ queryKey: quadKeys.feeds });
        useToastStore.getState().show('success', copy.posted);
        if (router.canDismiss()) router.dismissTo({ pathname: '/quad', params: { sort: 'new' } });
        else router.replace({ pathname: '/quad', params: { sort: 'new' } });
        return;
      }
      setOutcome({ status: res.status, reason: res.reason });
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'RULES_REQUIRED' || err.code === 'FEATURE_OFF') {
        await qc.invalidateQueries({ queryKey: quadKeys.status });
        router.replace('/quad');
        return;
      }
      setError(errorText(e));
    } finally {
      setPosting(false);
    }
  };

  const textLabel =
    mode === 'poll'
      ? copy.pollQuestionLabel
      : mode === 'checkin'
        ? copy.checkinNoteLabel
        : copy.bodyLabel;

  return (
    <View style={styles.root} testID="screen-quad-new">
      <NavBar
        title={copy.newTitle}
        leading="close"
        onLeading={leave}
        trailing={
          <Button
            label={copy.post}
            size="S"
            variant="dark"
            disabled={!valid}
            loading={posting}
            onPress={() => void submit()}
            testID="quad-post-submit"
          />
        }
      />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SegmentedControl
            label={copy.modeLabel}
            segments={MODES.map((m) => ({ value: m, label: copy.modes[m] }))}
            value={mode}
            onChange={setMode}
          />
          {mode === 'checkin' ? (
            <>
              <Input
                label={copy.placeLabel}
                placeholder={copy.placePlaceholder}
                value={place}
                onChangeText={setPlace}
                maxLength={PLACE_MAX}
                testID="quad-place"
              />
              <ChipGroup
                label={copy.vibesLabel}
                options={VIBES.map((v) => ({ value: v, label: copy.vibes[v] }))}
                value={vibes}
                onChange={setVibes}
              />
            </>
          ) : null}
          <TextArea
            label={textLabel}
            placeholder={copy.bodyPlaceholder}
            maxLength={BODY_MAX}
            value={body}
            onChangeText={setBody}
            testID="quad-body"
          />
          {mode === 'photo' ? (
            <View style={styles.gap}>
              {photoUri ? (
                <Photo
                  source={photoPath ? mediaUrl(mediaBase(), photoPath) : photoUri}
                  aspectRatio={4 / 3}
                  rounded="thumb"
                  accessibilityLabel={copy.photoLabel}
                />
              ) : null}
              {photoBusy ? (
                <Text variant="meta" tone="ink2" accessibilityLiveRegion="polite">
                  {copy.photoUploading}
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  label={photoUri ? copy.changePhoto : copy.addPhoto}
                  variant="secondary"
                  size="M"
                  disabled={photoBusy}
                  onPress={() => void addPhoto()}
                  testID="quad-add-photo"
                />
                {photoUri && !photoBusy ? (
                  <Button
                    label={copy.removePhoto}
                    variant="text"
                    size="M"
                    onPress={() => {
                      setPhotoUri(null);
                      setPhotoPath(null);
                    }}
                  />
                ) : null}
              </View>
              {photosOff ? (
                <View style={styles.gap} testID="quad-photos-off">
                  <Banner kind="warning" message={copy.photosOff} />
                  <Button
                    label={copy.openSettings}
                    variant="secondary"
                    size="M"
                    onPress={() => void openSettings()}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {mode === 'poll' ? (
            <View style={styles.gap}>
              {options.map((o, i) => (
                <View key={i} style={styles.optionRow}>
                  <View style={styles.flex}>
                    <Input
                      label={fill(copy.pollOptionLabel, { n: i + 1 })}
                      value={o}
                      onChangeText={(v) =>
                        setOptions((all) => all.map((x, j) => (j === i ? v : x)))
                      }
                      maxLength={POLL_OPTION_MAX}
                      testID={`quad-option-${i}`}
                    />
                  </View>
                  {canRemoveOption(options) ? (
                    <IconButton
                      icon="x"
                      accessibilityLabel={fill(copy.removeOption, { n: i + 1 })}
                      onPress={() => setOptions((all) => all.filter((_, j) => j !== i))}
                    />
                  ) : null}
                </View>
              ))}
              {canAddOption(options) ? (
                <Button
                  label={copy.addOption}
                  variant="secondary"
                  size="M"
                  onPress={() => setOptions((all) => [...all, ''])}
                  testID="quad-add-option"
                />
              ) : null}
              <Text variant="meta" tone="ink2">
                {copy.pollHint}
              </Text>
            </View>
          ) : null}
          {mode === 'checkin' ? (
            <Text variant="meta" tone="ink2">
              {copy.checkinHint}
            </Text>
          ) : null}
          <View style={styles.anon}>
            <Icon name="lock" size={16} tone="ink2" />
            <Text variant="meta" tone="ink2">
              {copy.anonNote}
            </Text>
          </View>
          {error ? (
            <View accessibilityLiveRegion="polite" testID="quad-post-error">
              <Banner kind="error" message={error} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <OutcomeSheet
        outcome={outcome}
        onClose={() => setOutcome(null)}
        onEdit={() => setOutcome(null)}
        onListing={() => {
          setOutcome(null);
          router.replace('/sell');
        }}
        onDone={() => {
          setOutcome(null);
          void qc.invalidateQueries({ queryKey: quadKeys.all });
          leave();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  body: { gap: theme.space.lg, padding: theme.space.screen },
  gap: { gap: theme.space.sm },
  row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  optionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.xs },
  anon: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
}));
