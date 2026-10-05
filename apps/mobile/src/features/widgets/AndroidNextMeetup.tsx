import tokens from '@onlyswap/tokens/tokens.json';
import { FlexWidget, TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { whenLabel } from '../meetups/logic';
import type { WidgetPayload } from './logic';

/** Android widget name; must match the `react-native-android-widget` entry in app.config.ts. */
export const ANDROID_WIDGET = 'NextMeetup';

// Board X39: the meetup widget is the dark card. Token colors only.
const C = {
  bg: tokens.color.dark.bg2 as `#${string}`,
  ink: tokens.color.dark.ink as `#${string}`,
  ink2: tokens.color.dark.ink2 as `#${string}`,
  // Accent text is fine here: it sits on a dark fill (UX-03 bans it on light).
  accent: tokens.color.accents[tokens.color.defaultAccent as 'pistachio'].accent as `#${string}`,
};
const T = tokens.type;

/**
 * Android "Next meetup" widget (P17-FEAT-01, react-native-android-widget).
 * Drawn by the app's JS (headless task or a live update), never by the
 * network: it only reads the payload the app saved (sync.ts).
 */
export function AndroidNextMeetup({ payload, now }: { payload: WidgetPayload; now: Date }) {
  const open = { clickAction: 'OPEN_URI', clickActionData: { uri: payload.url } } as const;
  if (payload.kind !== 'meetup') {
    return (
      <FlexWidget
        {...open}
        accessibilityLabel={`${payload.title}. ${payload.empty}`}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          padding: tokens.space.lg,
          borderRadius: tokens.radius.card,
          backgroundColor: C.bg,
          justifyContent: 'space-between',
        }}
      >
        <TextWidget
          text={payload.title}
          style={{ fontSize: T.meta.size, color: C.ink2, fontWeight: '600' }}
        />
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text={payload.empty}
            maxLines={2}
            style={{ fontSize: T.bodyStrong.size, color: C.ink, fontWeight: '600' }}
          />
          <TextWidget
            text={payload.emptyBody}
            maxLines={2}
            style={{ fontSize: T.meta.size, color: C.ink2 }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }
  const when = whenLabel(new Date(payload.startsAt).toISOString(), now);
  return (
    <FlexWidget
      {...open}
      accessibilityLabel={[payload.title, when, payload.place, payload.withName, payload.openLabel]
        .filter(Boolean)
        .join('. ')}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        padding: tokens.space.lg,
        borderRadius: tokens.radius.card,
        backgroundColor: C.bg,
        justifyContent: 'space-between',
      }}
    >
      <TextWidget
        text={payload.title}
        style={{ fontSize: T.meta.size, color: C.ink2, fontWeight: '600' }}
      />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget
          text={when}
          maxLines={1}
          truncate="END"
          style={{ fontSize: T.heading.size, color: C.accent, fontWeight: '800' }}
        />
        <TextWidget
          text={payload.place}
          maxLines={1}
          truncate="END"
          style={{ fontSize: T.label.size, color: C.ink, fontWeight: '600' }}
        />
        {payload.withName ? (
          <TextWidget
            text={payload.withName}
            maxLines={1}
            truncate="END"
            style={{ fontSize: T.meta.size, color: C.ink2 }}
          />
        ) : null}
        <TextWidget
          text={payload.openLabel}
          style={{
            fontSize: T.meta.size,
            color: C.ink,
            fontWeight: '600',
            marginTop: tokens.space.xs,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/**
 * Headless task for the launcher's add/update/resize events. Registered in
 * index.ts on Android only. `read` returns the last payload the app saved.
 */
export function makeWidgetTaskHandler(
  read: () => WidgetPayload,
  now: () => Date = () => new Date(),
) {
  return async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
    if (props.widgetInfo.widgetName !== ANDROID_WIDGET) return;
    if (
      props.widgetAction === 'WIDGET_ADDED' ||
      props.widgetAction === 'WIDGET_UPDATE' ||
      props.widgetAction === 'WIDGET_RESIZED'
    ) {
      props.renderWidget(<AndroidNextMeetup payload={read()} now={now()} />);
    }
  };
}
