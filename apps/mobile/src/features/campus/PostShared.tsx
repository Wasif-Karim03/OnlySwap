import { useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Photo } from '@/components/Photo';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { errorText, toAppError } from '@/lib/errors';
import type { PickedPhoto } from '@/lib/media';
import { primerStep, type OsApi } from '@/lib/permissions';
import { campus as copy } from '@/strings/en';

import type { PostedListing, SellApi } from '../sell/api';
import { mediaUrl } from '../sell/logic';
import { postErrorText, type UploadedPhotoRef } from './logic';

export type PostApi = Pick<SellApi, 'reserveListingId' | 'uploadPhoto' | 'createListing'>;

/**
 * One reserved listing id per form (reserve_listing_id), made on the first
 * photo or the first Post, so the photo folder and a retried Post use the
 * same id and never create a second post (BE-05).
 */
export function useReservedId(api: Pick<SellApi, 'reserveListingId'>) {
  const id = useRef<string | null>(null);
  const pending = useRef<Promise<string> | null>(null);
  return {
    get: async (): Promise<string> => {
      if (id.current) return id.current;
      pending.current ??= api.reserveListingId().finally(() => {
        pending.current = null;
      });
      id.current = await pending.current;
      return id.current;
    },
    /** The server forgot the id (FORBIDDEN): the next Post reserves a new one. */
    drop: () => {
      id.current = null;
    },
  };
}

/** Optional single photo through the Sell photo pipeline (EXIF stripped, thumb + full). */
export function usePostPhoto({
  api,
  reserve,
  pick,
  photosOs,
}: {
  api: Pick<SellApi, 'uploadPhoto'>;
  reserve: () => Promise<string>;
  pick: () => Promise<PickedPhoto[]>;
  photosOs: OsApi;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [photo, setPhoto] = useState<UploadedPhotoRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    let step = primerStep(await photosOs.get());
    if (step === 'primer') step = primerStep(await photosOs.request());
    if (step !== 'granted') {
      setOff(true);
      return;
    }
    setOff(false);
    let picked: PickedPhoto | undefined;
    try {
      picked = (await pick())[0];
    } catch {
      setOff(true);
      return;
    }
    if (!picked) return;
    setUri(picked.uri);
    setPhoto(null);
    setBusy(true);
    try {
      const id = await reserve();
      setPhoto(await api.uploadPhoto(id, picked, () => {}));
    } catch {
      setUri(null);
      setError(copy.photoFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setUri(null);
    setPhoto(null);
  };

  return { uri, photo, busy, off, error, add, remove };
}

export function PhotoField({
  state,
  mediaBase,
  onOpenSettings,
  testID,
}: {
  state: ReturnType<typeof usePostPhoto>;
  mediaBase: string;
  onOpenSettings: () => void;
  testID: string;
}) {
  const { uri, photo, busy, off, error } = state;
  return (
    <View style={styles.gap}>
      <Text variant="label" tone="ink2">
        {copy.photoOptional}
      </Text>
      {uri ? (
        <View style={styles.preview}>
          <Photo
            source={photo ? mediaUrl(mediaBase, photo.thumbPath) : uri}
            blurhash={photo?.blurhash}
            rounded="thumb"
            accessibilityLabel={copy.photoLabel}
          />
        </View>
      ) : null}
      {busy ? (
        <Text variant="meta" tone="ink2" accessibilityLiveRegion="polite">
          {copy.photoUploading}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={uri ? copy.changePhoto : copy.addPhoto}
          variant="secondary"
          size="M"
          fullWidth={false}
          disabled={busy}
          onPress={() => void state.add()}
          testID={`${testID}-add-photo`}
        />
        {uri && !busy ? (
          <Button
            label={copy.removePhoto}
            variant="text"
            size="M"
            fullWidth={false}
            onPress={state.remove}
            testID={`${testID}-remove-photo`}
          />
        ) : null}
      </View>
      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {off ? (
        <View style={styles.gap} testID={`${testID}-photos-off`}>
          <Banner kind="warning" message={copy.photosOff} />
          <Button label={copy.openSettings} variant="secondary" size="M" onPress={onOpenSettings} />
        </View>
      ) : null}
    </View>
  );
}

/** The message for a failed Post: the caps and banned words first, then the shared copy. */
export function postFailure(e: unknown): { text: string; forbidden: boolean } {
  const err = toAppError(e);
  return { text: postErrorText(err) ?? errorText(err), forbidden: err.code === 'FORBIDDEN' };
}

/** Posted (or in review) with a way back to the feed. */
export function PostedView({
  listing,
  title,
  body,
  onSeeFeed,
  onDone,
  testID,
}: {
  listing: PostedListing;
  title: string;
  body: string;
  onSeeFeed: () => void;
  onDone: () => void;
  testID: string;
}) {
  const review = listing.status === 'held_review';
  return (
    <View style={styles.posted} testID={testID}>
      <SuccessCheck visible accessibilityLabel={copy.postedCheck} />
      <Text variant="title" accessibilityRole="header" style={styles.center}>
        {review ? copy.reviewTitle : title}
      </Text>
      <Text variant="body" tone="ink2" style={styles.center}>
        {review ? copy.reviewBody : body}
      </Text>
      <View style={styles.actions}>
        <Button label={copy.seeCampus} onPress={onSeeFeed} testID={`${testID}-see`} />
        <Button label={copy.done} variant="secondary" onPress={onDone} testID={`${testID}-done`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  gap: { gap: theme.space.sm },
  row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  preview: { width: theme.size.glyphTile * 1.5 },
  posted: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
    padding: theme.space.screen,
  },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: theme.space.sm, marginTop: theme.space.lg },
}));
