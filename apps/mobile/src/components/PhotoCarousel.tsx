import { useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { photo as photoCopy } from '@/strings';

import { Photo } from './Photo';
import { Text } from './Text';

export type CarouselPhoto = {
  key: string;
  source: string | number | null;
  blurhash?: string | null;
};

/** Page index for a horizontal offset, clamped to the photos that exist. */
export function pageFromOffset(offsetX: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0 || count <= 0) return 0;
  const page = Math.round(offsetX / pageWidth);
  return Math.min(Math.max(page, 0), count - 1);
}

/** Next page for a screen-reader adjust action. */
export function stepPage(index: number, action: 'increment' | 'decrement', count: number): number {
  const next = action === 'increment' ? index + 1 : index - 1;
  return Math.min(Math.max(next, 0), Math.max(count - 1, 0));
}

const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];
const ACTIONS_WITH_OPEN = [...ACTIONS, { name: 'activate' }];

type Props = {
  photos: CarouselPhoto[];
  /** What the photos show, e.g. the listing title. */
  label: string;
  aspectRatio?: number;
  onPressPhoto?: (index: number) => void;
  onIndexChange?: (index: number) => void;
  testID?: string;
};

/**
 * Listing photos (P2-CMP-07, board B5): swipe between full-width photos with a
 * "1 / 4" count. Screen readers get one adjustable element (swipe up or down to
 * change photo) instead of a horizontal swipe they can't do.
 */
export function PhotoCarousel({
  photos,
  label,
  aspectRatio = 1,
  onPressPhoto,
  onIndexChange,
  testID,
}: Props) {
  const list = useRef<FlatList<CarouselPhoto>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  const goTo = (next: number) => {
    setIndex(next);
    onIndexChange?.(next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageFromOffset(e.nativeEvent.contentOffset.x, width, count);
    if (next !== index) goTo(next);
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const action = e.nativeEvent.actionName;
    if (action === 'activate') {
      onPressPhoto?.(index);
      return;
    }
    if (action !== 'increment' && action !== 'decrement') return;
    const next = stepPage(index, action, count);
    if (next === index) return;
    list.current?.scrollToIndex({ index: next, animated: false });
    goTo(next);
  };

  const position = fill(photoCopy.count, { index: index + 1, count });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: position }}
      accessibilityHint={onPressPhoto ? photoCopy.openHint : undefined}
      accessibilityActions={onPressPhoto ? ACTIONS_WITH_OPEN : ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={styles.frame(aspectRatio)}
    >
      {count === 0 ? (
        <Photo source={null} aspectRatio={aspectRatio} />
      ) : (
        <FlatList
          ref={list}
          data={photos}
          keyExtractor={(p) => p.key}
          horizontal
          pagingEnabled
          initialNumToRender={count}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          importantForAccessibility="no-hide-descendants"
          renderItem={({ item, index: i }) => (
            <Pressable
              testID={testID ? `${testID}-photo-${i}` : undefined}
              accessible={false}
              disabled={!onPressPhoto}
              onPress={() => onPressPhoto?.(i)}
              style={{ width }}
            >
              <Photo source={item.source} blurhash={item.blurhash} aspectRatio={aspectRatio} />
            </Pressable>
          )}
        />
      )}
      {count > 1 ? (
        <View style={styles.count} pointerEvents="none">
          <Text variant="meta" tone="onPhoto" overlay>
            {position}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: (aspectRatio: number) => ({
    width: '100%',
    aspectRatio,
    backgroundColor: theme.colors.bg2,
  }),
  count: {
    position: 'absolute',
    right: theme.space.lg,
    bottom: theme.space.md,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.overlay,
  },
}));
