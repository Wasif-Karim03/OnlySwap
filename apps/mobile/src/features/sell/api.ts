import { toAppError } from '@/lib/errors';
import { processPhoto, uploadPhotos, xhrPut, type PickedPhoto, type UploadFile } from '@/lib/media';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';
import { uploadApi } from '@/lib/uploadApi';

import type { AnyListingKind, Category, CreateListingArgs, Spot } from './logic';

/**
 * Sell calls (P5-SELL-01, P5-SELL-02). `sellApi` is the app's instance;
 * screens take an injected one in tests.
 */

export type UploadedPhoto = {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  blurhash: string | null;
};

export type TextVerdict = { result: 'ok' | 'block' | 'review'; term: string | null };

export type SellApi = {
  reserveListingId: () => Promise<string>;
  /** Re-encodes (no EXIF), uploads full + thumb under the reserved id. */
  uploadPhoto: (
    listingId: string,
    photo: PickedPhoto,
    onProgress: (fraction: number) => void,
  ) => Promise<UploadedPhoto>;
  checkText: (text: string) => Promise<TextVerdict>;
  categories: () => Promise<Category[]>;
  /** Active meetup spots of the seller's campus (RLS scopes the rows). */
  spots: () => Promise<Spot[]>;
  /** Short campus name for the share card ("Ohio State"). */
  campusName: () => Promise<string | null>;
  createListing: (args: CreateListingArgs) => Promise<PostedListing>;
  /** Uploads the rendered share card (JPEG) and records it on the listing. */
  uploadShareCard: (listingId: string, uri: string) => Promise<void>;
};

export type PostedListing = {
  id: string;
  status: string;
  kind: AnyListingKind;
  title: string;
  price_cents: number;
  condition: string | null;
  photos: { path: string; thumb_path: string; blurhash: string | null }[];
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const sellApi: SellApi = {
  reserveListingId: () => rpc<string>('reserve_listing_id'),

  uploadPhoto: async (listingId, photo, onProgress) => {
    const encoded = await processPhoto(photo, 'listing');
    if (!encoded.thumb) throw toAppError({ message: 'no thumbnail' });
    const files: UploadFile[] = [
      { idx: 0, variant: 'full', uri: encoded.full.uri, size: encoded.full.size },
      { idx: 0, variant: 'thumb', uri: encoded.thumb.uri, size: encoded.thumb.size },
    ];
    const targets = await uploadPhotos(
      files,
      { requestUrls: (f) => uploadApi.requestUrls('listing', listingId, f), put: xhrPut },
      onProgress,
    );
    const full = targets.find((t) => t.variant === 'full')?.key;
    const thumb = targets.find((t) => t.variant === 'thumb')?.key;
    if (!full || !thumb) throw toAppError({ message: 'upload-url returned no keys' });
    return {
      path: full,
      thumbPath: thumb,
      width: encoded.full.width,
      height: encoded.full.height,
      blurhash: encoded.blurhash ?? null,
    };
  },

  checkText: (text) => rpc<TextVerdict>('check_text', { text, scope: 'listing' }),

  spots: async () => {
    const { data, error } = await getSupabase()
      .from('safe_spots')
      .select('id, name, description, hours, lat, lng, designation, is_default, sort')
      .order('sort');
    if (error) throw toAppError(error);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      hours: (r.hours as string | null) ?? null,
      lat: r.lat as number,
      lng: r.lng as number,
      police: r.designation === 'police',
      isDefault: Boolean(r.is_default),
      sort: (r.sort as number | null) ?? 0,
    }));
  },

  campusName: async () => {
    const { data } = await getSupabase().from('campuses').select('short_name').limit(1);
    return ((data?.[0]?.short_name as string | undefined) ?? null) || null;
  },

  createListing: (args) => rpc<PostedListing>('create_listing', args),

  uploadShareCard: async (listingId, uri) => {
    const size = (await (await fetch(uri)).blob()).size;
    const files: UploadFile[] = [{ idx: 0, variant: 'full', uri, size }];
    await uploadPhotos(files, {
      requestUrls: (f) => uploadApi.requestUrls('share', listingId, f),
      put: xhrPut,
    });
    await rpc('set_listing_share_image', { id: listingId });
  },

  categories: async () => {
    const { data, error } = await getSupabase()
      .from('categories')
      .select('id, name, parent_id, sort')
      .order('sort');
    if (error) throw toAppError(error);
    return (data ?? []).map((c) => ({
      id: c.id as number,
      name: c.name as string,
      parentId: (c.parent_id as number | null) ?? null,
    }));
  },
};
