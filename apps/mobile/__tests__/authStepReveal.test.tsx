import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthStep } from '../src/features/auth/AuthStep';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), canGoBack: () => true }) }));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 667 },
  insets: { top: 20, left: 0, right: 0, bottom: 0 },
};
const wrap = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>
);

function setup(reveal: { y: number; height: number } | null) {
  const ui = (box: typeof reveal) =>
    wrap(
      <AuthStep title="Email" testID="step" reveal={box} dock={<Text>Send</Text>}>
        <Text>Field</Text>
      </AuthStep>,
    );
  const view = render(ui(null));
  const scroller = screen.UNSAFE_getByType(ScrollView).instance as unknown as ScrollView;
  const scrollTo = jest.spyOn(scroller, 'scrollTo');
  // The Jest ScrollView mock shares one jest.fn across instances.
  scrollTo.mockClear();
  act(() => {
    fireEvent(screen.UNSAFE_getByType(ScrollView), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 300 } },
    });
    // The first field sits 180 down the content, under the title.
    fireEvent(screen.getByTestId('auth-children'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 180, width: 375, height: 60 } },
    });
  });
  view.rerender(ui(reveal));
  return scrollTo;
}

describe('QA email card: AuthStep reveal', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scrolls a box that lands below the visible area into view', () => {
    const scrollTo = setup({ y: 400, height: 200 });
    // Box bottom 180 + 600 + gap is past 300, so scroll; capped so the field stays on top.
    expect(scrollTo).toHaveBeenCalledWith({ y: expect.any(Number), animated: true });
    const { y } = scrollTo.mock.calls[0]![0] as { y: number };
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThanOrEqual(180);
  });

  it('leaves the scroll alone when nothing new appears', () => {
    const scrollTo = setup(null);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
