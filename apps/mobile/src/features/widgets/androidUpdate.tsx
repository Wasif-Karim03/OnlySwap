import { requestWidgetUpdate } from 'react-native-android-widget';

import { ANDROID_WIDGET, AndroidNextMeetup } from './AndroidNextMeetup';
import type { WidgetPayload } from './logic';

/** Redraws every placed "Next meetup" widget now (Android). */
export function updateAndroidWidget(payload: WidgetPayload, now: Date = new Date()): Promise<void> {
  return requestWidgetUpdate({
    widgetName: ANDROID_WIDGET,
    renderWidget: () => <AndroidNextMeetup payload={payload} now={now} />,
  });
}
