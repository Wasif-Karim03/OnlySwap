import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as RN from 'react-native';

import { GroupedList, ListRow } from '../src/components/ListRow';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { LARGE_TEXT_SCALE, useLargeText } from '../src/theme/largeText';

/** Pretends the user picked a Dynamic Type size (fontScale 1 is the default). */
export function mockFontScale(fontScale: number) {
  const base = { width: 375, height: 667, scale: 2 };
  act(() => RN.Dimensions.set({ window: { ...base, fontScale }, screen: { ...base, fontScale } }));
}

afterEach(() => mockFontScale(1));

function Probe() {
  return <RN.Text testID="probe">{String(useLargeText())}</RN.Text>;
}

describe('QA-H5 useLargeText', () => {
  it.each([
    [1, 'false'],
    [LARGE_TEXT_SCALE - 0.01, 'false'],
    [LARGE_TEXT_SCALE, 'true'],
    [2, 'true'],
  ])('fontScale %s gives %s', (scale, expected) => {
    mockFontScale(scale);
    render(<Probe />);
    expect(screen.getByTestId('probe').props.children).toBe(expected);
  });
});

const flat = (style: unknown): { textAlign?: string } =>
  (RN.StyleSheet.flatten(style as never) ?? {}) as { textAlign?: string };

describe('QA-H5 ListRow', () => {
  const row = () => (
    <GroupedList>
      <ListRow label="Appearance" value="Match system" onPress={() => {}} />
    </GroupedList>
  );

  it('keeps label and value side by side at default size', () => {
    mockFontScale(1);
    render(row());
    expect(screen.queryByTestId('list-row-stack')).toBeNull();
    expect(flat(screen.getByTestId('list-row-value').props.style).textAlign).toBe('right');
    expect(screen.getByTestId('list-row-value').props.numberOfLines).toBe(1);
  });

  it('puts the value under the label at large text, with no truncation', () => {
    mockFontScale(2);
    render(row());
    const stack = screen.getByTestId('list-row-stack');
    const kids = stack.children.map((c) => (typeof c === 'string' ? c : c.props.children));
    expect(kids).toEqual(['Appearance', 'Match system']);
    expect(screen.getByTestId('list-row-value').props.numberOfLines).toBeUndefined();
  });
});

describe('QA-H5 SegmentedControl', () => {
  const seg = (onChange = jest.fn()) => (
    <SegmentedControl
      label="Listings"
      segments={[
        { value: 'active', label: 'Active 3' },
        { value: 'sold', label: 'Sold 1' },
      ]}
      value="active"
      onChange={onChange}
    />
  );

  it('is a plain row at default size', () => {
    mockFontScale(1);
    render(seg());
    expect(screen.queryByTestId('segmented-scroll')).toBeNull();
  });

  it('scrolls sideways at large text and still selects', () => {
    mockFontScale(2);
    const onChange = jest.fn();
    render(seg(onChange));
    expect(screen.getByTestId('segmented-scroll').props.horizontal).toBe(true);
    fireEvent.press(screen.getByRole('tab', { name: 'Sold 1' }));
    expect(onChange).toHaveBeenCalledWith('sold');
  });
});
