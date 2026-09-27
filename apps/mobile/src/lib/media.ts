import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { toAppError } from './errors';

/**
 * Photo pipeline (P5-MEDIA-03; DATA_MODEL §6). Everything is processed on
 * the phone: resized, re-encoded to WebP (which drops EXIF, GPS included),
 * a blurhash for the thumbnail, then uploaded straight to R2 with presigned
 * URLs from `upload-url`. Native modules are injected so the logic is tested.
 */

export const SIZES = { full: 1080, thumb: 400, avatar: 512 } as const;
export const QUALITY = 0.72;
/** Byte limits signed by upload-url (DATA_MODEL §6). */
export const MAX_BYTES = { full: 2 * 1024 * 1024, thumb: 200 * 1024, avatar: 300 * 1024 } as const;
/** Lower qualities tried when an image is still over its limit (the re-encode path). */
export const FALLBACK_QUALITIES = [0.6, 0.5, 0.4] as const;
export const BLURHASH_COMPONENTS: [number, number] = [4, 3];
export const MAX_PHOTOS = 8;

export type PickedPhoto = { uri: string; width: number; height: number; mimeType?: string | null };
export type EncodedImage = { uri: string; width: number; height: number; size: number };
export type ProcessedPhoto = { full: EncodedImage; thumb?: EncodedImage; blurhash?: string | null };

type ManipulateResult = { uri: string; width: number; height: number };

export type MediaDeps = {
  manipulate: (
    uri: string,
    actions: { resize: { width?: number; height?: number } }[],
    options: { compress: number; format: 'webp' },
  ) => Promise<ManipulateResult>;
  fileSize: (uri: string) => Promise<number>;
  blurhash: (uri: string, components: [number, number]) => Promise<string | null>;
};

/** Resize so the long edge is at most `max`; never upscales. */
export function fitLongEdge(
  width: number,
  height: number,
  max: number,
): { width?: number; height?: number } | null {
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}

async function encode(
  photo: PickedPhoto,
  maxEdge: number,
  maxBytes: number,
  deps: MediaDeps,
): Promise<EncodedImage> {
  const resize = fitLongEdge(photo.width, photo.height, maxEdge);
  // Always re-encode, even when no resize is needed: a fresh WebP carries no EXIF.
  const actions = resize ? [{ resize }] : [];
  for (const compress of [QUALITY, ...FALLBACK_QUALITIES]) {
    const out = await deps.manipulate(photo.uri, actions, { compress, format: 'webp' });
    const size = await deps.fileSize(out.uri);
    if (size <= maxBytes) return { ...out, size };
  }
  throw toAppError({ code: 'P0001', message: 'INVALID:photo_size' });
}

/** A listing photo: 1080 full + 400 thumbnail + blurhash; or a 512 avatar. */
export async function processPhoto(
  photo: PickedPhoto,
  kind: 'listing' | 'avatar',
  deps: MediaDeps = defaultDeps,
): Promise<ProcessedPhoto> {
  if (kind === 'avatar') {
    return { full: await encode(photo, SIZES.avatar, MAX_BYTES.avatar, deps) };
  }
  const full = await encode(photo, SIZES.full, MAX_BYTES.full, deps);
  const thumb = await encode(photo, SIZES.thumb, MAX_BYTES.thumb, deps);
  let blurhash: string | null = null;
  try {
    blurhash = await deps.blurhash(thumb.uri, BLURHASH_COMPONENTS);
  } catch {
    blurhash = null; // A missing blurhash only means a plain placeholder while loading.
  }
  return { full, thumb, blurhash };
}

// ---------------------------------------------------------------------------
// Picking

export type PickerDeps = {
  library: (limit: number) => Promise<PickedPhoto[] | null>;
  camera: () => Promise<PickedPhoto[] | null>;
};

/** Up to `limit` photos; an empty list when the user cancels. Never asks for EXIF. */
export async function pickPhotos(
  source: 'library' | 'camera',
  limit: number = MAX_PHOTOS,
  deps: PickerDeps = defaultPicker,
): Promise<PickedPhoto[]> {
  const picked = source === 'camera' ? await deps.camera() : await deps.library(Math.max(1, limit));
  return (picked ?? []).slice(0, Math.max(1, limit));
}

// ---------------------------------------------------------------------------
// Uploading

export type UploadTarget = {
  idx: number;
  variant: 'full' | 'thumb';
  key: string;
  url: string;
  headers: Record<string, string>;
};

export type UploadFile = { idx: number; variant: 'full' | 'thumb'; uri: string; size: number };

export type UploadDeps = {
  /** Calls upload-url for these files. */
  requestUrls: (files: UploadFile[]) => Promise<UploadTarget[]>;
  /** One PUT; resolves with the HTTP status; reports bytes sent. */
  put: (target: UploadTarget, file: UploadFile, onBytes: (sent: number) => void) => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
};

export const UPLOAD_RETRIES = 3;
export const BACKOFF_MS = [500, 1000, 2000] as const;

class UploadError extends Error {
  constructor(public status: number) {
    super(`upload ${status}`);
  }
}

/**
 * Uploads each file to its presigned URL. Network errors and 5xx retry 3 times
 * with backoff; a 403 (usually an expired URL) re-requests the URLs once.
 * Progress is the share of bytes sent and always ends at exactly 1.
 */
export async function uploadPhotos(
  files: UploadFile[],
  deps: UploadDeps,
  onProgress: (fraction: number) => void = () => {},
): Promise<UploadTarget[]> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const total = files.reduce((n, f) => n + f.size, 0) || 1;
  const sent = new Map<string, number>();
  const report = () =>
    onProgress(Math.min(1, [...sent.values()].reduce((a, b) => a + b, 0) / total));
  const id = (f: { idx: number; variant: string }) => `${f.idx}:${f.variant}`;

  let targets = await deps.requestUrls(files);
  let refreshed = false;
  const find = (f: UploadFile) => {
    const t = targets.find((x) => x.idx === f.idx && x.variant === f.variant);
    if (!t) throw toAppError({ message: 'no upload url' });
    return t;
  };

  for (const file of files) {
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      try {
        status = await deps.put(find(file), file, (bytes) => {
          sent.set(id(file), Math.min(bytes, file.size));
          report();
        });
      } catch {
        status = 0; // offline or dropped connection
      }
      if (status >= 200 && status < 300) {
        sent.set(id(file), file.size);
        report();
        break;
      }
      sent.set(id(file), 0);
      if (status === 403 && !refreshed) {
        refreshed = true;
        targets = await deps.requestUrls(files);
        continue;
      }
      if ((status === 0 || status >= 500) && attempt < UPLOAD_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 2000);
        continue;
      }
      throw toAppError(
        status === 0 ? new TypeError('Network request failed') : new UploadError(status),
      );
    }
  }
  onProgress(1);
  return targets;
}

// ---------------------------------------------------------------------------
// Native defaults

const defaultDeps: MediaDeps = {
  manipulate: (uri, actions, options) =>
    manipulateAsync(uri, actions, { compress: options.compress, format: SaveFormat.WEBP }),
  fileSize: async (uri) => (await (await fetch(uri)).blob()).size,
  blurhash: (uri, components) => Image.generateBlurhashAsync(uri, components),
};

function toPicked(result: ImagePicker.ImagePickerResult): PickedPhoto[] | null {
  if (result.canceled) return null;
  return result.assets.map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
    mimeType: a.mimeType,
  }));
}

const defaultPicker: PickerDeps = {
  library: async (limit) =>
    toPicked(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: limit > 1,
        selectionLimit: limit,
        exif: false,
        quality: 1,
      }),
    ),
  camera: async () =>
    toPicked(
      await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], exif: false, quality: 1 }),
    ),
};

/** XHR PUT with upload progress; the body is the file read as a Blob. */
export function xhrPut(
  target: UploadTarget,
  file: UploadFile,
  onBytes: (sent: number) => void,
): Promise<number> {
  return fetch(file.uri)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<number>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', target.url);
          // content-length comes from the Blob; content-type must match the signed value.
          xhr.setRequestHeader(
            'content-type',
            target.headers['content-type'] ?? 'application/octet-stream',
          );
          xhr.upload.onprogress = (e) => onBytes(e.loaded);
          xhr.onload = () => resolve(xhr.status);
          xhr.onerror = () => reject(new TypeError('Network request failed'));
          xhr.send(blob);
        }),
    );
}
