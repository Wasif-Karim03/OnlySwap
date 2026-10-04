import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';

import { avatarShade, initials } from '../src/components/Avatar';
import { isOffline, OFFLINE_SHOW_DELAY_MS, OfflineBanner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { ChipGroup, toggleChip } from '../src/components/Chip';
import { IconButton } from '../src/components/IconButton';
import { Input } from '../src/components/Input';
import { GroupedList, ListRow } from '../src/components/ListRow';
import { OptionRow } from '../src/components/OptionRow';
import { normalizeCode, OTPInput } from '../src/components/OTPInput';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { shouldCloseSheet, Sheet } from '../src/components/Sheet';
import { clampStep, Stepper } from '../src/components/Stepper';
import { counterTone } from '../src/components/TextArea';
import { TOAST_MS, ToastHost, UNDO_MS, useToastStore } from '../src/components/Toast';
import { Toggle } from '../src/components/Toggle';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('P2-CMP-01 Button', () => {
  it('presses, and guards double taps within 500 ms', () => {
    const now = jest.spyOn(Date, 'now');
    const onPress = jest.fn();
    render(<Button label="Post item" onPress={onPress} />);
    now.mockReturnValue(1000);
    fireEvent.press(screen.getByRole('button', { name: 'Post item' }));
    now.mockReturnValue(1300);
    fireEvent.press(screen.getByRole('button', { name: 'Post item' }));
    now.mockReturnValue(1600);
    fireEvent.press(screen.getByRole('button', { name: 'Post item' }));
    expect(onPress).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('does nothing when disabled or loading, and says so to screen readers', () => {
    const onPress = jest.fn();
    render(
      <>
        <Button label="A" disabled onPress={onPress} />
        <Button label="B" loading onPress={onPress} />
      </>,
    );
    // Disabled pressables drop presses (RNTL does not dispatch to them).
    expect(screen.getByRole('button', { name: 'A' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByRole('button', { name: 'B' }).props.accessibilityState).toMatchObject({
      busy: true,
    });
  });

  it('keeps the same views while loading (Android crash on Post, owner testing)', () => {
    const { rerender, toJSON } = render(<Button label="Post listing" onPress={() => {}} />);
    const shape = (node: unknown): unknown => {
      const n = node as { type: string; children?: unknown[] } | string;
      if (typeof n === 'string') return 'text';
      return [n.type, (n.children ?? []).map(shape)];
    };
    const idle = shape(toJSON());
    rerender(<Button label="Post listing" loading onPress={() => {}} />);
    expect(shape(toJSON())).toEqual(idle);
  });

  it('fires the success haptic only when asked (haptics budget)', () => {
    const Haptics = jest.requireMock('expo-haptics');
    Haptics.notificationAsync.mockClear();
    render(
      <>
        <Button label="Plain" onPress={() => {}} />
        <Button label="Send offer" hapticOnPress="success" onPress={() => {}} />
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Plain' }));
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Send offer' }));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('IconButton has a label and a 44 pt target', () => {
    render(<IconButton icon="share" accessibilityLabel="Share" />);
    const btn = screen.getByRole('button', { name: 'Share' });
    const inner = btn.findAll(
      (n) => n.props.style && StyleSheet.flatten(n.props.style)?.width === 44,
    );
    expect(inner.length).toBeGreaterThan(0);
  });
});

describe('P2-CMP-02 Input, TextArea, OTPInput', () => {
  it('shows the error message and exposes it as the hint', () => {
    render(<Input label="First name" error="Use letters only." />);
    expect(screen.getByText('Use letters only.')).toBeTruthy();
    expect(screen.getByLabelText('First name').props.accessibilityHint).toBe('Use letters only.');
  });

  it('disables editing and applies email keyboard settings', () => {
    render(
      <>
        <Input label="Campus" disabled />
        <Input label="Email" kind="email" />
      </>,
    );
    expect(screen.getByLabelText('Campus').props.editable).toBe(false);
    expect(screen.getByLabelText('Email').props).toMatchObject({
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    });
  });

  it('counter turns amber at 90% and red at 100%', () => {
    expect(counterTone(0, 40)).toBe('ink2');
    expect(counterTone(35, 40)).toBe('ink2');
    expect(counterTone(36, 40)).toBe('amber');
    expect(counterTone(40, 40)).toBe('red');
  });

  it('OTP keeps digits only and completes at 6', () => {
    expect(normalizeCode('12a 3-45678')).toBe('123456');
    const onChange = jest.fn();
    const onComplete = jest.fn();
    render(<OTPInput label="Code" value="" onChange={onChange} onComplete={onComplete} />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '12 34 56');
    expect(onChange).toHaveBeenCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(screen.getByTestId('otp-input').props.textContentType).toBe('oneTimeCode');
  });
});

describe('P2-CMP-03 controls set a11y roles and state', () => {
  it('chips toggle as filter (multi) or choice (single)', () => {
    expect(toggleChip(['a'], 'b', 'multi')).toEqual(['a', 'b']);
    expect(toggleChip(['a', 'b'], 'a', 'multi')).toEqual(['b']);
    expect(toggleChip(['a'], 'b', 'single')).toEqual(['b']);
    expect(toggleChip(['a'], 'a', 'single')).toEqual([]);
    const onChange = jest.fn();
    render(
      <ChipGroup
        label="Cats"
        value={['a']}
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'A' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    fireEvent.press(screen.getByRole('checkbox', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('segmented control uses tab roles and allows only 2 to 4 segments', () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl
        label="Cond"
        value="n"
        onChange={onChange}
        segments={[
          { value: 'n', label: 'New' },
          { value: 'g', label: 'Good' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'New' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    fireEvent.press(screen.getByRole('tab', { name: 'Good' }));
    expect(onChange).toHaveBeenCalledWith('g');
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <SegmentedControl
          label="x"
          value="a"
          onChange={() => {}}
          segments={[{ value: 'a', label: 'A' }]}
        />,
      ),
    ).toThrow('2 to 4');
    err.mockRestore();
  });

  it('toggle is a switch with checked state', () => {
    const onChange = jest.fn();
    render(<Toggle label="Alerts" value={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Alerts' });
    expect(sw.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('option rows are radios or checkboxes over the whole row', () => {
    const onPress = jest.fn();
    render(<OptionRow kind="radio" label="Pickup" selected onPress={onPress} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Pickup' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Pickup' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('stepper clamps and is adjustable for screen readers', () => {
    expect(clampStep(5, 1, 1, 5)).toBe(5);
    expect(clampStep(1, -1, 1, 5)).toBe(1);
    const onChange = jest.fn();
    render(
      <Stepper
        label="Qty"
        value={1}
        min={1}
        max={5}
        onChange={onChange}
        decreaseLabel="Less"
        increaseLabel="More"
      />,
    );
    expect(screen.getByRole('adjustable', { name: 'Qty' }).props.accessibilityValue).toEqual({
      min: 1,
      max: 5,
      now: 1,
    });
    fireEvent(screen.getByRole('adjustable', { name: 'Qty' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByRole('button', { name: 'Less' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('P2-CMP-04 Sheet', () => {
  it('closes past 30% drag or on a fast fling', () => {
    expect(shouldCloseSheet(100, 0, 400)).toBe(false);
    expect(shouldCloseSheet(130, 0, 400)).toBe(true);
    expect(shouldCloseSheet(20, 900, 400)).toBe(true);
  });

  it('renders content when visible and closes from the scrim', () => {
    const onClose = jest.fn();
    render(
      <Sheet visible onClose={onClose} title="Make an offer" testID="s">
        <Input label="Offer" kind="price" />
      </Sheet>,
    );
    expect(screen.getByText('Make an offer')).toBeTruthy();
    fireEvent.press(screen.getByTestId('s-scrim'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when never opened', () => {
    render(
      <Sheet visible={false} onClose={() => {}} title="Hidden">
        <Input label="x" />
      </Sheet>,
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('P2-CMP-05 Toast and banners', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => useToastStore.getState().dismiss());
    jest.useRealTimers();
  });

  it('auto-dismisses after 4 s', () => {
    render(<ToastHost />);
    act(() => useToastStore.getState().show('success', 'Offer sent'));
    expect(screen.getByText('Offer sent')).toBeTruthy();
    act(() => jest.advanceTimersByTime(TOAST_MS - 10));
    expect(screen.queryByText('Offer sent')).toBeTruthy();
    act(() => jest.advanceTimersByTime(20));
    expect(screen.queryByText('Offer sent')).toBeNull();
  });

  it('undo toast lasts 5 s and runs the undo', () => {
    const undo = jest.fn();
    render(<ToastHost />);
    act(() => useToastStore.getState().showUndo('Listing hidden', undo));
    act(() => jest.advanceTimersByTime(TOAST_MS + 100));
    expect(screen.getByText('Listing hidden')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalled();
    expect(UNDO_MS).toBe(5000);
  });

  it('a new toast replaces the old one', () => {
    render(<ToastHost />);
    act(() => useToastStore.getState().show('info', 'One'));
    act(() => useToastStore.getState().show('error', 'Two'));
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.getByText('Two')).toBeTruthy();
  });

  it('the offline banner waits out short drops before showing', () => {
    const NetInfo = jest.requireMock('@react-native-community/netinfo');
    const spy = jest
      .spyOn(NetInfo, 'useNetInfo')
      .mockReturnValue({ isConnected: false, isInternetReachable: false });
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => jest.advanceTimersByTime(OFFLINE_SHOW_DELAY_MS + 10));
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    spy.mockRestore();
  });

  it('treats disconnected or unreachable as offline', () => {
    expect(isOffline({ isConnected: false, isInternetReachable: null })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});

describe('P2-CMP-06 Card, ListRow, Tag, Avatar, icons', () => {
  it('initials and a stable avatar shade', () => {
    expect(initials('maya chen')).toBe('MC');
    expect(initials('Jordan')).toBe('J');
    expect(initials('  Sam  de la Rivera ')).toBe('SR');
    expect(avatarShade('Maya')).toBe(avatarShade('Maya'));
  });

  it('list rows read label and value together', () => {
    render(
      <GroupedList header="Account">
        <ListRow label="Email" value="you@school.edu" onPress={() => {}} />
        <ListRow label="Delete account" destructive onPress={() => {}} />
      </GroupedList>,
    );
    expect(screen.getByRole('button', { name: 'Email, you@school.edu' })).toBeTruthy();
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('icon data matches the board', () => {
    execFileSync(
      process.execPath,
      [join(__dirname, '../../../scripts/generate-icons.mjs'), '--check'],
      { stdio: 'pipe' },
    );
  });
});
