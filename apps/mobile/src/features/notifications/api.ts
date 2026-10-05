import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';
import { intlLocale } from '@/strings';

export type AppNotification = {
  id: number;
  type: string;
  grp: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type NotificationPrefs = {
  offers: boolean;
  messages: boolean;
  meetups: boolean;
  saved_search: boolean;
  price_drop: boolean;
  tips: boolean;
  message_previews: boolean;
  /** Quad replies and milestones (R1.1). Off by default; present once the server returns it. */
  quad_replies?: boolean;
  /** Free food posts on your campus (R1.1). Off by default; present once the server returns it. */
  free_food?: boolean;
  quiet_start: string;
  quiet_end: string;
};

export type NotificationsApi = {
  list: (cursor: number | null) => Promise<{ items: AppNotification[]; unread: number }>;
  markRead: (ids: number[] | null) => Promise<void>;
  prefs: () => Promise<NotificationPrefs>;
  updatePrefs: (patch: Partial<NotificationPrefs>) => Promise<NotificationPrefs>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const notificationsApi: NotificationsApi = {
  list: (cursor) =>
    rpc<{ items: AppNotification[]; unread: number }>('get_notifications', { cursor, limit: 30 }),
  markRead: async (ids) => {
    await rpc('mark_notifications_read', { ids });
  },
  prefs: () => rpc<NotificationPrefs>('get_notification_prefs'),
  updatePrefs: (patch) => rpc<NotificationPrefs>('update_notification_prefs', { prefs: patch }),
};

/** "Today" / "Yesterday" / "Earlier" sections for the list (F09). */
export function daySection(iso: string, now: Date): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  return diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : 'earlier';
}

/** Half-hour options for the quiet-hours pickers. */
export const QUIET_TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  return `${h}:${i % 2 ? '30' : '00'}`;
});

export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0);
  return d.toLocaleTimeString(intlLocale, { hour: 'numeric', minute: '2-digit' });
}
