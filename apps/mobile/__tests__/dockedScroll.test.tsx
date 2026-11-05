import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DockedScroll } from '../src/features/sell/SellStep';

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 667 },
  insets: { top: 20, left: 0, right: 0, bottom: 0 },
};
const wrap = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>
);

describe('QA recheck DockedScroll keyboard room', () => {
  it('lets the scroll run past the dock once the dock rides up with the keyboard', () => {
    render(
      wrap(
        <DockedScroll dock={<Text>Next</Text>}>
          <Text>Field</Text>
        </DockedScroll>,
      ),
    );
    act(() => {
      fireEvent(screen.getByTestId('sell-dock'), 'layout', {
        nativeEvent: { layout: { width: 375, height: 104 } },
      });
    });
    // Without the extra space the last field stays behind the raised dock.
    expect(screen.UNSAFE_getByType(KeyboardAwareScrollView).props.extraKeyboardSpace).toBe(104);
  });

  it('adds no room when there is no dock', () => {
    render(
      wrap(
        <DockedScroll>
          <Text>Field</Text>
        </DockedScroll>,
      ),
    );
    expect(screen.UNSAFE_getByType(KeyboardAwareScrollView).props.extraKeyboardSpace).toBe(0);
  });
});
