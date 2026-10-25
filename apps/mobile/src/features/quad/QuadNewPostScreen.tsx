import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { readableColumn } from '@/theme/layout';

import { mediaUrl } from '../sell/logic';
import { PhotoSourceSheet, type PhotoSource } from '../campus/PostShared';

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

// Check-ins are off (UX audit 2026-10-25): with real names (DEC 150) a
// check-in told strangers where a named student, maybe under 18, is right
// now. The mode and its rendering stay so turning it back on is one line.
export const CHECKINS_ENABLED = false;
const MODES: PostMode[] = CHECKINS_ENABLED
  ? ['text', 'photo', 'poll', 'checkin']
  : ['text', 'photo', 'poll'];
// DEC 130: the Quad is the Feed's Quad chip; after posting it opens on New.
const QUAD_HOME = { pathname: '/feed', params: { kind: 'quad' } } as const;
const QUAD_NEW = { pathname: '/feed', params: { kind: 'quad', sort: 'new' } } as const;

type Deps = {
  api?: QuadApi;
  pick?: (source: PhotoSource) => Promise<PickedPhoto[]>;
  photosOs?: OsApi;
  cameraOs?: OsApi;
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
  pick = (source) => pickPhotos(source, 1),
  photosOs = osPermissions.photos,
  cameraOs = osPermissions.camera,
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
  const [photosOff, setPhotosOff] = useState<PhotoSource | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const leave = () => (router.canGoBack() ? router.back() : router.replace(QUAD_HOME));
  // Closing with anything typed or picked asks first (local form state only).
  const dirty =
    body.trim() !== '' ||
    place.trim() !== '' ||
    vibes.length > 0 ||
    options.some((o) => o.trim() !== '') ||
    photoUri !== null;
  const close = () => (dirty ? setConfirmDiscard(true) : leave());
  const valid = canPost({ mode, body, photoPath, photoBusy, options, place });

  const addPhoto = async (source: PhotoSource) => {
    setPhotoSheet(false);
    setError(null);
    const os = source === 'camera' ? cameraOs : photosOs;
    let step = primerStep(await os.get());
    if (step === 'primer') step = primerStep(await os.request());
    if (step !== 'granted') {
      setPhotosOff(source);
      return;
    }
    setPhotosOff(null);
    let picked: PickedPhoto | undefined;
    try {
      picked = (await pick(source))[0];
    } catch {
      setPhotosOff(source);
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
        if (router.canDismiss()) router.dismissTo(QUAD_NEW);
        else router.replace(QUAD_NEW);
        return;
      }
      setOutcome({ status: res.status, reason: res.reason });
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'RULES_REQUIRED' || err.code === 'FEATURE_OFF') {
        await qc.invalidateQueries({ queryKey: quadKeys.status });
        router.replace(QUAD_HOME);
        return;
      }
      setError(errorText(e));
      // The note sits at the end of the form, often under the keyboard.
      useToastStore.getState().show('error', errorText(e));
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
      <NavBar title={copy.newTitle} leading="close" onLeading={close} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Who sees your name, first, above the keyboard (DEC 150: not anonymous). */}
          <View style={styles.anon}>
            <Icon name="user" size={16} tone="ink2" />
            <Text variant="label" tone="ink2" style={styles.flex}>
              {copy.anonNote}
            </Text>
          </View>
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
              <Text variant="meta" tone="ink2">
                {copy.checkinHint}
              </Text>
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
                  onPress={() => setPhotoSheet(true)}
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
                <View
                  style={styles.gap}
                  testID={photosOff === 'camera' ? 'quad-camera-off' : 'quad-photos-off'}
                >
                  <Banner
                    kind="warning"
                    message={photosOff === 'camera' ? copy.cameraOff : copy.photosOff}
                  />
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
          {error ? (
            <View accessibilityLiveRegion="polite" testID="quad-post-error">
              <Banner kind="error" message={error} />
            </View>
          ) : null}
        </ScrollView>
        {/* The one primary action, docked where the thumb is; it rides the keyboard. */}
        <View style={styles.dock}>
          <Button
            label={copy.post}
            variant="dark"
            disabled={!valid}
            loading={posting}
            onPress={() => void submit()}
            testID="quad-post-submit"
          />
        </View>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={confirmDiscard}
        title={copy.discardTitle}
        message={copy.discardBody}
        confirmLabel={copy.discardConfirm}
        cancelLabel={copy.discardKeep}
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          leave();
        }}
        onCancel={() => setConfirmDiscard(false)}
        testID="quad-discard"
      />
      <PhotoSourceSheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        onChoose={(source) => void addPhoto(source)}
        testID="quad"
      />
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

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  body: { ...readableColumn, gap: theme.space.lg, padding: theme.space.screen },
  gap: { gap: theme.space.sm },
  row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  optionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.xs },
  anon: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  dock: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
}));
