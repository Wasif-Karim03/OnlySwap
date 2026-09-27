import { toAppError } from '@/lib/errors';
import { processPhoto, uploadPhotos, xhrPut, type PickedPhoto, type UploadFile } from '@/lib/media';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';
import { uploadApi } from '@/lib/uploadApi';

import type { Category } from './logic';

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
