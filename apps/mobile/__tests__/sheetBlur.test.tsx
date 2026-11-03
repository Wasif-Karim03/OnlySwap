import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Sheet } from '../src/components/Sheet';

const mockBlurListeners = new Set<() => void>();
const mockNavigation = {
  addListener: jest.fn((_event: 'blur', cb: () => void) => {
    mockBlurListeners.add(cb);
    return () => {
      mockBlurListeners.delete(cb);
    };
  }),
};

jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));

const blurScreen = () => act(() => [...mockBlurListeners].forEach((cb) => cb()));

describe('QA-H4 sheets close when their screen loses focus', () => {
  beforeEach(() => {
    mockBlurListeners.clear();
    mockNavigation.addListener.mockClear();
  });

  it('calls onClose when the screen blurs while the sheet is open', () => {
    const onClose = jest.fn();
    render(
      <Sheet visible onClose={onClose} title="Filters">
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.getByText('Filters')).toBeTruthy();
    blurScreen();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen while closed', () => {
    const onClose = jest.fn();
    render(
      <Sheet visible={false} onClose={onClose}>
        <Text>body</Text>
      </Sheet>,
    );
    blurScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockNavigation.addListener).not.toHaveBeenCalled();
  });

  it('stops listening after the sheet closes', () => {
    const onClose = jest.fn();
    const view = render(
      <Sheet visible onClose={onClose}>
        <Text>body</Text>
      </Sheet>,
    );
    view.rerender(
      <Sheet visible={false} onClose={onClose}>
        <Text>body</Text>
      </Sheet>,
    );
    blurScreen();
    expect(onClose).not.toHaveBeenCalled();
  });
});
