import { getStorage } from '@/lib/storage';

import { makeWidgetTaskHandler } from './AndroidNextMeetup';
import { buildWidgetPayload, nextMeetup, parseKnown } from './logic';
import { WIDGET_LABELS } from './sync';

/**
 * Android launcher events (add, resize, the 30-minute refresh) redraw the
 * widget from the meetups saved on the device, so an ended meetup drops off
 * even when the app is closed. No network.
 */
export const androidWidgetTaskHandler = makeWidgetTaskHandler(() => {
  const now = new Date();
  return buildWidgetPayload(
    nextMeetup(parseKnown(getStorage().get('widgets.meetups')), now),
    WIDGET_LABELS,
  );
});
