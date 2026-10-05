import { toAppError } from '@/lib/errors';
import { processPhoto, uploadPhotos, xhrPut, type PickedPhoto, type UploadFile } from '@/lib/media';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';
import { uploadApi } from '@/lib/uploadApi';

import type { ChatSummary } from '../offers/logic';
import type { Message } from './logic';

export type ChatInfo = ChatSummary & {
  blocked: boolean;
  i_blocked: boolean;
  other_deleted: boolean;
  listing_status: string | null;
  buyer_outcome: string | null;
  seller_outcome: string | null;
  my_first_message: boolean;
  /** When the chat started, if the server sends it (the photo blur rule uses it). */
  created_at?: string | null;
};

/** Chat calls (P8-CHAT-01). */
export type ChatApi = {
  chat: (chatId: string) => Promise<ChatInfo>;
  messages: (
    chatId: string,
    opts?: { before?: number; after?: number; limit?: number },
  ) => Promise<Message[]>;
  send: (chatId: string, body: string, clientId: string) => Promise<Message>;
  /** A photo message (P8-CHAT-04); `caption` may be empty. */
  sendPhoto: (
    chatId: string,
    caption: string,
    clientId: string,
    photoPath: string,
  ) => Promise<Message>;
  /** Strips EXIF (WebP re-encode), uploads with kind 'chat', returns the full key. */
  uploadPhoto: (
    chatId: string,
    photo: PickedPhoto,
    onProgress: (fraction: number) => void,
  ) => Promise<string>;
  markRead: (chatId: string) => Promise<void>;
  mute: (chatId: string, muted: boolean) => Promise<void>;
  hide: (chatId: string) => Promise<void>;
  report: (chatId: string, reason: string, details: string) => Promise<void>;
  /** One message (text or photo); the server keeps the evidence. */
  reportMessage: (messageId: number, reason: string, details: string) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const chatApi: ChatApi = {
  chat: (chatId) => rpc<ChatInfo>('get_chat', { chat_id: chatId }),
  messages: (chatId, opts = {}) =>
    rpc<Message[]>('get_messages', {
      chat_id: chatId,
      before: opts.before ?? null,
      after: opts.after ?? null,
      limit: opts.limit ?? 50,
    }),
  send: (chatId, body, clientId) =>
    rpc<Message>('send_message', { chat_id: chatId, body, client_id: clientId }),
  sendPhoto: (chatId, caption, clientId, photoPath) =>
    rpc<Message>('send_message', {
      chat_id: chatId,
      body: caption,
      client_id: clientId,
      kind: 'photo',
      photo_path: photoPath,
    }),
  uploadPhoto: async (chatId, photo, onProgress) => {
    // Only the full image: chat photos are read through signed URLs of the full key.
    const encoded = await processPhoto(photo, 'listing');
    const files: UploadFile[] = [
      { idx: 0, variant: 'full', uri: encoded.full.uri, size: encoded.full.size },
    ];
    const targets = await uploadPhotos(
      files,
      { requestUrls: (f) => uploadApi.requestUrls('chat', chatId, f), put: xhrPut },
      onProgress,
    );
    const full = targets.find((t) => t.variant === 'full')?.key;
    if (!full) throw toAppError({ message: 'upload-url returned no keys' });
    return full;
  },
  markRead: async (chatId) => {
    await rpc('mark_chat_read', { chat_id: chatId });
  },
  mute: async (chatId, muted) => {
    await rpc('set_chat_mute', { chat_id: chatId, muted });
  },
  hide: async (chatId) => {
    await rpc('hide_chat', { chat_id: chatId });
  },
  report: async (chatId, reason, details) => {
    await rpc('create_report', {
      target_type: 'chat',
      target_id: chatId,
      reason,
      details: details || null,
    });
  },
  reportMessage: async (messageId, reason, details) => {
    await rpc('create_report', {
      target_type: 'message',
      target_id: String(messageId),
      reason,
      details: details || null,
    });
  },
};
