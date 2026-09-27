import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UnistylesRuntime } from 'react-native-unistyles';

import { KitScreen } from '../src/features/dev/KitScreen';
import { StateFrameScreen, StatesGalleryScreen } from '../src/features/dev/StatesGalleryScreen';
import { STATE_FRAMES } from '../src/features/dev/stateFrames';
import { kit2 } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Link: ({ children }: { children: unknown }) => children,
}));

/**
 * The X frames in board order, numbered the way the board captions them
 * (design/source-parts/p8r.html): add() appends, addAfter() inserts after a name.
 */
function boardXFrames(): string[] {
  const html = readFileSync(join(__dirname, '../../../design/OS_FInal Design.html'), 'utf8');
  const order: { sec: string; name: string }[] = [];
  const calls = /\b(add|addAfter)\('([A-Z])','((?:[^'\\]|\\.)*)'(?:,'((?:[^'\\]|\\.)*)')?/g;
  for (const [, fn, sec, a, b] of html.matchAll(calls)) {
    if (fn === 'add') {
      order.push({ sec: sec!, name: a! });
    } else {
      const i = order.findIndex((s) => s.sec === sec && s.name === a);
      const item = { sec: sec!, name: b! };
      if (i < 0) order.push(item);
      else order.splice(i + 1, 0, item);
    }
  }
  return order.filter((s) => s.sec === 'X').map((s) => s.name.replace(/\\'/g, "'"));
}

describe('P2-KIT-02 states gallery', () => {
  it('has every board X frame, in board order, with the board caption numbers', () => {
    const board = boardXFrames();
    expect(board.length).toBeGreaterThan(30);
    expect(STATE_FRAMES.map((f) => f.name)).toEqual(board);
    STATE_FRAMES.forEach((f, i) => expect(f.id).toBe(`X${i + 1}`));
  });

  it('lists every frame', () => {
    render(<StatesGalleryScreen />);
    for (const f of STATE_FRAMES) {
      expect(screen.getByRole('button', { name: `${f.id} ${f.name}` })).toBeTruthy();
    }
  });

  it.each(STATE_FRAMES.map((f) => [f.id, f.name]))('renders %s %s', (id) => {
    render(<StateFrameScreen id={id} />);
    expect(screen.getByTestId(`state-${id}`)).toBeTruthy();
  });
});

describe('P2-KIT-01 component kit', () => {
  it('renders every S5 and S6 section', () => {
    render(<KitScreen />);
    for (const title of [kit2.photos, kit2.navigation, kit2.states, kit2.primers, kit2.dialogs]) {
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
    }
  });

  it('previews another accent in both modes', () => {
    const update = jest.fn();
    const original = UnistylesRuntime.updateTheme;
    UnistylesRuntime.updateTheme = update;
    render(<KitScreen />);
    act(() => fireEvent.press(screen.getByRole('checkbox', { name: 'Cobalt' })));
    expect(update).toHaveBeenCalledWith('light', expect.any(Function));
    expect(update).toHaveBeenCalledWith('dark', expect.any(Function));
    const lightTheme = update.mock.calls.find((c) => c[0] === 'light')![1]();
    expect(lightTheme.colors.accent).toBe('#2B45E8');
    expect(lightTheme.colors.onAccent).toBe('#FFFFFF');
    UnistylesRuntime.updateTheme = original;
  });
});
