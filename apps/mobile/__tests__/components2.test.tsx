import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppState, Linking } from 'react-native';

import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState, errorTitle } from '../src/components/ErrorState';
import { NavBar } from '../src/components/NavBar';
import { PermissionPrimer, PermissionPrimerView } from '../src/components/PermissionPrimer';
import { Photo, photoState } from '../src/components/Photo';
import { pageFromOffset, PhotoCarousel, stepPage } from '../src/components/PhotoCarousel';
import { clampProgress, ProgressBar, StepIndicator, stepLabel } from '../src/components/Progress';
import {
  blockDefault,
  canBlock,
  phaseAfterError,
  ReportSheet,
  reportReasons,
} from '../src/components/ReportSheet';
import {
  lineHeight,
  SkeletonCard,
  SkeletonList,
  useDelayedLoading,
} from '../src/components/Skeleton';
import { badgeText, TabBar, tabAccessibilityLabel } from '../src/components/TabBar';
import { clampPan, clampZoom, shouldDismiss } from '../src/components/ZoomableImage';
import { toAppError } from '../src/lib/errors';
import { fill } from '../src/lib/format';
import { primerStep, usePermissionPrimer, type OsPermission } from '../src/lib/permissions';
import { errors, nav, photo, primer, report, states } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const mockPermission = {
  camera: { status: 'undetermined', canAskAgain: true } as OsPermission,
  request: { status: 'granted', canAskAgain: true } as OsPermission,
};
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(async () => mockPermission.camera),
  requestCameraPermissionsAsync: jest.fn(async () => mockPermission.request),
  getMediaLibraryPermissionsAsync: jest.fn(async () => mockPermission.camera),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => mockPermission.request),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => mockPermission.camera),
  requestPermissionsAsync: jest.fn(async () => mockPermission.request),
}));

describe('format.fill', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('{index} / {count}', { index: 1, count: 4 })).toBe('1 / 4');
    expect(fill('Hi {name}', {})).toBe('Hi {name}');
  });
});

describe('P2-CMP-07 Photo, PhotoCarousel, ZoomableImage', () => {
  it('photoState: no source or not loaded is loading, a failure is error', () => {
    expect(photoState(null, false, false)).toBe('loading');
    expect(photoState('a.jpg', false, false)).toBe('loading');
    expect(photoState('a.jpg', true, false)).toBe('loaded');
    expect(photoState('a.jpg', true, true)).toBe('error');
  });

  it('shows the placeholder when the photo fails and says so to screen readers', () => {
    render(<Photo testID="p" source="https://x.test/a.jpg" accessibilityLabel="Desk lamp" />);
    expect(screen.getByTestId('p-image')).toBeTruthy();
    act(() =>
      fireEvent(screen.getByTestId('p-image'), 'error', { nativeEvent: { error: 'nope' } }),
    );
    expect(screen.getByTestId('p-error')).toBeTruthy();
    expect(screen.getByLabelText(`Desk lamp. ${photo.failed}`)).toBeTruthy();
  });

  it('pageFromOffset and stepPage stay inside the photos', () => {
    expect(pageFromOffset(0, 390, 4)).toBe(0);
    expect(pageFromOffset(390 * 2 + 100, 390, 4)).toBe(2);
    expect(pageFromOffset(390 * 9, 390, 4)).toBe(3);
    expect(pageFromOffset(-50, 390, 4)).toBe(0);
    expect(pageFromOffset(100, 0, 4)).toBe(0);
    expect(stepPage(0, 'decrement', 4)).toBe(0);
    expect(stepPage(0, 'increment', 4)).toBe(1);
    expect(stepPage(3, 'increment', 4)).toBe(3);
  });

  it('a 4-photo carousel shows 1 / 4, moves with screen-reader actions and opens a photo', () => {
    const onPressPhoto = jest.fn();
    const photos = [1, 2, 3, 4].map((n) => ({ key: `p${n}`, source: `https://x.test/${n}.jpg` }));
    render(
      <PhotoCarousel testID="c" photos={photos} label="Mini fridge" onPressPhoto={onPressPhoto} />,
    );
    const carousel = screen.getByTestId('c');
    act(() =>
      fireEvent(carousel, 'layout', { nativeEvent: { layout: { width: 390, height: 390 } } }),
    );
    expect(carousel.props.accessibilityRole).toBe('adjustable');
    expect(carousel.props.accessibilityValue).toEqual({ text: '1 / 4' });
    expect(screen.getByText('1 / 4')).toBeTruthy();
    act(() =>
      fireEvent(carousel, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }),
    );
    expect(screen.getByTestId('c').props.accessibilityValue).toEqual({ text: '2 / 4' });
    act(() =>
      fireEvent(carousel, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }),
    );
    expect(onPressPhoto).toHaveBeenCalledWith(1);
    fireEvent.press(screen.getByTestId('c-photo-3', { includeHiddenElements: true }));
    expect(onPressPhoto).toHaveBeenLastCalledWith(3);
  });

  it('hides the count for a single photo', () => {
    render(<PhotoCarousel photos={[{ key: 'a', source: 'a.jpg' }]} label="Lamp" />);
    expect(screen.queryByText('1 / 1')).toBeNull();
  });

  it('zoom stays within 1x to 4x, pans stay inside the image, and swipe-down closes only at 1x', () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(9)).toBe(4);
    expect(clampPan(500, 2, 400)).toBe(200);
    expect(clampPan(-500, 2, 400)).toBe(-200);
    expect(clampPan(50, 1, 400)).toBe(0);
    expect(shouldDismiss(1, 150, 0)).toBe(true);
    expect(shouldDismiss(1, 10, 900)).toBe(true);
    expect(shouldDismiss(1, 50, 100)).toBe(false);
    expect(shouldDismiss(2, 300, 1200)).toBe(false);
  });
});

describe('P2-CMP-08 EmptyState, ErrorState, Skeleton', () => {
  it('EmptyState has a header, body and a next step', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        icon="tag"
        tile="accent"
        title="Nothing listed yet"
        body="Listing takes about a minute."
        suggestions={['Textbooks', 'Lamps']}
        action={{ label: 'List your first thing', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'Nothing listed yet' })).toBeTruthy();
    expect(screen.getByText('Textbooks')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'List your first thing' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('ErrorState uses the error copy, an offline title, and spins while retrying', async () => {
    let settle: () => void = () => {};
    const onRetry = jest.fn(() => new Promise<void>((r) => (settle = r)));
    render(
      <ErrorState error={toAppError(new TypeError('Network request failed'))} onRetry={onRetry} />,
    );
    expect(screen.getByRole('header', { name: states.offlineTitle })).toBeTruthy();
    expect(screen.getByText(errors.ERR_OFFLINE)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: states.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: states.retry }).props.accessibilityState,
    ).toMatchObject({ busy: true });
    await act(async () => settle());
    expect(
      screen.getByRole('button', { name: states.retry }).props.accessibilityState,
    ).toMatchObject({ busy: false });
  });

  it('errorTitle: offline has its own title', () => {
    expect(errorTitle(toAppError(new Error('x')))).toBe(states.errorTitle);
    expect(errorTitle({ kind: 'app_error', code: 'ERR_OFFLINE' })).toBe(states.offlineTitle);
  });

  it('useDelayedLoading shows nothing for fast loads and the skeleton after 300 ms', () => {
    jest.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useDelayedLoading(loading),
      {
        initialProps: { loading: true },
      },
    );
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    rerender({ loading: false });
    expect(result.current).toBe(false);
    rerender({ loading: true });
    act(() => jest.advanceTimersByTime(100));
    rerender({ loading: false });
    act(() => jest.advanceTimersByTime(500));
    expect(result.current).toBe(false);
    jest.useRealTimers();
  });

  it('skeletons read as one busy "Loading" element', () => {
    render(
      <>
        <SkeletonCard testID="card" />
        <SkeletonList testID="list" rows={3} />
      </>,
    );
    for (const id of ['card', 'list']) {
      const el = screen.getByTestId(id);
      expect(el.props.accessibilityLabel).toBe(states.loading);
      expect(el.props.accessibilityState).toEqual({ busy: true });
    }
    expect(lineHeight('body')).toBe(16);
  });
});

describe('P2-CMP-09 NavBar, TabBar, StepIndicator, ProgressBar', () => {
  it('NavBar: large title for tab roots, back button for pushed screens', () => {
    const onBack = jest.fn();
    const { rerender } = render(<NavBar variant="large" title="Inbox" />);
    expect(screen.getByRole('header', { name: 'Inbox' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: nav.back })).toBeNull();
    rerender(<NavBar title="New listing" onLeading={onBack} />);
    fireEvent.press(screen.getByRole('button', { name: nav.back }));
    expect(onBack).toHaveBeenCalled();
    rerender(<NavBar title="Offer" leading="close" onLeading={onBack} />);
    expect(screen.getByRole('button', { name: nav.close })).toBeTruthy();
  });

  it('badgeText: hidden at 0, capped at 99+', () => {
    expect(badgeText(undefined)).toBeNull();
    expect(badgeText(0)).toBeNull();
    expect(badgeText(2)).toBe('2');
    expect(badgeText(150)).toBe('99+');
  });

  it.each(['ios', 'android'] as const)('TabBar (%s): tabs, selection and badges', (variant) => {
    const onSelect = jest.fn();
    const items = [
      { key: 'discover', label: 'Discover', icon: 'cards' as const },
      { key: 'inbox', label: 'Inbox', icon: 'chat' as const, badge: 2 },
    ];
    render(
      <TabBar
        testID="tb"
        variant={variant}
        items={items}
        activeKey="discover"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Discover', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Inbox, 2 new', selected: false })).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Inbox, 2 new' }));
    expect(onSelect).toHaveBeenCalledWith('inbox');
    expect(tabAccessibilityLabel(items[0]!)).toBe('Discover');
  });

  it('StepIndicator and ProgressBar report their value', () => {
    render(
      <>
        <StepIndicator testID="s" step={1} total={3} />
        <ProgressBar testID="p" value={0.456} label="Uploading photo 2" />
      </>,
    );
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('Step 1 of 3');
    expect(screen.getByTestId('s').props.accessibilityValue).toEqual({ min: 1, max: 3, now: 1 });
    expect(screen.getByTestId('p').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 46 });
    expect(stepLabel(2, 3)).toBe('Step 2 of 3');
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(2)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe('P2-CMP-10 PermissionPrimer (T-UNIT-CMP: state machine)', () => {
  let appState: jest.SpyInstance;
  const listeners: ((s: string) => void)[] = [];
  beforeEach(() => {
    listeners.length = 0;
    appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, fn) => {
      listeners.push(fn as (s: string) => void);
      return { remove: jest.fn() } as never;
    });
  });
  afterEach(() => appState.mockRestore());

  it.each<[OsPermission, string]>([
    [{ status: 'undetermined', canAskAgain: true }, 'primer'],
    [{ status: 'granted', canAskAgain: true }, 'granted'],
    [{ status: 'denied', canAskAgain: true }, 'primer'],
    [{ status: 'denied', canAskAgain: false }, 'settings'],
    [{ status: 'denied', canAskAgain: false, accessPrivileges: 'limited' }, 'granted'],
    [{ status: 'granted', canAskAgain: false, accessPrivileges: 'all' }, 'granted'],
  ])('%j -> %s', (permission, expected) => {
    expect(primerStep(permission)).toBe(expected);
  });

  function fakeApi(get: OsPermission, request: OsPermission) {
    return { get: jest.fn(async () => get), request: jest.fn(async () => request) };
  }

  it('never prompts on mount; the OS prompt only comes from request()', async () => {
    const api = fakeApi(
      { status: 'undetermined', canAskAgain: true },
      { status: 'granted', canAskAgain: true },
    );
    const { result } = renderHook(() => usePermissionPrimer('camera', api));
    await act(async () => {});
    expect(result.current.step).toBe('primer');
    expect(api.request).not.toHaveBeenCalled();
    let granted = false;
    await act(async () => {
      granted = await result.current.request();
    });
    expect(granted).toBe(true);
    expect(result.current.step).toBe('granted');
  });

  it('a final "no" leads to Settings, and coming back re-checks', async () => {
    const api = fakeApi(
      { status: 'undetermined', canAskAgain: true },
      { status: 'denied', canAskAgain: false },
    );
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const { result } = renderHook(() => usePermissionPrimer('photos', api));
    await act(async () => {});
    await act(async () => {
      await result.current.request();
    });
    expect(result.current.step).toBe('settings');
    await act(async () => result.current.openSettings());
    expect(openSettings).toHaveBeenCalled();
    api.get.mockResolvedValue({ status: 'granted', canAskAgain: false });
    await act(async () => listeners.forEach((l) => l('active')));
    expect(result.current.step).toBe('granted');
  });

  it('primer says Continue; the Settings step says Open Settings', () => {
    const onContinue = jest.fn();
    const onOpenSettings = jest.fn();
    const { rerender } = render(
      <PermissionPrimerView
        kind="camera"
        step="primer"
        onContinue={onContinue}
        onOpenSettings={onOpenSettings}
        onAlternative={() => {}}
      />,
    );
    expect(screen.getByRole('header', { name: primer.camera.title })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: primer.camera.cta }));
    expect(onContinue).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: primer.camera.alternative })).toBeTruthy();
    rerender(
      <PermissionPrimerView
        kind="notifications"
        step="settings"
        onContinue={onContinue}
        onOpenSettings={onOpenSettings}
      />,
    );
    expect(screen.getByRole('header', { name: primer.notifications.deniedTitle })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: primer.openSettings }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: primer.notifications.alternative })).toBeNull();
  });

  it('PermissionPrimer skips straight through when access is already granted', async () => {
    mockPermission.camera = { status: 'granted', canAskAgain: true };
    const onGranted = jest.fn();
    render(<PermissionPrimer kind="camera" onGranted={onGranted} />);
    await act(async () => {});
    expect(onGranted).toHaveBeenCalledTimes(1);
    mockPermission.camera = { status: 'undetermined', canAskAgain: true };
  });

  it('PermissionPrimer shows the primer, then asks the OS from its button', async () => {
    const onGranted = jest.fn();
    render(<PermissionPrimer kind="camera" onGranted={onGranted} />);
    await act(async () => {});
    expect(onGranted).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: primer.camera.cta }));
    });
    expect(onGranted).toHaveBeenCalledTimes(1);
  });
});

describe('P2-CMP-11 ConfirmDialog and ReportSheet', () => {
  it('ConfirmDialog spins while confirming and shows a failure inline', async () => {
    let fail: (e: Error) => void = () => {};
    const onConfirm = jest.fn(() => new Promise<void>((_r, j) => (fail = j)));
    render(
      <ConfirmDialog
        visible
        title="Delete listing?"
        message="It stops showing to buyers."
        confirmLabel="Delete listing"
        destructive
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Delete listing' }));
    expect(
      screen.getByRole('button', { name: 'Delete listing' }).props.accessibilityState,
    ).toMatchObject({ busy: true });
    await act(async () => fail(new Error('NOT_FOUND: gone')));
    expect(screen.getByText(errors.NOT_FOUND)).toBeTruthy();
  });

  it('reasons are valid DATA_MODEL reports.reason values', () => {
    const model = readFileSync(join(__dirname, '../../../docs/DATA_MODEL.md'), 'utf8');
    const check = model.match(/reason text not null check \(reason in \(([^)]*)\)/)![1]!;
    const allowed = new Set([...check.matchAll(/'(\w+)'/g)].map((m) => m[1]));
    for (const target of ['listing', 'user', 'chat', 'message'] as const) {
      for (const r of reportReasons(target)) expect(allowed.has(r)).toBe(true);
    }
    expect(canBlock('listing')).toBe(false);
    expect(canBlock('chat')).toBe(true);
  });

  it('block turns on for harassment unless the person already chose', () => {
    expect(blockDefault('harassment', false, false)).toBe(true);
    expect(blockDefault('threat', false, false)).toBe(true);
    expect(blockDefault('scam', true, false)).toBe(false);
    expect(blockDefault('harassment', false, true)).toBe(false);
    expect(phaseAfterError(new Error('ALREADY_REPORTED'))).toBe('duplicate');
    expect(phaseAfterError(new Error('RATE_LIMITED'))).toBe('form');
  });

  it('sends reason, details and block; send is off until a reason is picked', async () => {
    const onSubmit = jest.fn(async () => {});
    render(
      <ReportSheet visible onClose={() => {}} target="chat" name="Ben O." onSubmit={onSubmit} />,
    );
    expect(screen.getByRole('header', { name: 'Report Ben O.' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: report.send }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByRole('radio', { name: report.reasons.person.harassment }));
    expect(
      screen.getByRole('switch', { name: 'Also block Ben O.' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    fireEvent.changeText(screen.getByLabelText(report.detailsLabel), '  keeps texting  ');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: report.send }));
    });
    expect(onSubmit).toHaveBeenCalledWith({
      reason: 'harassment',
      details: 'keeps texting',
      block: true,
    });
    expect(screen.getByRole('header', { name: report.sentTitle })).toBeTruthy();
  });

  it('a duplicate report ends on "Already reported"; other errors stay on the form', async () => {
    const onSubmit = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error('RATE_LIMITED'))
      .mockRejectedValueOnce(new Error('ALREADY_REPORTED'));
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
    render(<ReportSheet visible onClose={() => {}} target="listing" onSubmit={onSubmit} />);
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: report.reasons.listing.stolen }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: report.send }));
    });
    expect(screen.getByText(errors.RATE_LIMITED)).toBeTruthy();
    now.mockReturnValue(20_000);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: report.send }));
    });
    expect(screen.getByRole('header', { name: report.duplicateTitle })).toBeTruthy();
    now.mockRestore();
  });
});
