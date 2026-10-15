import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { Meetup } from './logic';

/** Meetup calls (P8-MEET-01). */
export type MeetupsApi = {
  propose: (
    chatId: string,
    startsAt: Date,
    place: { spotId?: string; custom?: string },
  ) => Promise<Meetup>;
  confirm: (meetupId: string) => Promise<void>;
  checkIn: (meetupId: string) => Promise<void>;
  late: (meetupId: string, minutes: number) => Promise<void>;
  cancel: (meetupId: string, reason?: string) => Promise<void>;
  get: (meetupId: string) => Promise<Meetup>;
  forChat: (chatId: string) => Promise<Meetup | null>;
  share: (meetupId: string) => Promise<{ token: string; expires_at: string }>;
  noShow: (meetupId: string, note?: string) => Promise<void>;
  /** DEC 132: the seller types the buyer's code. */
  confirmHandoff: (meetupId: string, code: string) => Promise<{ ok: boolean; tries_left: number }>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const meetupsApi: MeetupsApi = {
  propose: (chatId, startsAt, place) =>
    rpc<Meetup>('propose_meetup', {
      chat_id: chatId,
      starts_at: startsAt.toISOString(),
      spot_id: place.spotId ?? null,
      custom_place: place.custom?.trim() || null,
    }),
  confirm: async (id) => {
    await rpc('confirm_meetup', { meetup_id: id });
  },
  checkIn: async (id) => {
    await rpc('checkin_meetup', { meetup_id: id });
  },
  late: async (id, minutes) => {
    await rpc('running_late', { meetup_id: id, minutes });
  },
  cancel: async (id, reason) => {
    await rpc('cancel_meetup', { meetup_id: id, reason: reason ?? null });
  },
  get: (id) => rpc<Meetup>('get_meetup', { meetup_id: id }),
  confirmHandoff: (id, code) =>
    rpc<{ ok: boolean; tries_left: number }>('confirm_handoff', { meetup_id: id, code }),
  forChat: (chatId) => rpc<Meetup | null>('get_chat_meetup', { chat_id: chatId }),
  share: (id) =>
    rpc<{ token: string; expires_at: string }>('create_meetup_share', { meetup_id: id }),
  noShow: async (id, note) => {
    await rpc('report_noshow', { meetup_id: id, note: note ?? null });
  },
};
