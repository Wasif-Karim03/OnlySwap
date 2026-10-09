import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { chat as copy } from '@/strings';

import { Icon } from './icons/Icon';
import { Photo } from './Photo';
import { clampProgress } from './Progress';
import { Tappable } from './Tappable';
import { Text } from './Text';

export type BubbleKind = 'mine' | 'theirs' | 'system';
export type BubbleState = 'pending' | 'sent' | 'failed';

/** How strongly a new contact's photo is blurred until tapped. */
export const PHOTO_BLUR_RADIUS = 40;

export type BubblePhoto = {
  /** Remote (signed) or local file URI; null while there is none yet. */
  source: string | null;
  /** Width / height for the frame. */
  aspect: number;
  /** A new contact's photo: blurred with "Tap to view" until revealed. */
  blurred?: boolean;
  /** Upload progress 0..1 while pending; null or undefined when not uploading. */
  progress?: number | null;
  onReveal?: () => void;
  /** Opens the full-screen viewer. */
  onOpen?: () => void;
  onLoad?: (size: { width: number; height: number }) => void;
  onError?: () => void;
};

type Props = {
  kind: BubbleKind;
  /** The text, or the photo caption ('' for none). */
  body: string;
  state?: BubbleState;
  /** Name for screen readers on incoming messages. */
  author?: string;
  scamHint?: string | null;
  onRetry?: () => void;
  /** Photo message (P8-CHAT-04). */
  photo?: BubblePhoto;
  /** Long press (and the screen-reader action) on incoming messages: report. */
  onLongPress?: () => void;
  /**
   * The chat background under the bubbles. `bg` (the default) is a white
   * screen: theirs on bg2, system rows as plain text. `card` is a grey message
   * area (DEC 90): theirs on white, system rows as small white pills.
   */
  surface?: 'bg' | 'card';
  testID?: string;
};

/** Chat bubble (DESIGN_SYSTEM §6 MessageBubble): mine / theirs / system, pending / sent / failed, scam hint row, photo. */
export function MessageBubble({
  kind,
  body,
  state = 'sent',
  author,
  scamHint,
  onRetry,
  photo,
  onLongPress,
  surface = 'bg',
  testID,
}: Props) {
  if (kind === 'system') {
    if (surface === 'card') {
      return (
        <View style={styles.systemRow} testID={testID} accessibilityRole="text">
          <View style={styles.pill}>
            <Text variant="meta" tone="ink2" style={styles.center}>
              {body}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.system} testID={testID} accessibilityRole="text">
        <Text variant="meta" tone="ink2" style={styles.center}>
          {body}
        </Text>
      </View>
    );
  }
  const mine = kind === 'mine';
  const uploading =
    photo && state === 'pending' && photo.progress !== null && photo.progress !== undefined
      ? Math.round(clampProgress(photo.progress) * 100)
      : null;
  const content = photo
    ? [
        photo.blurred
          ? fill(copy.photoHiddenLabel, { name: author ?? '' })
          : mine
            ? copy.yourPhoto
            : author
              ? fill(copy.photoFrom, { name: author })
              : copy.photoLabel,
        body,
      ]
        .filter(Boolean)
        .join('. ')
    : `${mine ? '' : author ? `${author}: ` : ''}${body}`;
  const label = `${content}${
    uploading !== null
      ? `. ${fill(copy.uploadingLabel, { percent: uploading })}`
      : state === 'pending'
        ? `. ${copy.sending}`
        : ''
  }`;

  const photoView = photo ? (
    <View style={styles.photo}>
      <Photo
        source={photo.source}
        aspectRatio={photo.aspect}
        rounded="none"
        blurRadius={photo.blurred ? PHOTO_BLUR_RADIUS : undefined}
        onLoad={photo.onLoad}
        onError={photo.onError}
        testID={testID ? `${testID}-photo` : undefined}
      />
      {photo.blurred ? (
        <View style={styles.cover} testID={testID ? `${testID}-blurred` : undefined}>
          <Icon name="eye" size={24} tone="onPhoto" />
          <Text variant="label" tone="onPhoto" overlay>
            {copy.tapToView}
          </Text>
        </View>
      ) : null}
      {uploading !== null ? (
        <View style={styles.progress} testID={testID ? `${testID}-progress` : undefined}>
          <Text variant="meta" tone="onPhoto" overlay>
            {fill(copy.uploading, { percent: uploading })}
          </Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const photoPress =
    photo && state === 'sent' ? (photo.blurred ? photo.onReveal : photo.onOpen) : undefined;
  const retrying = state === 'failed' && !!onRetry;
  const pressable = !retrying && (!!photoPress || !!onLongPress);

  const inner = (
    <View
      style={[styles.bubble(mine, state, surface), photo ? styles.photoBubble : null]}
      accessible={!retrying && !pressable}
      accessibilityLabel={label}
    >
      {photoView}
      {body ? (
        <View style={photo ? styles.caption : null}>
          <Text variant="body" tone={mine ? 'inverse' : 'ink'}>
            {body}
          </Text>
        </View>
      ) : null}
    </View>
  );

  let bubble = inner;
  if (retrying) {
    bubble = (
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={`${content}. ${copy.failed}`}
        onPress={onRetry}
      >
        {inner}
      </Tappable>
    );
  } else if (pressable) {
    bubble = (
      <Tappable
        accessibilityRole={photoPress ? 'button' : 'text'}
        accessibilityLabel={label}
        accessibilityHint={photoPress && !photo?.blurred ? copy.viewPhoto : undefined}
        onPress={photoPress}
        onLongPress={onLongPress}
        accessibilityActions={
          onLongPress ? [{ name: 'longpress', label: copy.reportMessage }] : undefined
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') onLongPress?.();
        }}
        testID={testID ? `${testID}-tap` : undefined}
      >
        {inner}
      </Tappable>
    );
  }

  return (
    <View style={styles.wrap(mine)} testID={testID}>
      {photo ? <View style={styles.photoBox}>{bubble}</View> : bubble}
      {state === 'failed' ? (
        <View style={styles.row}>
          <Icon name="alert" size={14} tone="red" />
          <Text variant="meta" tone="red">
            {copy.failed}
          </Text>
        </View>
      ) : null}
      {scamHint && !mine ? (
        <View
          style={styles.hint}
          accessibilityRole="alert"
          testID={testID ? `${testID}-hint` : undefined}
        >
          <Icon name="shield" size={14} tone="amber" />
          <Text variant="meta" tone="amber" style={styles.flex}>
            {scamHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (mine: boolean) => ({
    alignItems: mine ? 'flex-end' : 'flex-start',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.screen,
  }),
  bubble: (mine: boolean, state: BubbleState, surface: 'bg' | 'card' = 'bg') => ({
    maxWidth: '80%',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.card,
    backgroundColor: mine
      ? theme.colors.ink
      : surface === 'card'
        ? theme.colors.card
        : theme.colors.bg2,
    opacity: state === 'pending' ? 0.6 : 1,
  }),
  // Photo bubbles: the photo runs to the edges, the caption keeps the padding.
  photoBox: { width: '65%' },
  photoBubble: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  photo: { width: '100%' },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    backgroundColor: theme.colors.overlay,
  },
  progress: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    backgroundColor: theme.colors.overlay,
  },
  caption: { paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm },
  system: { paddingHorizontal: theme.space['2xl'], paddingVertical: theme.space.sm },
  systemRow: {
    alignItems: 'center',
    paddingHorizontal: theme.space['2xl'],
    paddingVertical: theme.space.xs,
  },
  pill: {
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.card,
  },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    maxWidth: '80%',
    padding: theme.space.sm,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.amberBg,
  },
  flex: { flexShrink: 1 },
}));
