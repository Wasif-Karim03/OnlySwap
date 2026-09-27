import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import RootLayout from '../app/_layout';
import TabsLayout from '../app/(tabs)/_layout';
import DiscoverLayout from '../app/(tabs)/discover/_layout';
import DiscoverScreen from '../app/(tabs)/discover/index';
import InboxLayout from '../app/(tabs)/inbox/_layout';
import InboxScreen from '../app/(tabs)/inbox/index';
import ProfileLayout from '../app/(tabs)/profile/_layout';
import ProfileScreen from '../app/(tabs)/profile/index';
import SellLayout from '../app/(tabs)/sell/_layout';
import SellScreen from '../app/(tabs)/sell/index';
import WelcomeRoute from '../app/(auth)/welcome';
import Index from '../app/index';
import type { AppGate } from '../src/features/auth/useAppGate';
import { tabs, welcome } from '../src/strings/en';

// The Launch screen asks the gate where to go; these tests pick the answer.
const mockGate: AppGate = {
  route: 'home',
  userId: 'u1',
  failed: false,
  error: null,
  retry: () => {},
};
jest.mock('../src/features/auth/useAppGate', () => ({
  ...jest.requireActual('../src/features/auth/useAppGate'),
  useAppGate: () => mockGate,
}));

// Route map mirrors apps/mobile/app for the S1 shell (DESIGN_SYSTEM §10, D1).
const routes = {
  _layout: RootLayout,
  index: Index,
  '(auth)/welcome': WelcomeRoute,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/discover/_layout': DiscoverLayout,
  '(tabs)/discover/index': DiscoverScreen,
  '(tabs)/sell/_layout': SellLayout,
  '(tabs)/sell/index': SellScreen,
  '(tabs)/inbox/_layout': InboxLayout,
  '(tabs)/inbox/index': InboxScreen,
  '(tabs)/profile/_layout': ProfileLayout,
  '(tabs)/profile/index': ProfileScreen,
};

describe('P4-AUTH-03 Launch routes by the gate', () => {
  afterEach(() => {
    mockGate.route = 'home';
    mockGate.failed = false;
  });

  it('signed out opens Welcome', async () => {
    mockGate.route = 'welcome';
    const router = renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
    expect(router.getPathname()).toBe('/welcome');
    expect(screen.getByRole('header', { name: welcome.title })).toBeTruthy();
  });

  it('stays on the launch view while the gate is deciding', async () => {
    mockGate.route = null;
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-launch')).toBeTruthy();
  });

  it('shows a retry when the profile could not load', async () => {
    mockGate.route = null;
    mockGate.failed = true;
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-launch-error')).toBeTruthy();
  });
});

describe('P1-SETUP-02 tab shell (R1.0 tabs: Discover, Sell, Inbox, Profile)', () => {
  it('opens on Discover from the root URL for a ready student', async () => {
    const router = renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-discover')).toBeTruthy();
    expect(router.getPathname()).toBe('/discover');
  });

  it('shows exactly the four R1.0 tabs, in order, with accessible labels', async () => {
    renderRouter(routes, { initialUrl: '/discover' });
    await screen.findByTestId('screen-discover');
    const r10Tabs = [tabs.discover, tabs.sell, tabs.inbox, tabs.profile];
    const labels = screen
      .getAllByRole('tab')
      .map((b) => b.props.accessibilityLabel as string | undefined)
      .filter((l): l is string => !!l && (r10Tabs as string[]).includes(l));
    expect(labels).toEqual(r10Tabs);
    expect(screen.getByRole('tab', { name: tabs.discover, selected: true })).toBeTruthy();
    expect(screen.getByTestId('tab-bar').props.accessibilityRole).toBe('tablist');
  });

  it('P2-CMP-09 switches tabs from the tab bar', async () => {
    const router = renderRouter(routes, { initialUrl: '/discover' });
    await screen.findByTestId('screen-discover');
    fireEvent.press(screen.getByRole('tab', { name: tabs.inbox }));
    expect(await screen.findByTestId('screen-inbox')).toBeTruthy();
    expect(router.getPathname()).toBe('/inbox');
    expect(screen.getByRole('tab', { name: tabs.inbox, selected: true })).toBeTruthy();
  });

  it.each([
    ['/sell', 'screen-sell'],
    ['/inbox', 'screen-inbox'],
    ['/profile', 'screen-profile'],
  ])('renders %s', async (url, testID) => {
    renderRouter(routes, { initialUrl: url });
    expect(await screen.findByTestId(testID)).toBeTruthy();
  });
});
