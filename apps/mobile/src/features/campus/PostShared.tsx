import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { Sheet } from '@/components/Sheet';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { errorText, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import type { PickedPhoto } from '@/lib/media';
import { primerStep, type OsApi } from '@/lib/permissions';
import { chat as chatCopy, campus as copy } from '@/strings';

import type { PostedListing, SellApi } from '../sell/api';
import { mediaUrl } from '../sell/logic';
import { DockedScroll } from '../sell/SellStep';
import { postErrorText, type UploadedPhotoRef } from './logic';

export type PhotoSource = 'camera' | 'library';

/** Asks the OS for the camera or the photo library; true when allowed. */
async function allowed(os: OsApi): Promise<boolean> {
  let step = primerStep(await os.get());
  if (step === 'primer') step = primerStep(await os.request());
  return step === 'granted';
}

/**
 * "Take a photo" or "Choose from library" (owner, 2026-10-15): the same two
 * choices as a chat photo, for every post form.
 */
export function PhotoSourceSheet({
  visible,
  onClose,
  onChoose,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (source: PhotoSource) => void;
  testID: string;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={copy.addPhoto}
      testID={`${testID}-photo-sheet`}
    >
      <Button
        label={chatCopy.photoCamera}
        variant="secondary"
        onPress={() => onChoose('camera')}
        testID={`${testID}-photo-camera`}
      />
      <Button
        label={chatCopy.photoLibrary}
        variant="secondary"
        onPress={() => onChoose('library')}
        testID={`${testID}-photo-library`}
      />
    </Sheet>
  );
}

/** The sheet's open state and the pick it leads to. */
function useSourceSheet(add: (source: PhotoSource) => Promise<void>) {
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => setOpen(true),
    close: () => setOpen(false),
    choose: (source: PhotoSource) => {
      setOpen(false);
      void add(source);
    },
  };
}

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
  cameraOs,
}: {
  api: Pick<SellApi, 'uploadPhoto'>;
  reserve: () => Promise<string>;
  pick: (source: PhotoSource) => Promise<PickedPhoto[]>;
  photosOs: OsApi;
  cameraOs: OsApi;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [photo, setPhoto] = useState<UploadedPhotoRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState<PhotoSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (source: PhotoSource = 'library') => {
    setError(null);
    if (!(await allowed(source === 'camera' ? cameraOs : photosOs))) {
      setOff(source);
      return;
    }
    setOff(null);
    let picked: PickedPhoto | undefined;
    try {
      picked = (await pick(source))[0];
    } catch {
      setOff(source);
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
  const sheet = useSourceSheet(state.add);
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
          onPress={sheet.show}
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
        <View style={styles.gap} testID={`${testID}-${off === 'camera' ? 'camera' : 'photos'}-off`}>
          <Banner kind="warning" message={off === 'camera' ? copy.cameraOff : copy.photosOff} />
          <Button label={copy.openSettings} variant="secondary" size="M" onPress={onOpenSettings} />
        </View>
      ) : null}
      <PhotoSourceSheet
        visible={sheet.open}
        onClose={sheet.close}
        onChoose={sheet.choose}
        testID={testID}
      />
    </View>
  );
}

type PostPhotoItem = { key: string; uri: string; photo: UploadedPhotoRef | null };

/**
 * Up to `max` photos through the Sell photo pipeline (news posts, DEC 98).
 * Each picked photo uploads on its own; a failed one is dropped with a note.
 * `pick(n)` asks the library for at most n more.
 */
export function usePostPhotos({
  api,
  reserve,
  pick,
  photosOs,
  cameraOs,
  max,
}: {
  api: Pick<SellApi, 'uploadPhoto'>;
  reserve: () => Promise<string>;
  pick: (source: PhotoSource, limit: number) => Promise<PickedPhoto[]>;
  photosOs: OsApi;
  cameraOs: OsApi;
  max: number;
}) {
  const [items, setItems] = useState<PostPhotoItem[]>([]);
  const [uploading, setUploading] = useState(0);
  const [off, setOff] = useState<PhotoSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const add = async (source: PhotoSource = 'library') => {
    setError(null);
    const room = max - items.length;
    if (room <= 0) return;
    if (!(await allowed(source === 'camera' ? cameraOs : photosOs))) {
      setOff(source);
      return;
    }
    setOff(null);
    let picked: PickedPhoto[];
    try {
      picked = (await pick(source, room)).slice(0, room);
    } catch {
      setOff(source);
      return;
    }
    if (picked.length === 0) return;
    const added = picked.map((p) => ({ key: `p${(seq.current += 1)}`, uri: p.uri, photo: null }));
    setItems((cur) => [...cur, ...added]);
    setUploading((n) => n + added.length);
    await Promise.all(
      picked.map(async (p, i) => {
        const key = added[i]!.key;
        try {
          const id = await reserve();
          const photo = await api.uploadPhoto(id, p, () => {});
          setItems((cur) => cur.map((x) => (x.key === key ? { ...x, photo } : x)));
        } catch {
          setItems((cur) => cur.filter((x) => x.key !== key));
          setError(copy.photoFailed);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  const remove = (key: string) => setItems((cur) => cur.filter((x) => x.key !== key));

  const photos = items.flatMap((x) => (x.photo ? [x.photo] : []));
  return { items, photos, busy: uploading > 0, off, error, max, add, remove };
}

export function PhotosField({
  state,
  label,
  mediaBase,
  onOpenSettings,
  testID,
}: {
  state: ReturnType<typeof usePostPhotos>;
  label: string;
  mediaBase: string;
  onOpenSettings: () => void;
  testID: string;
}) {
  const { items, busy, off, error, max } = state;
  const sheet = useSourceSheet(state.add);
  return (
    <View style={styles.gap}>
      <Text variant="label" tone="ink2">
        {label}
      </Text>
      {items.length > 0 ? (
        <View style={styles.row} testID={`${testID}-photos`}>
          {items.map((x, i) => (
            <View key={x.key} style={styles.preview}>
              <Photo
                source={x.photo ? mediaUrl(mediaBase, x.photo.thumbPath) : x.uri}
                blurhash={x.photo?.blurhash}
                rounded="thumb"
                accessibilityLabel={copy.photoLabel}
              />
              {x.photo ? (
                <Button
                  label={copy.removePhoto}
                  accessibilityHint={fill(copy.removePhotoN, { i: i + 1 })}
                  variant="text"
                  size="S"
                  fullWidth={false}
                  onPress={() => state.remove(x.key)}
                  testID={`${testID}-remove-photo-${i}`}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {busy ? (
        <Text variant="meta" tone="ink2" accessibilityLiveRegion="polite">
          {copy.photoUploading}
        </Text>
      ) : null}
      {items.length < max ? (
        <View style={styles.row}>
          <Button
            label={copy.addPhotos}
            variant="secondary"
            size="M"
            fullWidth={false}
            disabled={busy}
            onPress={sheet.show}
            testID={`${testID}-add-photo`}
          />
        </View>
      ) : null}
      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {off ? (
        <View style={styles.gap} testID={`${testID}-${off === 'camera' ? 'camera' : 'photos'}-off`}>
          <Banner kind="warning" message={off === 'camera' ? copy.cameraOff : copy.photosOff} />
          <Button label={copy.openSettings} variant="secondary" size="M" onPress={onOpenSettings} />
        </View>
      ) : null}
      <PhotoSourceSheet
        visible={sheet.open}
        onClose={sheet.close}
        onChoose={sheet.choose}
        testID={testID}
      />
    </View>
  );
}

/** The message for a failed Post: the caps and banned words first, then the shared copy. */
export function postFailure(e: unknown): { text: string; forbidden: boolean } {
  const err = toAppError(e);
  return { text: postErrorText(err) ?? errorText(err), forbidden: err.code === 'FORBIDDEN' };
}

/**
 * Frame for the campus post forms (3.03): an inline NavBar with title and
 * close only, the fields, and Post docked at the bottom like the Sell steps.
 * The dock carries the one "fix the fields" line (polite live region) and any
 * post error, so nothing important sits under the keyboard or off screen.
 */
export function PostForm({
  title,
  onClose,
  fixing,
  error,
  posting,
  disabled,
  onPost,
  testID,
  screenTestID,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Show the "Fix the highlighted fields to post." line. */
  fixing: boolean;
  /** A failed Post (daily cap, banned word, offline). */
  error: string | null;
  posting: boolean;
  disabled: boolean;
  onPost: () => void;
  /** Prefix for the dock's test ids: `{testID}-post`, `-fix`, `-error`. */
  testID: string;
  screenTestID: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.root} testID={screenTestID}>
      <NavBar title={title} leading="close" onLeading={onClose} />
      <DockedScroll
        dock={
          <>
            <View collapsable={false} style={styles.gap}>
              {fixing ? (
                <Text
                  variant="meta"
                  tone="red"
                  accessibilityLiveRegion="polite"
                  testID={`${testID}-fix`}
                >
                  {copy.fixFirst}
                </Text>
              ) : null}
              {error ? (
                <View testID={`${testID}-error`}>
                  <Banner kind="error" message={error} />
                </View>
              ) : null}
            </View>
            <Button
              label={copy.post}
              loading={posting}
              disabled={disabled}
              onPress={onPost}
              testID={`${testID}-post`}
            />
          </>
        }
      >
        <View style={styles.fields}>{children}</View>
      </DockedScroll>
    </View>
  );
}

/** Posted (or in review) with a way back to the feed: left aligned, actions docked (3.03). */
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
      {/* No haptic here: Food and Wanted do not count as "listing posted" (owner decision 5). */}
      <View style={styles.postedCopy}>
        <SuccessCheck visible accessibilityLabel={copy.postedCheck} />
        <Text variant="title" accessibilityRole="header">
          {review ? copy.reviewTitle : title}
        </Text>
        <Text variant="body" tone="ink2" style={styles.copyMax}>
          {review ? copy.reviewBody : body}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label={copy.seeCampus} onPress={onSeeFeed} testID={`${testID}-see`} />
        <Button label={copy.done} variant="text" onPress={onDone} testID={`${testID}-done`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  fields: { gap: theme.space.lg },
  gap: { gap: theme.space.sm },
  row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  preview: { width: theme.size.glyphTile * 1.5 },
  posted: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: rt.insets.bottom + theme.space.md,
  },
  postedCopy: { gap: theme.space.md },
  copyMax: { maxWidth: theme.size.copyMax },
  actions: { gap: theme.space.xs },
}));
