import type { QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { getStorage, type TypedStorage } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';
import { meetup as copy } from '@/strings';

import type { Meetup } from '../meetups/logic';
import {
  nextMeetup,
  parseKnown,
  planLiveActivity,
  pruneKnown,
  toKnown,
  upsertKnown,
  widgetTimeline,
  type KnownMeetup,
  type LiveLabels,
  type LiveProps,
  type TimelineEntry,
  type WidgetLabels,
} from './logic';
import { getWidgetNative, type WidgetNative } from './native';

export const WIDGET_LABELS: WidgetLabels = {
  title: copy.widgetTitle,
  empty: copy.widgetEmpty,
  emptyBody: copy.widgetEmptyBody,
  openChat: copy.widgetOpenChat,
  withName: copy.widgetWith,
};

export const LIVE_LABELS: LiveLabels = {
  title: copy.liveTitle,
  titleNoName: copy.liveTitleNoName,
  onMyWay: copy.liveOnMyWay,
  imHere: copy.imHere,
  theyreHere: copy.theyreHere,
  late: copy.liveLate,
  started: copy.liveStarted,
};

type Store = Pick<TypedStorage, 'get' | 'set' | 'remove'>;

/** Saved Lock Screen setting; unset means on (the user turns it off in Appearance). */
export function liveActivitiesEnabled(store: Pick<TypedStorage, 'get'> = getStorage()): boolean {
  return store.get('settings.liveActivities') !== false;
}

/**
 * Keeps the widget and the Live Activity in step with the meetups the app
 * has loaded (P17-FEAT-01). Everything is local: no network calls, no push
 * servers. Errors from the OS (Live Activities off in iOS Settings, no
 * widget placed) are swallowed: these surfaces are extras.
 */
export function createWidgetSync(deps: { store: Store; native: WidgetNative; now?: () => Date }) {
  const { store, native } = deps;
  const now = deps.now ?? (() => new Date());

  const known = (): KnownMeetup[] => parseKnown(store.get('widgets.meetups'));
  const liveProps = (): Record<string, LiveProps> => {
    const raw = store.get('widgets.liveProps');
    return raw && typeof raw === 'object' ? (raw as Record<string, LiveProps>) : {};
  };

  const pushWidget = (timeline: TimelineEntry[]) => {
    if (!native.widgets) return;
    // Same content as last time: skip (WidgetKit has a daily reload budget).
    const same = timeline.map((e) => e.payload);
    if (JSON.stringify(store.get('widgets.payload')) === JSON.stringify(same)) return;
    store.set('widgets.payload', same);
    try {
      native.pushWidget(timeline);
    } catch {
      // No widget extension in this build.
    }
  };

  const reconcileLive = async (next: KnownMeetup | null) => {
    if (!native.liveActivities) return;
    let ids: string[] = [];
    try {
      ids = native.liveIds();
    } catch {
      return;
    }
    const saved = liveProps();
    const running = ids.map((activityId) => ({
      activityId,
      meetupId: saved[activityId]?.meetupId ?? '',
      props: saved[activityId] ?? null,
    }));
    const ops = planLiveActivity({
      enabled: liveActivitiesEnabled(store),
      supported: native.liveActivities,
      next,
      running,
      labels: LIVE_LABELS,
      now: now(),
    });
    const after: Record<string, LiveProps> = {};
    for (const id of ids) if (saved[id]) after[id] = saved[id];
    for (const op of ops) {
      try {
        if (op.type === 'end') {
          await native.liveEnd(op.activityId);
          delete after[op.activityId];
        } else if (op.type === 'start') {
          const id = native.liveStart(op.props, op.url, op.staleAt);
          if (id) after[id] = op.props;
        } else {
          await native.liveUpdate(op.activityId, op.props, op.staleAt);
          after[op.activityId] = op.props;
        }
      } catch {
        // Live Activities turned off in iOS Settings, or the app is in the background.
      }
    }
    store.set('widgets.liveProps', after);
  };

  const refresh = async () => {
    const list = pruneKnown(known(), now());
    store.set('widgets.meetups', list);
    const next = nextMeetup(list, now());
    pushWidget(widgetTimeline(list, now(), WIDGET_LABELS));
    await reconcileLive(next);
  };

  return {
    known,
    refresh,
    /** A meetup the app just loaded or changed. */
    remember: async (m: Meetup, otherDisplayName?: string | null) => {
      store.set('widgets.meetups', upsertKnown(known(), toKnown(m, otherDisplayName), now()));
      await refresh();
    },
    /** The chat has no open meetup any more (cancelled or done). */
    forgetChat: async (chatId: string) => {
      store.set(
        'widgets.meetups',
        known().filter((k) => k.chatId !== chatId),
      );
      await refresh();
    },
    /** Sign-out: nothing about this account stays on the home or Lock Screen. */
    clear: async () => {
      store.remove('widgets.meetups');
      await refresh();
    },
  };
}

export type WidgetSync = ReturnType<typeof createWidgetSync>;

let shared: WidgetSync | undefined;

export function getWidgetSync(): WidgetSync {
  shared ??= createWidgetSync({ store: getStorage(), native: getWidgetNative() });
  return shared;
}

type ChatCache = { other?: { display_name?: string | null } | null } | undefined;

/**
 * Watches the query cache for meetup results (['meetup', id] from the meetup
 * screen, ['chat-meetup', chatId] from the chat) and the other person's name
 * from the chat (['chat', chatId]). Also re-checks when the app comes to the
 * front (a Live Activity can only start then) and clears on sign-out.
 * Returns a stop function. Called once from the root layout.
 */
export function startWidgetSync(qc: QueryClient, sync: WidgetSync = getWidgetSync()): () => void {
  const nameFor = (chatId: string) =>
    (qc.getQueryData(['chat', chatId]) as ChatCache)?.other?.display_name ?? null;

  const unsubCache = qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const [head, id] = event.query.queryKey as [unknown, unknown];
    const data = event.query.state.data as Meetup | null | undefined;
    if (head === 'meetup' && data) void sync.remember(data, nameFor(data.chat_id));
    else if (head === 'chat-meetup' && typeof id === 'string') {
      if (data) void sync.remember(data, nameFor(id));
      else void sync.forgetChat(id);
    }
  });

  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') void sync.refresh();
  });

  let unsubAuth = () => {};
  try {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') void sync.clear();
    });
    unsubAuth = () => data.subscription.unsubscribe();
  } catch {
    // No auth client (tests).
  }

  void sync.refresh();
  return () => {
    unsubCache();
    appState.remove();
    unsubAuth();
  };
}
