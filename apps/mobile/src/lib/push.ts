import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

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
  if (s('meetup_id') && type.startsWith('meetup_'))
    return { pathname: '/meetup/[id]', params: { id: s('meetup_id')! } };
  if (type === 'rate_prompt' && s('chat_id'))
    return { pathname: '/deal/[chatId]/rate', params: { chatId: s('chat_id')! } };
  if (type === 'deal_check' && s('chat_id'))
    return { pathname: '/chat/[id]/deal', params: { id: s('chat_id')! } };
  if (s('chat_id')) return { pathname: '/chat/[id]', params: { id: s('chat_id')! } };
  if (s('offer_id')) return { pathname: '/offer/[id]', params: { id: s('offer_id')! } };
  if (s('listing_id')) return { pathname: '/listing/[id]', params: { id: s('listing_id')! } };
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

/** After permission is granted: get the Expo token and store it on the server. */
export async function registerForPush(): Promise<string | null> {
  await ensureChannels();
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await rpc('register_push_token', {
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    app_version: Constants.expoConfig?.version ?? null,
  });
  return token;
}

/** On sign-out: this device stops getting the account's pushes. */
export async function unregisterPush(): Promise<void> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await rpc('disable_push_token', { token });
  } catch {
    // Best effort: a stale token is disabled by the next receipt anyway.
  }
}

export async function setBadge(unread: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, unread)).catch(() => false);
}

/**
 * Mount once in the signed-in app: shows pushes in the foreground, opens the
 * right screen on tap (including a tap that cold-started the app), and keeps
 * the token fresh when the OS rotates it.
 */
export function usePushHandling(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
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
      const rotate = Notifications.addPushTokenListener(() => {
        void registerForPush().catch(() => {});
      });
      if (typeof rotate?.remove === 'function') subs.push(rotate);
      void Promise.resolve()
        .then(() => registerForPush())
        .catch(() => {});
    } catch {
      // ignore
    }
    return () => subs.forEach((s) => s.remove());
  }, [enabled]);
}
