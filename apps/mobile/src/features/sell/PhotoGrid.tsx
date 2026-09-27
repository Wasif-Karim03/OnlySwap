import { useState } from 'react';
import { Pressable, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/icons/Icon';
import { Photo } from '@/components/Photo';
import { ProgressBar } from '@/components/Progress';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { sell as copy } from '@/strings/en';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

import { cellAt, MAX_PHOTOS, type DraftPhoto } from './logic';

export const COLUMNS = 3;
const GAP = 8;

type Props = {
  photos: DraftPhoto[];
  progress: Record<string, number>;
  /** Preview source for a photo: its local file, or the uploaded thumbnail. */
  sourceOf: (photo: DraftPhoto) => string;
  onCamera: () => void;
  onLibrary: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onMove: (from: number, to: number) => void;
};

/**
 * Sell step 1 grid (board D1, X15): 3 columns, the first photo is the cover.
 * Hold and drag a photo to reorder; screen readers get Move earlier / Move
 * later / Make cover actions instead (CLAUDE.md rule 10). No haptics here
 * (DESIGN_SYSTEM §5 budget).
 */
export function PhotoGrid({
  photos,
  progress,
  sourceOf,
  onCamera,
  onLibrary,
  onRemove,
  onRetry,
  onMove,
}: Props) {
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const room = photos.length < MAX_PHOTOS;
  const used = photos.length + (room ? 2 : 0);
  const blanks = Math.max(0, Math.max(COLUMNS * 2, Math.ceil(used / COLUMNS) * COLUMNS) - used);

  return (
    <View
      style={styles.grid}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      testID="sell-photo-grid"
    >
      {photos.map((p, i) => (
        <PhotoTile
          key={p.id}
          photo={p}
          index={i}
          count={photos.length}
          cell={cell}
          progress={progress[p.id] ?? 0}
          source={sourceOf(p)}
          onRemove={() => onRemove(p.id)}
          onRetry={() => onRetry(p.id)}
          onMove={onMove}
        />
      ))}
      {room ? (
        <>
          <AddTile
            cell={cell}
            icon="camera"
            label={copy.camera}
            onPress={onCamera}
            testID="sell-add-camera"
          />
          <AddTile
            cell={cell}
            icon="image"
            label={copy.library}
            onPress={onLibrary}
            testID="sell-add-library"
          />
        </>
      ) : null}
      {Array.from({ length: blanks }, (_, i) => (
        <View key={`blank-${i}`} style={[styles.blank, { width: cell, height: cell }]} />
      ))}
    </View>
  );
}

function AddTile({
  cell,
  icon,
  label,
  onPress,
  testID,
}: {
  cell: number;
  icon: 'camera' | 'image';
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={[styles.add, { width: cell, height: cell }]}
    >
      <Icon name={icon} size={24} tone="ink2" />
      <Text variant="meta" tone="ink2">
        {label}
      </Text>
    </Pressable>
  );
}

function PhotoTile({
  photo,
  index,
  count,
  cell,
  progress,
  source,
  onRemove,
  onRetry,
  onMove,
}: {
  photo: DraftPhoto;
  index: number;
  count: number;
  cell: number;
  progress: number;
  source: string;
  onRemove: () => void;
  onRetry: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const reduced = useReducedMotion();
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const settle = resolveMotion('fade', reduced);
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const originX = col * (cell + GAP) + cell / 2;
  const originY = row * (cell + GAP) + cell / 2;

  const drop = (x: number, y: number) => {
    const to = cellAt(x, y, cell, GAP, COLUMNS, count);
    if (to !== index) onMove(index, to);
  };

  const drag = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      lifted.set(1);
    })
    .onUpdate((e) => {
      dx.set(e.translationX);
      dy.set(e.translationY);
    })
    .onEnd((e) => {
      runOnJS(drop)(originX + e.translationX, originY + e.translationY);
    })
    .onFinalize(() => {
      dx.set(animateTo(0, settle));
      dy.set(animateTo(0, settle));
      lifted.set(0);
    });

  const moving = useAnimatedStyle(() => ({
    zIndex: lifted.value ? 10 : 0,
    opacity: lifted.value ? 0.9 : 1,
    transform: [{ translateX: dx.value }, { translateY: dy.value }],
  }));

  const n = index + 1;
  const label =
    photo.status === 'failed'
      ? fill(copy.retryLabel, { n })
      : fill(index === 0 ? copy.photoCoverLabel : copy.photoLabel, { n, total: count });

  const actions = [
    ...(index > 0 ? [{ name: 'earlier', label: copy.moveEarlier }] : []),
    ...(index < count - 1 ? [{ name: 'later', label: copy.moveLater }] : []),
    ...(index > 0 ? [{ name: 'cover', label: copy.makeCover }] : []),
    { name: 'remove', label: fill(copy.removePhoto, { n }) },
  ];
  const a11yActions = photo.status === 'failed' ? [{ name: 'activate' }, ...actions] : actions;
  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'earlier') onMove(index, index - 1);
    else if (name === 'later') onMove(index, index + 1);
    else if (name === 'cover') onMove(index, 0);
    else if (name === 'remove') onRemove();
    else if (name === 'activate' && photo.status === 'failed') onRetry();
  };

  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={[{ width: cell, height: cell }, moving]}>
        <Pressable
          testID={`sell-photo-${index}`}
          accessibilityRole={photo.status === 'failed' ? 'button' : 'image'}
          accessibilityLabel={label}
          accessibilityActions={a11yActions}
          onAccessibilityAction={onAction}
          onPress={photo.status === 'failed' ? onRetry : undefined}
          style={styles.tile}
        >
          <View style={styles.photo(photo.status === 'failed')}>
            <Photo source={source} blurhash={photo.blurhash} rounded="thumb" />
          </View>
          {index === 0 ? (
            <View style={styles.cover}>
              <Text variant="meta" tone="inverse">
                {copy.cover}
              </Text>
            </View>
          ) : null}
          {photo.status === 'uploading' ? (
            <View style={styles.progress}>
              <ProgressBar value={progress} label={copy.uploading} />
            </View>
          ) : null}
          {photo.status === 'failed' ? (
            <View style={styles.failed} testID={`sell-photo-retry-${index}`}>
              <Icon name="refresh" size={20} tone="red" />
              <Text variant="meta" tone="red">
                {copy.retry}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          testID={`sell-photo-remove-${index}`}
          accessibilityRole="button"
          accessibilityLabel={fill(copy.removePhoto, { n })}
          hitSlop={11}
          onPress={onRemove}
          style={styles.remove}
        >
          <Icon name="x" size={14} tone="inverse" />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { flex: 1 },
  photo: (faded: boolean) => ({ flex: 1, opacity: faded ? 0.45 : 1 }),
  blank: { borderRadius: theme.radius.thumb, backgroundColor: theme.colors.bg2 },
  add: {
    borderRadius: theme.radius.thumb,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  cover: {
    position: 'absolute',
    left: theme.space.xs,
    bottom: theme.space.xs,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.ink,
  },
  progress: {
    position: 'absolute',
    left: theme.space.sm,
    right: theme.space.sm,
    bottom: theme.space.sm,
  },
  failed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  remove: {
    position: 'absolute',
    top: theme.space.xs,
    right: theme.space.xs,
    width: 22,
    height: 22,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.ink,
  },
}));
