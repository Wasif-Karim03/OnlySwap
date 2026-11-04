import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import TabsLayout from '../app/(tabs)/_layout';
import DiscoverLayout from '../app/(tabs)/discover/_layout';
import ProfileLayout from '../app/(tabs)/profile/_layout';
import SellLayout from '../app/(tabs)/sell/_layout';
import { isFormRoute } from '../src/lib/tabBarVisibility';

describe('QA-M1 tab bar hides in pushed form flows', () => {
  it('lists the form routes per tab', () => {
    expect(isFormRoute('sell', 'details')).toBe(true);
    expect(isFormRoute('sell', 'meetup')).toBe(true);
    expect(isFormRoute('profile', 'edit')).toBe(true);
    expect(isFormRoute('sell', undefined)).toBe(false);
    expect(isFormRoute('sell', 'index')).toBe(false);
    expect(isFormRoute('profile', 'listings')).toBe(false);
    expect(isFormRoute('feed', 'edit')).toBe(false);
    expect(isFormRoute(undefined, 'edit')).toBe(false);
  });

  const page = (label: string) =>
    function Page() {
      return <Text>{label}</Text>;
    };
  const routes = {
    '(tabs)/_layout': TabsLayout,
    '(tabs)/discover/_layout': DiscoverLayout,
    '(tabs)/discover/index': page('discover'),
    '(tabs)/sell/_layout': SellLayout,
    '(tabs)/sell/index': page('sell photos'),
    '(tabs)/sell/details': page('sell details'),
    '(tabs)/profile/_layout': ProfileLayout,
    '(tabs)/profile/index': page('profile'),
    '(tabs)/profile/edit': page('edit profile'),
  };

  // The tabs prefetch Profile and Inbox; nothing here waits on that data.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}
    >
      {children}
    </QueryClientProvider>
  );

  it('keeps the bar on a tab root', async () => {
    renderRouter(routes, { initialUrl: '/sell', wrapper });
    expect(await screen.findByText('sell photos')).toBeTruthy();
    expect(screen.getByTestId('tab-bar')).toBeTruthy();
  });

  it.each([
    ['/sell/details', 'sell details'],
    ['/profile/edit', 'edit profile'],
  ])('hides the bar when a deep link opens %s first', async (url, text) => {
    renderRouter(routes, { initialUrl: url, wrapper });
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
  });
});
