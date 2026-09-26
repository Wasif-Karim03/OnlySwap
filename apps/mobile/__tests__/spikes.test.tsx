import { fireEvent, render, screen } from '@testing-library/react-native';

import { SpikesScreen } from '../src/features/dev/SpikesScreen';
import { dev } from '../src/strings/en';

jest.mock('expo-age-range', () => ({
  requestAgeSignalsAccessAsync: jest.fn(async () => null),
  requestAgeRangeAsync: jest.fn(async () => ({ lowerBound: 18, upperBound: null })),
}));

describe('P1-SPIKE-04 spike screen (MMKV + Unistyles + keyboard-controller)', () => {
  it('persists the MMKV counter across remounts', () => {
    const first = render(<SpikesScreen />);
    const start = Number(screen.getByTestId('spike-mmkv-count').props.children);
    fireEvent.press(screen.getByText(dev.mmkvButton));
    expect(screen.getByTestId('spike-mmkv-count').props.children).toBe(start + 1);
    first.unmount();
    render(<SpikesScreen />);
    expect(screen.getByTestId('spike-mmkv-count').props.children).toBe(start + 1);
  });

  it('P1-SPIKE-03 shows the OS age signal result', async () => {
    render(<SpikesScreen />);
    fireEvent.press(screen.getByText(dev.ageButton));
    expect(await screen.findByText(/"lowerBound": 18/)).toBeTruthy();
  });
});
