import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import {
  flyTarget,
  nextScale,
  pastThreshold,
  releaseDir,
  rotationFor,
  stampOpacity,
} from '../src/features/feed/deckMath';
import { SwipeDeck, type SwipeDeckHandle } from '../src/features/feed/SwipeDeck';
import { cardLabel, savedLine, type DeckCard } from '../src/features/feed/SwipeCard';
import { feed } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const card = (id: string, title: string): DeckCard => ({
  id,
  title,
  price: '$40',
  meta: 'Good condition',
  sellerName: 'Aisha A.',
  sellerAvatar: null,
  photos: [{ uri: `https://media.test/${id}.webp`, blurhash: null }],
  saveCount: 0,
});
const CARDS = [
  card('a', 'Mini fridge'),
  card('b', 'Desk lamp'),
  card('c', 'Bike lock'),
  card('d', 'Rug'),
];

describe('T-UNIT-FEED-02 SwipeDeck gesture math', () => {
  const W = 400;

  it('releases at 35% of the width', () => {
    expect(releaseDir(139, 0, W)).toBeNull();
    expect(releaseDir(140, 0, W)).toBe('right');
    expect(releaseDir(-140, 0, W)).toBe('left');
    expect(pastThreshold(139, W)).toBe(false);
    expect(pastThreshold(-140, W)).toBe(true);
  });

  it('releases on a fling of 800 in the drag direction only', () => {
    expect(releaseDir(30, 799, W)).toBeNull();
    expect(releaseDir(30, 800, W)).toBe('right');
    expect(releaseDir(-30, -900, W)).toBe('left');
    expect(releaseDir(30, -900, W)).toBeNull();
    expect(releaseDir(0, 900, W)).toBeNull();
  });

  it('rotates x / width × 12°, clamped to ±12°', () => {
    expect(rotationFor(0, W)).toBe(0);
    expect(rotationFor(200, W)).toBe(6);
    expect(rotationFor(-200, W)).toBe(-6);
    expect(rotationFor(900, W)).toBe(12);
    expect(rotationFor(-900, W)).toBe(-12);
    expect(rotationFor(10, 0)).toBe(0);
  });

  it('fades the stamps in by 25% of the width, on their own side', () => {
    expect(stampOpacity(50, W, 'right')).toBe(0.5);
    expect(stampOpacity(100, W, 'right')).toBe(1);
    expect(stampOpacity(300, W, 'right')).toBe(1);
    expect(stampOpacity(100, W, 'left')).toBe(0);
    expect(stampOpacity(-100, W, 'left')).toBe(1);
  });

  it('grows the next card 0.95 → 1 up to the release line', () => {
    expect(nextScale(0, W)).toBe(0.95);
    expect(nextScale(70, W)).toBeCloseTo(0.975);
    expect(nextScale(-400, W)).toBe(1);
  });

  it('flies left, right and up for save', () => {
    expect(flyTarget('right', W, 600)).toEqual({ x: 600, y: 0 });
    expect(flyTarget('left', W, 600)).toEqual({ x: -600, y: 0 });
    expect(flyTarget('save', W, 600).y).toBeLessThan(-600);
  });
});

describe('SwipeDeck', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps three cards mounted with the top one labelled for screen readers', async () => {
    render(<SwipeDeck cards={CARDS} onSwipe={jest.fn()} onOpen={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('deck-card-a')).toBeTruthy();
    expect(screen.getByLabelText(cardLabel(CARDS[0]!))).toBeTruthy();
    expect(screen.getByText('Bike lock', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Rug', { includeHiddenElements: true })).toBeNull();
  });

  it('swipes programmatically through the ref and the buttons', async () => {
    const onSwipe = jest.fn();
    const ref = createRef<SwipeDeckHandle>();
    render(<SwipeDeck ref={ref} cards={CARDS} onSwipe={onSwipe} onOpen={jest.fn()} />);
    await act(async () => {});
    act(() => ref.current!.swipe('right'));
    expect(onSwipe).toHaveBeenLastCalledWith(CARDS[0], 'right');
  });

  it('the save button saves the top card', async () => {
    const onSwipe = jest.fn();
    const { rerender } = render(<SwipeDeck cards={CARDS} onSwipe={onSwipe} onOpen={jest.fn()} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('deck-save'));
    expect(onSwipe).toHaveBeenLastCalledWith(CARDS[0], 'save');
    rerender(<SwipeDeck cards={CARDS.slice(1)} onSwipe={onSwipe} onOpen={jest.fn()} />);
    expect(screen.getByTestId('deck-card-b')).toBeTruthy();
  });

  it('with no cards the buttons are disabled', async () => {
    render(<SwipeDeck cards={[]} onSwipe={jest.fn()} onOpen={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('deck-offer').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('says how many people saved a card', () => {
    expect(savedLine(0)).toBeNull();
    expect(savedLine(1)).toBe(feed.savedByOne);
    expect(savedLine(3)).toBe('3 people saved this');
  });
});

describe('T-UNIT-FEED-03 SwipeDeck a11y', () => {
  afterEach(() => jest.restoreAllMocks());

  it('turns into a list with four actions when a screen reader is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onSwipe = jest.fn();
    const onOpen = jest.fn();
    render(<SwipeDeck cards={CARDS} onSwipe={onSwipe} onOpen={onOpen} />);
    await act(async () => {});
    expect(screen.getByTestId('deck-list')).toBeTruthy();
    const item = screen.getByTestId('deck-item-a');
    expect(item.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'offer',
      'save',
      'skip',
      'activate',
    ]);
    fireEvent(item, 'accessibilityAction', { nativeEvent: { actionName: 'save' } });
    expect(onSwipe).toHaveBeenLastCalledWith(CARDS[0], 'save');
    fireEvent(item, 'accessibilityAction', { nativeEvent: { actionName: 'skip' } });
    expect(onSwipe).toHaveBeenLastCalledWith(CARDS[0], 'left');
    fireEvent(item, 'accessibilityAction', { nativeEvent: { actionName: 'offer' } });
    expect(onSwipe).toHaveBeenLastCalledWith(CARDS[0], 'right');
    fireEvent(item, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onOpen).toHaveBeenCalledWith(CARDS[0]);
    // Every card is listed, not just three.
    expect(screen.getByTestId('deck-item-d')).toBeTruthy();
  });

  it('list mode can be forced (reduce motion) and the ref still swipes', async () => {
    const onSwipe = jest.fn();
    const ref = createRef<SwipeDeckHandle>();
    render(<SwipeDeck ref={ref} listMode cards={CARDS} onSwipe={onSwipe} onOpen={jest.fn()} />);
    await act(async () => {});
    act(() => ref.current!.swipe('left'));
    expect(onSwipe).toHaveBeenLastCalledWith(CARDS[0], 'left');
  });
});
