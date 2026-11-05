import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PollView } from '../src/features/quad/components/QuadPostCard';
import type { QuadPoll } from '../src/features/quad/api';

const poll: QuadPoll = {
  options: [
    { id: 'a', label: 'Library', votes: 3 },
    { id: 'b', label: 'Union', votes: 1 },
  ],
  total: 4,
  my_option: 'a',
};

const colorOf = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;

describe('QA-H7 poll results stay readable on the accent fill', () => {
  it('draws your option a second time in on-accent ink over the bar', () => {
    render(<PollView poll={poll} canVote={false} onVote={() => {}} />);
    // Before layout there is one copy; after it the clipped on-accent copy appears.
    expect(screen.getAllByText('Library')).toHaveLength(1);
    const row = screen.getByLabelText(/Library/);
    act(() => {
      fireEvent(row, 'layout', { nativeEvent: { layout: { width: 320, height: 44 } } });
    });
    const copies = screen.getAllByText('Library');
    expect(copies).toHaveLength(2);
    // Jest renders the light theme, where ink and on-accent ink match; the copy
    // inside the bar must still be drawn in a defined color.
    expect(colorOf(copies[0]!)).toBeTruthy();
    expect(screen.getAllByText('75%')).toHaveLength(2);
  });

  it('draws other options once, in normal ink', () => {
    render(<PollView poll={poll} canVote={false} onVote={() => {}} />);
    const row = screen.getByLabelText(/Union/);
    act(() => {
      fireEvent(row, 'layout', { nativeEvent: { layout: { width: 320, height: 44 } } });
    });
    expect(screen.getAllByText('Union')).toHaveLength(1);
  });
});
