import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isWebPlatform } from './platform';
import { createPushRegistrar } from './pushRegistrar';
import { createRpc, type RpcClient } from './rpc';
import { getSupabase } from './supabase';

/**
 * Push (P9-PUSH-02): Android channels, token register and refresh, taps
 * (cold and warm start) and the badge. Nothing here asks for permission; the
 * primer (A08, F11) does that, then calls `registerForPush`.
 */

/** Android channels = notification groups (API §7). Names are shown in system settings. */
export const CHANNELS: { id: string; name: string; importance: Notifications.AndroidImportance }[] =
  [
    { id: 'offers', name: 'Offers', importance: Notifications.AndroidImportance.HIGH },
    { id: 'messages', name: 'Messages', importance: Notifications.AndroidImportance.HIGH },
    { id: 'meetups', name: 'Meetups', importance: Notifications.AndroidImportance.HIGH },
    {
      id: 'alerts',
      name: 'Saved searches and price drops',
      importance: Notifications.AndroidImportance.DEFAULT,
    },
    { id: 'selling', name: 'Selling tips', importance: Notifications.AndroidImportance.LOW },
    { id: 'safety', name: 'Safety', importance: Notifications.AndroidImportance.HIGH },
    { id: 'account', name: 'Account', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'campus', name: 'Campus', importance: Notifications.AndroidImportance.LOW },
    // send-push uses the group as the channel id, so every group needs one.
    { id: 'quad', name: 'Quad', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'comments', name: 'Comments', importance: Notifications.AndroidImportance.DEFAULT },
  ];

/** Where a tapped notification opens (the push `data` from the server). */
export function routeForNotification(
  data: Record<string, unknown> | null | undefined,
): Href | null {
  if (!data) return null;
  const s = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : null);
  const type = s('type') ?? '';
  if ((type === 'quad_reply' || type === 'quad_milestone') && s('post_id'))
    return { pathname: '/quad/[id]', params: { id: s('post_id')! } };
  // Feed comments and likes (DEC 121) open the comments on the post.
  if (
    (type === 'listing_comment' ||
      type === 'comment_reply' ||
      type === 'comment_like' ||
      type === 'listing_like') &&
    s('listing_id')
  )
    return { pathname: '/listing/[id]/comments', params: { id: s('listing_id')! } };
  // Around campus and waitlist (R1.1): the new listing for a Wanted match (else
  // the Wanted itself), the food post, and the one-time "campus open" screen.
  if (type === 'campus_unlocked') return '/unlocked';
  if (type === 'wanted_match' || type === 'free_food') {
    const id = s('listing_id') ?? (type === 'wanted_match' ? s('wanted_id') : null);
    if (id) return { pathname: '/listing/[id]', params: { id, from: 'notification' } };
    return type === 'free_food'
      ? { pathname: '/feed', params: { kind: 'food' } }
      : '/notifications';
  }
  if (s('meetup_id') && type.startsWith('meetup_'))
    return { pathname: '/meetup/[id]', params: { id: s('meetup_id')! } };
  if (type === 'rate_prompt' && s('chat_id'))
    return { pathname: '/deal/[chatId]/rate', params: { chatId: s('chat_id')! } };
  if (type === 'deal_check' && s('chat_id'))
    return { pathname: '/chat/[id]/deal', params: { id: s('chat_id')! } };
  if (s('chat_id')) return { pathname: '/chat/[id]', params: { id: s('chat_id')! } };
  if (s('offer_id')) return { pathname: '/offer/[id]', params: { id: s('offer_id')! } };
  if (s('listing_id'))
    return { pathname: '/listing/[id]', params: { id: s('listing_id')!, from: 'notification' } };
  if (type === 'report_update' && s('report_id')) {
    return { pathname: '/report/[id]', params: { id: s('report_id')! } };
  }
  if (type === 'appeal_decided' || type === 'account_notice') return '/account-status';
  return '/notifications';
}

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    CHANNELS.map((c) =>
      Notifications.setNotificationChannelAsync(c.id, { name: c.name, importance: c.importance }),
    ),
  );
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

/**
 * One registrar per app run. It dedupes registrations so the token listener
 * can't loop (QA H1: each `getExpoPushTokenAsync` call fires the listener again).
 */
const registrar = createPushRegistrar({
  getToken: async () => {
    await ensureChannels();
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    return data;
  },
  getUserId: async () => (await getSupabase().auth.getSession()).data.session?.user.id ?? null,
  send: async (token) => {
    await rpc('register_push_token', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      app_version: Constants.expoConfig?.version ?? null,
    });
  },
});

/** After permission is granted: get the Expo token and store it on the server (once). */
export async function registerForPush(): Promise<string | null> {
  // The web app never registers for push (P13-WEB-07): no web push in R2.
  if (isWebPlatform()) return null;
  return registrar.register();
}

/** The last tap this process opened. Expo replays it on every mount (launch item 3). */
let lastOpenedResponseId: string | null = null;

/**
 * True the first time a tapped notification id is seen, false for a repeat.
 * Without it, the last tap was opened again each time the tabs mounted, which
 * could reopen a chat or offer after an account switch.
 */
export function claimNotificationResponse(identifier: string | undefined): boolean {
  if (!identifier) return true;
  if (identifier === lastOpenedResponseId) return false;
  lastOpenedResponseId = identifier;
  return true;
}

/** On sign-out: this device stops getting the account's pushes. */
export async function unregisterPush(): Promise<void> {
  if (isWebPlatform()) return;
  registrar.reset();
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await rpc('disable_push_token', { token });
  } catch {
    // Best effort: a stale token is disabled by the next receipt anyway.
  }
}

export async function setBadge(unread: number): Promise<void> {
  if (isWebPlatform()) return;
  await Notifications.setBadgeCountAsync(Math.max(0, unread)).catch(() => false);
}

/**
 * Mount once in the signed-in app: shows pushes in the foreground, opens the
 * right screen on tap (including a tap that cold-started the app), and keeps
 * the token fresh when the OS rotates it.
 */
export function usePushHandling(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || isWebPlatform()) return undefined;
    const subs: { remove: () => void }[] = [];
    // Defensive: native modules can be missing (tests, Expo Go); push is best effort.
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
        }),
      });
      const open = (r: Notifications.NotificationResponse | null | undefined) => {
        if (!claimNotificationResponse(r?.notification.request.identifier)) return;
        const href = routeForNotification(
          r?.notification.request.content.data as Record<string, unknown>,
        );
        if (href) router.push(href);
      };
      void Promise.resolve()
        .then(() => Notifications.getLastNotificationResponseAsync())
        .then(open)
        .catch(() => {});
      const tap = Notifications.addNotificationResponseReceivedListener(open);
      if (typeof tap?.remove === 'function') subs.push(tap);
      // A push while the app is open: the bell's unread count is stale now.
      const received = Notifications.addNotificationReceivedListener(() => {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      });
      if (typeof received?.remove === 'function') subs.push(received);
      // Fires on OS rotation and also on our own token fetches: the registrar
      // ignores repeats of the same device token, so this can't loop.
      const rotate = Notifications.addPushTokenListener((t) => {
        void registrar.onDeviceToken(String(t.data)).catch(() => {});
      });
      if (typeof rotate?.remove === 'function') subs.push(rotate);
      void Promise.resolve()
        .then(() => registerForPush())
        .catch(() => {});
    } catch {
      // ignore
    }
    return () => subs.forEach((s) => s.remove());
  }, [enabled, qc]);
}
