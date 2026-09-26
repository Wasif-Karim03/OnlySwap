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
import Index from '../app/index';
import { tabs } from '../src/strings/en';

// Route map mirrors apps/mobile/app for the S1 shell (DESIGN_SYSTEM §10, D1).
const routes = {
  _layout: RootLayout,
  index: Index,
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

describe('P1-SETUP-02 tab shell (R1.0 tabs: Discover, Sell, Inbox, Profile)', () => {
  it('opens on Discover from the root URL', async () => {
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
