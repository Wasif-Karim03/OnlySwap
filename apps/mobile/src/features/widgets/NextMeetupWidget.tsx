import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetPayload } from './logic';

/** Native widget kind; must match the `expo-widgets` entry in app.config.ts. */
export const NEXT_MEETUP_WIDGET = 'NextMeetup';

/**
 * iOS "Next meetup" widget (P17-FEAT-01, board X39). Runs in the widget
 * extension's own runtime ('widget' directive): only @expo/ui/swift-ui views,
 * no app state, no network, nothing from outside this function. All text and
 * the deep link arrive in `props` (logic.ts buildWidgetPayload). System fonts
 * with text styles so it follows Dynamic Type; system colors only.
 */
function NextMeetupLayout(props: WidgetPayload, env: WidgetEnvironment) {
  'widget';
  const small = env.widgetFamily === 'systemSmall';
  if (props.kind !== 'meetup') {
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' }),
          widgetURL(props.url),
        ]}
      >
        <Text
          modifiers={[
            font({ textStyle: 'caption', weight: 'semibold' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          ]}
        >
          {props.title}
        </Text>
        <Spacer />
        <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(2)]}>{props.empty}</Text>
        <Text
          modifiers={[
            font({ textStyle: 'caption' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            lineLimit(2),
          ]}
        >
          {props.emptyBody}
        </Text>
      </VStack>
    );
  }
  const at = new Date(props.startsAt);
  return (
    <VStack
      alignment="leading"
      spacing={2}
      modifiers={[
        frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' }),
        widgetURL(props.url),
      ]}
    >
      <Text
        modifiers={[
          font({ textStyle: 'caption', weight: 'semibold' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}
      >
        {props.title}
      </Text>
      <Spacer />
      <Text
        date={at}
        dateStyle="time"
        modifiers={[font({ textStyle: 'title', weight: 'bold' }), lineLimit(1)]}
      />
      <Text
        date={at}
        dateStyle="relative"
        modifiers={[
          font({ textStyle: 'caption' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          lineLimit(1),
        ]}
      />
      <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), lineLimit(1)]}>
        {props.place}
      </Text>
      {props.withName ? (
        <Text modifiers={[font({ textStyle: 'caption' }), lineLimit(1)]}>{props.withName}</Text>
      ) : null}
      {small ? null : (
        <HStack modifiers={[padding({ top: 4 })]}>
          <Text
            modifiers={[
              font({ textStyle: 'caption', weight: 'semibold' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          >
            {props.openLabel}
          </Text>
        </HStack>
      )}
    </VStack>
  );
}

export const NextMeetupWidget = createWidget<WidgetPayload>(NEXT_MEETUP_WIDGET, NextMeetupLayout);
