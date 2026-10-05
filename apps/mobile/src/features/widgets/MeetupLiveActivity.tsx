import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

import type { LiveProps } from './logic';

/** Native Live Activity name; must match the `expo-widgets` entry in app.config.ts. */
export const MEETUP_LIVE_ACTIVITY = 'MeetupActivity';

/**
 * Meetup Live Activity (P17-FEAT-01, board X34): countdown to the meetup,
 * the spot and a short status, on the Lock Screen and in the Dynamic Island.
 * Same runtime rules as the widget: only props, only @expo/ui/swift-ui.
 * The countdown is a system timer text, so it ticks without app updates.
 */
function MeetupActivityLayout(props: LiveProps) {
  'widget';
  const at = new Date(props.startsAt);
  const started = Date.now() >= props.startsAt;
  const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
  const timer = started ? (
    <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{props.startedLabel}</Text>
  ) : (
    <Text
      timerInterval={{ lower: new Date(), upper: at }}
      countsDown
      modifiers={[font({ textStyle: 'title2', weight: 'bold' }), monospacedDigit(), lineLimit(1)]}
    />
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 })]}>
        <HStack>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{props.title}</Text>
            <Text modifiers={[font({ textStyle: 'subheadline' }), secondary, lineLimit(1)]}>
              {props.place}
            </Text>
          </VStack>
          <Spacer />
          {timer}
        </HStack>
        <HStack>
          <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), lineLimit(1)]}>
            {props.status}
          </Text>
          <Spacer />
          <Text
            date={at}
            dateStyle="time"
            modifiers={[font({ textStyle: 'subheadline' }), secondary]}
          />
        </HStack>
      </VStack>
    ),
    compactLeading: (
      <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), lineLimit(1)]}>
        {props.place}
      </Text>
    ),
    compactTrailing: started ? (
      <Text date={at} dateStyle="time" modifiers={[font({ textStyle: 'caption' })]} />
    ) : (
      <Text
        timerInterval={{ lower: new Date(), upper: at }}
        countsDown
        modifiers={[font({ textStyle: 'caption' }), monospacedDigit()]}
      />
    ),
    minimal: <Text date={at} dateStyle="time" modifiers={[font({ textStyle: 'caption2' })]} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ textStyle: 'caption' }), secondary, lineLimit(1)]}>
          {props.title}
        </Text>
        <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{props.place}</Text>
      </VStack>
    ),
    expandedTrailing: timer,
    expandedBottom: (
      <HStack>
        <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), lineLimit(1)]}>
          {props.status}
        </Text>
        <Spacer />
        <Text
          date={at}
          dateStyle="time"
          modifiers={[font({ textStyle: 'subheadline' }), secondary]}
        />
      </HStack>
    ),
  };
}

export const MeetupLiveActivity = createLiveActivity<LiveProps>(
  MEETUP_LIVE_ACTIVITY,
  MeetupActivityLayout,
);
