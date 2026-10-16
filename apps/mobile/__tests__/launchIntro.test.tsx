import { act, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { LaunchIntro, useLaunchIntro } from '../src/features/auth/LaunchIntro';

const HIDDEN = { includeHiddenElements: true };

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(async () => {}) }));

describe('T-UNIT-LAUNCH-01 launch animation (DEC 135)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useLaunchIntro.setState({ ready: false });
  });
  afterEach(() => jest.useRealTimers());

  const renderAt = (initialUrl: string) =>
    renderRouter(
      {
        _layout: () => (
          <>
            <Text testID="app-under">app</Text>
            <LaunchIntro />
          </>
        ),
        index: () => null,
        discover: () => null,
      },
      { initialUrl },
    );

  it('covers the app until the launch screen has routed, then goes away', () => {
    renderAt('/');
    expect(screen.getByTestId('launch-intro', HIDDEN)).toBeTruthy();
    act(() => jest.advanceTimersByTime(3000));
    // The animation is over, but there is nowhere to go yet.
    expect(screen.getByTestId('launch-intro', HIDDEN)).toBeTruthy();
    act(() => useLaunchIntro.getState().setReady());
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByTestId('launch-intro', HIDDEN)).toBeNull();
    expect(screen.getByTestId('app-under')).toBeTruthy();
  });

  it('does not wait on a cold start straight into a deep link', () => {
    renderAt('/discover');
    act(() => jest.advanceTimersByTime(3000));
    expect(screen.queryByTestId('launch-intro', HIDDEN)).toBeNull();
  });

  it('never holds the app behind the cover forever', () => {
    renderAt('/');
    // A rest between swaps each step; the cover gives up after a few swaps.
    for (let i = 0; i < 12; i += 1) act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByTestId('launch-intro', HIDDEN)).toBeNull();
  });

  it('is hidden from VoiceOver', () => {
    renderAt('/');
    expect(screen.getByTestId('launch-intro', HIDDEN).props.accessibilityElementsHidden).toBe(true);
  });
});
