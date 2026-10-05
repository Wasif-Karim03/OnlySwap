import { QueryClient } from '@tanstack/react-query';

import type { Meetup } from '../src/features/meetups/logic';
import { ANDROID_WIDGET, makeWidgetTaskHandler } from '../src/features/widgets/AndroidNextMeetup';
import type { TypedStorage } from '../src/lib/storage';
import {
  AFTER_START_MS,
  buildLiveProps,
  buildWidgetPayload,
  firstNameOf,
  inLiveWindow,
  LIVE_LEAD_MS,
  MAX_KNOWN,
  nextMeetup,
  parseKnown,
  planLiveActivity,
  pruneKnown,
  toKnown,
  upsertKnown,
  WIDGET_PAYLOAD_KEYS,
  widgetTimeline,
  type LiveProps,
  type TimelineEntry,
} from '../src/features/widgets/logic';
import type { WidgetNative } from '../src/features/widgets/native';
import {
  createWidgetSync,
  LIVE_LABELS,
  startWidgetSync,
  WIDGET_LABELS,
} from '../src/features/widgets/sync';
import { meetup as copy } from '../src/strings/en';

jest.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
  requestWidgetUpdate: jest.fn(async () => {}),
}));
jest.mock('../src/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (cb: (e: string) => void) => {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));
const authListeners: ((e: string) => void)[] = [];

const NOW = new Date('2026-10-04T15:00:00Z');
const at = (minutesFromNow: number) =>
  new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString();

function meetup(over: Partial<Meetup> = {}): Meetup {
  return {
    id: 'm1',
    chat_id: 'c1',
    status: 'confirmed',
    starts_at: at(90),
    spot: { id: 's1', name: 'RPAC', lat: 40.0, lng: -83.0, police: false, hours: null },
    custom_place: null,
    proposed_by_me: true,
    confirmed_at: at(-60),
    my_here_at: null,
    other_here_at: null,
    late_minutes: null,
    late_is_me: false,
    cancelled_by_me: false,
    cancel_reason: null,
    previous_starts_at: null,
    share_token: 'secret-token',
    my_noshow_report: null,
    ...over,
  };
}

const known = (over: Partial<Meetup> = {}, name = 'Aisha A.') => toKnown(meetup(over), name);

describe('T-UNIT-WIDGET-01 widget data (P17-FEAT-01)', () => {
  it('keeps only the first name', () => {
    expect(firstNameOf('Aisha A.')).toBe('Aisha');
    expect(firstNameOf('  Jo  ')).toBe('Jo');
    expect(firstNameOf(null)).toBe('');
    expect(firstNameOf('A'.repeat(40))).toHaveLength(20);
  });

  it('remembers spot name, time and first name, never coordinates or tokens', () => {
    const k = known();
    expect(k).toEqual({
      id: 'm1',
      chatId: 'c1',
      startsAt: at(90),
      place: 'RPAC',
      firstName: 'Aisha',
      status: 'confirmed',
      myHere: false,
      otherHere: false,
      lateMinutes: null,
      lateIsMe: false,
    });
    expect(JSON.stringify(k)).not.toMatch(/40|-83|secret|A\./);
    expect(known({ spot: null, custom_place: 'Morrill lobby' }).place).toBe('Morrill lobby');
  });

  it('upserts, keeps an earlier first name, prunes ended and cancelled meetups', () => {
    let list = upsertKnown([], known(), NOW);
    list = upsertKnown(list, toKnown(meetup({ late_minutes: 5, late_is_me: true }), null), NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ firstName: 'Aisha', lateMinutes: 5 });
    list = upsertKnown(list, known({ id: 'm2', starts_at: at(-31) }), NOW);
    expect(list.map((k) => k.id)).toEqual(['m1']);
    list = upsertKnown(list, known({ status: 'cancelled' }), NOW);
    expect(list).toEqual([]);
    const many = Array.from({ length: 15 }, (_, i) =>
      known({ id: `x${i}`, starts_at: at(i + 10) }),
    );
    expect(pruneKnown(many, NOW)).toHaveLength(MAX_KNOWN);
  });

  it('drops malformed storage', () => {
    expect(parseKnown('junk')).toEqual([]);
    expect(parseKnown([{ id: 1 }, null, { ...known(), startsAt: 'nope' }, known()])).toHaveLength(
      1,
    );
  });

  it('shows the soonest confirmed meetup until 30 min after it starts', () => {
    const list = [
      known({ id: 'p', status: 'proposed', starts_at: at(10) }),
      known({ id: 'b', starts_at: at(200) }),
      known({ id: 'a', starts_at: at(60) }),
    ];
    expect(nextMeetup(list, NOW)?.id).toBe('a');
    expect(nextMeetup(list, new Date(NOW.getTime() + 60 * 60_000 + AFTER_START_MS - 1))?.id).toBe(
      'a',
    );
    expect(nextMeetup(list, new Date(NOW.getTime() + 60 * 60_000 + AFTER_START_MS + 1))?.id).toBe(
      'b',
    );
    expect(nextMeetup([], NOW)).toBeNull();
  });

  it('builds a payload with only the allowed fields', () => {
    const p = buildWidgetPayload(known(), WIDGET_LABELS);
    expect(Object.keys(p).sort()).toEqual([...WIDGET_PAYLOAD_KEYS.meetup].sort());
    expect(p).toEqual({
      kind: 'meetup',
      title: copy.widgetTitle,
      place: 'RPAC',
      withName: 'With Aisha',
      startsAt: new Date(at(90)).getTime(),
      openLabel: copy.widgetOpenChat,
      url: 'onlyswap://chat/c1',
    });
    const empty = buildWidgetPayload(null, WIDGET_LABELS);
    expect(Object.keys(empty).sort()).toEqual([...WIDGET_PAYLOAD_KEYS.empty].sort());
    expect(empty).toMatchObject({
      kind: 'empty',
      empty: copy.widgetEmpty,
      url: 'onlyswap://inbox',
    });
    expect(buildWidgetPayload(known({}, ''), WIDGET_LABELS)).toMatchObject({ withName: '' });
  });

  it('schedules the next meetup when the current one ends', () => {
    const list = [
      known({ id: 'a', starts_at: at(60) }),
      known({ id: 'b', chat_id: 'c2', starts_at: at(300) }),
    ];
    const t = widgetTimeline(list, NOW, WIDGET_LABELS);
    expect(t.map((e) => e.payload.kind)).toEqual(['meetup', 'meetup', 'empty']);
    expect(t[0]!.at).toBe(NOW.getTime());
    expect(t[1]!.at).toBe(new Date(at(60)).getTime() + AFTER_START_MS + 1);
    expect(t[1]!.payload).toMatchObject({ url: 'onlyswap://chat/c2' });
    expect(widgetTimeline([], NOW, WIDGET_LABELS)).toHaveLength(1);
  });
});

describe('T-UNIT-WIDGET-02 Live Activity start, update, end (P17-FEAT-01)', () => {
  const plan = (o: Partial<Parameters<typeof planLiveActivity>[0]>) =>
    planLiveActivity({
      enabled: true,
      supported: true,
      next: known(),
      running: [],
      labels: LIVE_LABELS,
      now: NOW,
      ...o,
    });

  it('only runs from 2 h before to 30 min after a confirmed meetup', () => {
    expect(inLiveWindow(known({ starts_at: at(121) }), NOW)).toBe(false);
    expect(inLiveWindow(known({ starts_at: at(120) }), NOW)).toBe(true);
    expect(inLiveWindow(known({ starts_at: at(-30) }), NOW)).toBe(true);
    expect(inLiveWindow(known({ starts_at: at(-31) }), NOW)).toBe(false);
    expect(inLiveWindow(known({ status: 'proposed' }), NOW)).toBe(false);
    expect(LIVE_LEAD_MS).toBe(2 * 60 * 60_000);
  });

  it('starts one activity with a deep link and a stale date', () => {
    const ops = plan({});
    expect(ops).toEqual([
      {
        type: 'start',
        meetupId: 'm1',
        props: buildLiveProps(known(), LIVE_LABELS),
        url: 'onlyswap://meetup/m1',
        staleAt: new Date(at(90)).getTime() + AFTER_START_MS,
      },
    ]);
    expect(buildLiveProps(known(), LIVE_LABELS)).toEqual({
      meetupId: 'm1',
      title: 'Meet Aisha',
      place: 'RPAC',
      status: copy.liveOnMyWay,
      startsAt: new Date(at(90)).getTime(),
      startedLabel: copy.liveStarted,
    });
  });

  it('shows the status the app tracks', () => {
    expect(buildLiveProps(known({ my_here_at: at(0) }), LIVE_LABELS).status).toBe(copy.imHere);
    expect(buildLiveProps(known({ other_here_at: at(0) }), LIVE_LABELS).status).toBe(
      'Aisha is here',
    );
    expect(buildLiveProps(known({ late_minutes: 10, late_is_me: true }), LIVE_LABELS).status).toBe(
      'Running 10 min late',
    );
    expect(buildLiveProps(known({}, ''), LIVE_LABELS).title).toBe(copy.liveTitleNoName);
  });

  it('does nothing before the window, updates on change, nothing when unchanged', () => {
    expect(plan({ next: known({ starts_at: at(180) }) })).toEqual([]);
    const props = buildLiveProps(known(), LIVE_LABELS);
    expect(plan({ running: [{ activityId: 'A', meetupId: 'm1', props }] })).toEqual([]);
    const changed = plan({
      next: known({ my_here_at: at(0) }),
      running: [{ activityId: 'A', meetupId: 'm1', props }],
    });
    expect(changed).toEqual([expect.objectContaining({ type: 'update', activityId: 'A' })]);
  });

  it('ends when the setting is off, the meetup is over or cancelled, or for other meetups', () => {
    const running = [{ activityId: 'A', meetupId: 'm1', props: null }];
    expect(plan({ enabled: false, running })).toEqual([{ type: 'end', activityId: 'A' }]);
    expect(plan({ next: null, running })).toEqual([{ type: 'end', activityId: 'A' }]);
    expect(plan({ next: known({ starts_at: at(-45) }), running })).toEqual([
      { type: 'end', activityId: 'A' },
    ]);
    const swap = plan({
      next: known({ id: 'm2' }),
      running: [...running, { activityId: 'B', meetupId: '', props: null }],
    });
    expect(swap.map((o) => o.type)).toEqual(['end', 'end', 'start']);
    expect(plan({ supported: false, running })).toEqual([]);
  });
});

type Store = Pick<TypedStorage, 'get' | 'set' | 'remove'>;

function fakeStore() {
  const data = new Map<string, unknown>();
  const store = {
    get: (k: string) => data.get(k),
    set: (k: string, v: unknown) => void data.set(k, v),
    remove: (k: string) => void data.delete(k),
  } as unknown as Store;
  return Object.assign(store, { data });
}

function fakeNative(over: Partial<WidgetNative> = {}) {
  const live = new Map<string, LiveProps>();
  let n = 0;
  const pushWidget = jest.fn<void, [TimelineEntry[]]>();
  const liveStart = jest.fn((props: LiveProps) => {
    const id = `act-${++n}`;
    live.set(id, props);
    return id as string | null;
  });
  const liveUpdate = jest.fn(async (id: string, props: LiveProps) => void live.set(id, props));
  const native: WidgetNative = {
    widgets: true,
    liveActivities: true,
    pushWidget,
    liveIds: () => [...live.keys()],
    liveStart,
    liveUpdate,
    liveEnd: async (id: string) => void live.delete(id),
    ...over,
  };
  return { native, live, pushWidget, liveStart, liveUpdate };
}

describe('T-UNIT-WIDGET-03 widget sync (P17-FEAT-01)', () => {
  it('pushes the widget, starts, updates and ends the Live Activity', async () => {
    const store = fakeStore();
    const { native, live, pushWidget, liveStart, liveUpdate } = fakeNative();
    let now = NOW;
    const sync = createWidgetSync({ store, native, now: () => now });

    await sync.remember(meetup(), 'Aisha A.');
    expect(pushWidget).toHaveBeenCalledTimes(1);
    const timeline = pushWidget.mock.calls[0]![0];
    expect(timeline[0]!.payload).toMatchObject({
      kind: 'meetup',
      place: 'RPAC',
      withName: 'With Aisha',
    });
    expect(liveStart).toHaveBeenCalledTimes(1);
    expect(live.size).toBe(1);

    // Same data again: no widget reload, no activity change.
    await sync.refresh();
    expect(pushWidget).toHaveBeenCalledTimes(1);
    expect(liveUpdate).not.toHaveBeenCalled();

    await sync.remember(meetup({ my_here_at: at(0) }), null);
    expect(liveUpdate).toHaveBeenCalledWith(
      'act-1',
      expect.objectContaining({ status: copy.imHere, title: 'Meet Aisha' }),
      expect.any(Number),
    );

    now = new Date(NOW.getTime() + 121 * 60_000);
    await sync.refresh();
    expect(live.size).toBe(0);
    expect(pushWidget.mock.calls.at(-1)![0][0]!.payload.kind).toBe('empty');
  });

  it('turning the setting off ends the activity but keeps the widget', async () => {
    const store = fakeStore();
    const { native, live, pushWidget } = fakeNative();
    const sync = createWidgetSync({ store, native, now: () => NOW });
    await sync.remember(meetup(), 'Aisha A.');
    expect(live.size).toBe(1);
    store.set('settings.liveActivities', false);
    await sync.refresh();
    expect(live.size).toBe(0);
    expect(pushWidget.mock.calls.at(-1)![0][0]!.payload.kind).toBe('meetup');
  });

  it('a cancelled meetup and sign-out clear both surfaces', async () => {
    const store = fakeStore();
    const { native, live, pushWidget } = fakeNative();
    const sync = createWidgetSync({ store, native, now: () => NOW });
    await sync.remember(meetup(), 'Aisha A.');
    await sync.forgetChat('c1');
    expect(live.size).toBe(0);
    await sync.remember(meetup(), 'Aisha A.');
    await sync.clear();
    expect(store.data.get('widgets.meetups')).toEqual([]);
    expect(pushWidget.mock.calls.at(-1)![0][0]!.payload.kind).toBe('empty');
  });

  it('survives OS errors (Live Activities off in iOS Settings)', async () => {
    const store = fakeStore();
    const { native } = fakeNative({
      liveStart: jest.fn(() => {
        throw new Error('disabled');
      }),
      pushWidget: jest.fn(() => {
        throw new Error('no extension');
      }),
    });
    const sync = createWidgetSync({ store, native, now: () => NOW });
    await expect(sync.remember(meetup(), 'Aisha A.')).resolves.toBeUndefined();
  });

  it('follows the query cache: meetup results, chat names, sign-out', async () => {
    const store = fakeStore();
    const { native } = fakeNative();
    const sync = createWidgetSync({ store, native, now: () => NOW });
    const remember = jest.spyOn(sync, 'remember');
    const forgetChat = jest.spyOn(sync, 'forgetChat');
    const clear = jest.spyOn(sync, 'clear');
    const qc = new QueryClient();
    const stop = startWidgetSync(qc, sync);

    qc.setQueryData(['chat', 'c1'], { other: { display_name: 'Aisha A.' } });
    qc.setQueryData(['chat-meetup', 'c1'], meetup());
    expect(remember).toHaveBeenCalledWith(meetup(), 'Aisha A.');
    qc.setQueryData(['meetup', 'm1'], meetup({ my_here_at: at(0) }));
    expect(remember).toHaveBeenCalledTimes(2);
    qc.setQueryData(['chat-meetup', 'c1'], null);
    expect(forgetChat).toHaveBeenCalledWith('c1');
    qc.setQueryData(['listing', 'x'], { id: 'x' });
    expect(remember).toHaveBeenCalledTimes(2);

    authListeners.at(-1)!('SIGNED_OUT');
    expect(clear).toHaveBeenCalled();
    stop();
    qc.clear();
  });
});

describe('T-UNIT-WIDGET-04 Android widget (P17-FEAT-01)', () => {
  it('draws the saved payload on add and update, for its own widget only', async () => {
    const payload = buildWidgetPayload(known(), WIDGET_LABELS);
    const handler = makeWidgetTaskHandler(
      () => payload,
      () => NOW,
    );
    const renderWidget = jest.fn();
    const info = {
      widgetName: ANDROID_WIDGET,
      widgetId: 1,
      height: 100,
      width: 100,
      screenInfo: {},
    };
    await handler({ widgetInfo: info as never, widgetAction: 'WIDGET_ADDED', renderWidget });
    await handler({ widgetInfo: info as never, widgetAction: 'WIDGET_UPDATE', renderWidget });
    await handler({ widgetInfo: info as never, widgetAction: 'WIDGET_DELETED', renderWidget });
    await handler({
      widgetInfo: { ...info, widgetName: 'Other' } as never,
      widgetAction: 'WIDGET_ADDED',
      renderWidget,
    });
    expect(renderWidget).toHaveBeenCalledTimes(2);
    const el = renderWidget.mock.calls[0]![0] as { props: { payload: unknown } };
    expect(el.props.payload).toBe(payload);
  });
});
