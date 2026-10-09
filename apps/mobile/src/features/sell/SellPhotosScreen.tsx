import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { devTrace } from '@/lib/devTrace';
import { Button } from '@/components/Button';
import { PermissionPrimerView } from '@/components/PermissionPrimer';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { supportsFeature } from '@/lib/platform';
import {
  osPermissions,
  primerStep as primerStepOf,
  usePermissionPrimer,
  type OsApi,
} from '@/lib/permissions';
import { campus as campusCopy, sell as copy } from '@/strings';

import { sellApi, type SellApi } from './api';
import { getDraftStore, useDraft, type DraftState } from './draft';
import {
  ago,
  hasContent,
  mediaUrl,
  moveItem,
  photoRoom,
  photosState,
  type Ago,
  type DraftPhoto,
} from './logic';
import { PhotoGrid } from './PhotoGrid';
import { SellStep } from './SellStep';

type Picker = (source: 'camera' | 'library', limit: number) => Promise<PickedPhoto[]>;

export type SellPhotosDeps = {
  api?: SellApi;
  pick?: Picker;
  cameraOs?: OsApi;
  photosOs?: OsApi;
  store?: ReturnType<typeof getDraftStore>;
  newId?: () => string;
  mediaBase?: () => string;
  now?: () => Date;
};

export function agoText(a: Ago): string {
  return 'n' in a ? fill(copy.ago[a.key], { n: a.n }) : copy.ago[a.key];
}

/** Re-renders every `ms` so "Draft saved · 12 seconds ago" stays true. */
function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/**
 * D01 Sell · photos (P5-SELL-02; board D1, X15, X18, X21). Photos upload one
 * by one while the seller keeps going, each with its own retry. The draft is
 * saved on every change, so killing the app loses nothing.
 */
export function SellPhotosScreen({
  api = sellApi,
  pick = (source, limit) => pickPhotos(source, limit),
  cameraOs = osPermissions.camera,
  photosOs = osPermissions.photos,
  store = getDraftStore(),
  newId = () => Crypto.randomUUID(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
}: SellPhotosDeps) {
  const router = useRouter();
  const draft = useDraft((s: DraftState) => s.draft, store);
  const restored = useDraft((s: DraftState) => s.restored, store);
  const savedAt = useDraft((s: DraftState) => s.savedAt, store);
  const { update, keep, reset } = store.getState();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [primer, setPrimer] = useState<'camera' | 'photos' | null>(null);
  useEffect(() => track('listing_create_started'), []);
  useEffect(() => devTrace(`photos: ${draft.photos.length} in draft`), [draft.photos.length]);
  const camera = usePermissionPrimer('camera', cameraOs);
  const photos = usePermissionPrimer('photos', photosOs);
  const reserving = useRef<Promise<string> | null>(null);
  useTick(10_000);

  const setPhoto = (id: string, patch: Partial<DraftPhoto>) =>
    update((d) => ({ photos: d.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const listingId = async (): Promise<string> => {
    const existing = store.getState().draft.listingId;
    if (existing) return existing;
    reserving.current ??= api.reserveListingId().finally(() => {
      reserving.current = null;
    });
    const id = await reserving.current;
    update({ listingId: id, reservedAt: now().toISOString() });
    return id;
  };

  const upload = async (photo: DraftPhoto) => {
    setPhoto(photo.id, { status: 'uploading' });
    setProgress((m) => ({ ...m, [photo.id]: 0 }));
    try {
      const id = await listingId();
      const done = await api.uploadPhoto(id, photo, (f) =>
        setProgress((m) => ({ ...m, [photo.id]: f })),
      );
      setPhoto(photo.id, {
        status: 'done',
        path: done.path,
        thumbPath: done.thumbPath,
        width: done.width,
        height: done.height,
        blurhash: done.blurhash,
      });
    } catch {
      setPhoto(photo.id, { status: 'failed' });
    }
  };

  const add = async (source: 'camera' | 'library') => {
    setError(null);
    const room = photoRoom(store.getState().draft.photos);
    if (room === 0) {
      setError(copy.full);
      return;
    }
    let picked: PickedPhoto[];
    try {
      picked = (await pick(source, room)).slice(0, room);
    } catch {
      setPrimer(source === 'camera' ? 'camera' : 'photos');
      return;
    }
    if (picked.length === 0) return;
    try {
      await listingId();
    } catch {
      setError(copy.reserveFailed);
      return;
    }
    const added: DraftPhoto[] = picked.map((p) => ({
      id: newId(),
      uri: p.uri,
      width: p.width,
      height: p.height,
      status: 'uploading',
    }));
    update((d) => ({ photos: [...d.photos, ...added] }));
    for (const photo of added) void upload(photo);
  };

  const withPermission = async (kind: 'camera' | 'photos') => {
    // Tapped before the first check finished: ask the OS directly (never prompts).
    const known = (kind === 'camera' ? camera : photos).step;
    const step = known ?? primerStepOf(await (kind === 'camera' ? cameraOs : photosOs).get());
    if (step === 'granted') void add(kind === 'camera' ? 'camera' : 'library');
    else setPrimer(kind);
  };

  const continuePrimer = async () => {
    const kind = primer;
    if (!kind) return;
    const granted = await (kind === 'camera' ? camera : photos).request();
    if (granted) {
      setPrimer(null);
      void add(kind === 'camera' ? 'camera' : 'library');
    }
  };

  const remove = (id: string) => update((d) => ({ photos: d.photos.filter((p) => p.id !== id) }));

  const retry = (id: string) => {
    const photo = store.getState().draft.photos.find((p) => p.id === id);
    if (photo) void upload(photo);
  };

  const state = photosState(draft.photos);
  const status =
    error ??
    (state === 'uploading' ? copy.waitUploads : state === 'failed' ? copy.fixUploads : null);
  const saved =
    hasContent(draft) && savedAt !== null
      ? fill(copy.savedAgo, { time: agoText(ago(new Date(savedAt), now())) })
      : copy.photosBody;
  const startedWhen = agoText(ago(new Date(draft.startedAt), now()));

  const primerKind = primer;
  const primerStep = primerKind ? (primerKind === 'camera' ? camera.step : photos.step) : null;

  return (
    <SellStep
      testID="screen-sell-photos"
      step={1}
      leading="close"
      onLeading={() => router.navigate('/discover')}
      title={copy.photosTitle}
      body={saved}
      dock={
        <Button
          label={copy.next}
          onPress={() => router.push('/sell/details')}
          disabled={state !== 'ready'}
          testID="sell-photos-next"
        />
      }
      overlay={
        <>
          <Sheet
            visible={restored}
            onClose={keep}
            title={copy.restoreTitle}
            testID="sheet-sell-restore"
          >
            <Text variant="body" tone="ink2">
              {draft.title.trim()
                ? fill(copy.restoreBodyNamed, { title: draft.title.trim(), when: startedWhen })
                : fill(copy.restoreBody, { when: startedWhen })}
            </Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <Button
                  label={copy.startOver}
                  variant="secondary"
                  onPress={reset}
                  testID="sell-restore-start-over"
                />
              </View>
              <View style={styles.half}>
                <Button label={copy.continue} onPress={keep} testID="sell-restore-continue" />
              </View>
            </View>
          </Sheet>
          {primerKind && primerStep && primerStep !== 'granted' ? (
            <View style={styles.primer}>
              <PermissionPrimerView
                testID={`sell-primer-${primerKind}`}
                kind={primerKind}
                step={primerStep}
                busy={primerKind === 'camera' ? camera.requesting : photos.requesting}
                onContinue={() => void continuePrimer()}
                onOpenSettings={() =>
                  void (primerKind === 'camera' ? camera : photos).openSettings()
                }
                onAlternative={() => {
                  setPrimer(null);
                  void withPermission(primerKind === 'camera' ? 'photos' : 'camera');
                }}
                onClose={() => setPrimer(null)}
              />
            </View>
          ) : null}
        </>
      }
    >
      {draft.wantedRef ? (
        <View style={styles.answering} testID="sell-answering">
          <Text variant="bodyStrong">{campusCopy.answeringTitle}</Text>
          <Text variant="meta" tone="ink2">
            {fill(campusCopy.answeringBody, { title: draft.wantedTitle ?? '' })}
          </Text>
          <View style={styles.start}>
            <Button
              label={campusCopy.answeringRemove}
              variant="text"
              size="S"
              fullWidth={false}
              onPress={() => update({ wantedRef: null, wantedTitle: null })}
              testID="sell-answering-remove"
            />
          </View>
        </View>
      ) : null}
      <PhotoGrid
        photos={draft.photos}
        progress={progress}
        sourceOf={(p) => p.uri || (p.thumbPath ? mediaUrl(mediaBase(), p.thumbPath) : '')}
        onCamera={supportsFeature('camera') ? () => void withPermission('camera') : undefined}
        onLibrary={() => void withPermission('photos')}
        onRemove={remove}
        onRetry={retry}
        onMove={(from, to) => update((d) => ({ photos: moveItem(d.photos, from, to) }))}
      />
      {status ? (
        <Text
          variant="meta"
          tone={error || state === 'failed' ? 'red' : 'ink2'}
          accessibilityLiveRegion="polite"
          testID="sell-photos-status"
        >
          {status}
        </Text>
      ) : null}
      {/* One plain line of advice instead of a tip box (DEC 90). */}
      <Text variant="meta" tone="ink2" testID="sell-photos-tip">
        {draft.photos.length > 1 ? `${copy.tip} ${copy.reorderHint}` : copy.tip}
      </Text>
      {draft.wantedRef ? null : (
        <View style={styles.more} testID="sell-campus-entries">
          <Button
            label={campusCopy.postFood}
            variant="text"
            size="S"
            fullWidth={false}
            onPress={() => router.push('/sell/food')}
            testID="sell-post-food"
          />
          <Button
            label={campusCopy.askFor}
            variant="text"
            size="S"
            fullWidth={false}
            onPress={() => router.push('/sell/wanted')}
            testID="sell-ask-wanted"
          />
        </View>
      )}
    </SellStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md },
  half: { flex: 1 },
  primer: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.bg },
  answering: {
    gap: theme.space.xs,
    padding: theme.space.md,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  start: { flexDirection: 'row' },
  more: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space.lg,
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
}));
