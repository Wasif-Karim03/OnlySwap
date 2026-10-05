import { Platform } from 'react-native';

import type { LiveProps, TimelineEntry } from './logic';

/**
 * The only file that touches the widget and Live Activity native modules
 * (P17-FEAT-01). Modules load lazily so Jest and the other OS never import
 * them. iOS: expo-widgets (WidgetKit + ActivityKit). Android:
 * react-native-android-widget (home screen widget only; Android has no Live
 * Activities).
 */
export type WidgetNative = {
  widgets: boolean;
  liveActivities: boolean;
  /** Entry 0 is now; later entries take over as meetups end. */
  pushWidget: (timeline: TimelineEntry[]) => void;
  /** ActivityKit ids of the running meetup activities. */
  liveIds: () => string[];
  liveStart: (props: LiveProps, url: string, staleAt: number) => string | null;
  liveUpdate: (id: string, props: LiveProps, staleAt: number) => Promise<void>;
  liveEnd: (id: string) => Promise<void>;
};

export const noopNative: WidgetNative = {
  widgets: false,
  liveActivities: false,
  pushWidget: () => {},
  liveIds: () => [],
  liveStart: () => null,
  liveUpdate: async () => {},
  liveEnd: async () => {},
};

/* eslint-disable @typescript-eslint/no-require-imports -- lazy native modules, see above */
function iosNative(): WidgetNative {
  const { NextMeetupWidget } = require('./NextMeetupWidget') as typeof import('./NextMeetupWidget');
  const { MeetupLiveActivity } =
    require('./MeetupLiveActivity') as typeof import('./MeetupLiveActivity');
  const find = (id: string) => MeetupLiveActivity.getInstances().find((a) => a.getId() === id);
  return {
    widgets: true,
    liveActivities: true,
    pushWidget: (timeline) =>
      NextMeetupWidget.updateTimeline(
        timeline.map((e) => ({ date: new Date(e.at), props: e.payload })),
      ),
    liveIds: () => MeetupLiveActivity.getInstances().map((a) => a.getId()),
    liveStart: (props, url, staleAt) =>
      MeetupLiveActivity.start(props, url, new Date(staleAt)).getId() || null,
    liveUpdate: async (id, props, staleAt) => {
      await find(id)?.update(props, new Date(staleAt));
    },
    liveEnd: async (id) => {
      await find(id)?.end('immediate');
    },
  };
}

function androidNative(): WidgetNative {
  const { updateAndroidWidget } = require('./androidUpdate') as typeof import('./androidUpdate');
  return {
    ...noopNative,
    widgets: true,
    pushWidget: (timeline) => {
      if (timeline[0]) void updateAndroidWidget(timeline[0].payload).catch(() => {});
    },
  };
}
/* eslint-enable @typescript-eslint/no-require-imports */

let cached: WidgetNative | undefined;

export function getWidgetNative(): WidgetNative {
  if (!cached) {
    try {
      cached =
        Platform.OS === 'ios'
          ? iosNative()
          : Platform.OS === 'android'
            ? androidNative()
            : noopNative;
    } catch {
      // A build without the native module (Expo Go, old dev client): stay quiet.
      cached = noopNative;
    }
  }
  return cached;
}
