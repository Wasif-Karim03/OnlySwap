import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

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
};

/** Chat calls (P8-CHAT-01). */
export type ChatApi = {
  chat: (chatId: string) => Promise<ChatInfo>;
  messages: (
    chatId: string,
    opts?: { before?: number; after?: number; limit?: number },
  ) => Promise<Message[]>;
  send: (chatId: string, body: string, clientId: string) => Promise<Message>;
  markRead: (chatId: string) => Promise<void>;
  mute: (chatId: string, muted: boolean) => Promise<void>;
  hide: (chatId: string) => Promise<void>;
  report: (chatId: string, reason: string, details: string) => Promise<void>;
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
};
