import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import LegalRoute from '../app/legal/[doc]';
import type { ListingResult } from '../src/features/feed/logic';
import { listingTab, type Me, type MeApi, type MyListing } from '../src/features/me/api';
import {
  EditListingScreen,
  EditProfileScreen,
  ListingStatsScreen,
  MyListingsScreen,
  ProfileTabScreen,
  RelistScreen,
} from '../src/features/me/MeScreens';
import {
  AboutScreen,
  AppearanceScreen,
  ChangeSchoolScreen,
  PrivacyScreen,
  SettingsScreen,
} from '../src/features/me/SettingsScreens';
import { me as meCopy, settings } from '../src/strings/en';
import { useThemeModeStore } from '../src/theme/mode';

const ME: Me = {
  id: 'u1',
  first_name: 'Aisha',
  last_initial: 'A',
  display_name: 'Aisha A.',
  year: 'junior',
  bio: null,
  avatar_path: null,
  status: 'active',
  verified_until: '2027-09-01',
  created_at: '2026-09-01',
  founding_seller: true,
  campus: {
    id: 'c',
    name: 'The Ohio State University',
    short_name: 'Ohio State',
    timezone: 'America/New_York',
  },
  analytics_opt_in: true,
  crash_reports_opt_in: true,
  theme_mode: 'system',
  counts: { active: 0, sold: 2, saved: 3, swaps: 2, thumbs_up: 2, thumbs_total: 2 },
};

const listing = (id: string, status: string, patch: Partial<MyListing> = {}): MyListing =>
  ({
    id,
    status,
    kind: 'sale',
    title: `Item ${id}`,
    price_cents: 1500,
    photos: [],
    can_relist: false,
    ...patch,
  }) as unknown as MyListing;

function api(over: Partial<MeApi> = {}): MeApi {
  return {
    me: jest.fn(async () => ME),
    listings: jest.fn(async () => [
      listing('a', 'active'),
      listing('b', 'sold'),
      listing('c', 'expired', { can_relist: true }),
    ]),
    stats: jest.fn(async () => ({
      views: 12,
      saves: 3,
      offers: 2,
      open_offers: 1,
      best_offer_cents: 1300,
      created_at: '2027-03-01',
      bumped_at: '2027-03-01',
      expires_at: null,
      price_changes: [{ old: 2000, new: 1500, at: '2027-03-05' }],
    })),
    updateProfile: jest.fn(async () => {}),
    updateFlags: jest.fn(async () => {}),
    updateListing: jest.fn(async () => {}),
    deleteListing: jest.fn(async () => {}),
    relist: jest.fn(async () => {}),
    ...over,
  };
}

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}
function render(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      sell: () => <Stub id="screen-sell" />,
      welcome: () => <Stub id="screen-welcome" />,
      'profile/listings': () => <Stub id="screen-listings-stub" />,
      'listing/[id]/stats': () => <Stub id="screen-stats-stub" />,
      'listing/[id]/relist': () => <Stub id="screen-relist-stub" />,
      'settings/privacy': () => <Stub id="screen-privacy-stub" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

describe('F01-F08 profile', () => {
  it('tabs', () => {
    expect(listingTab('hold')).toBe('active');
    expect(listingTab('sold')).toBe('sold');
    expect(listingTab('held_review')).toBe('other');
  });

  it('F01: header, counts, sell nudge with no active listings, menu', async () => {
    render(
      { profile: () => <ProfileTabScreen api={api()} mediaBase={() => 'http://m'} /> },
      '/profile',
    );
    expect(await screen.findByText('Aisha A.')).toBeTruthy();
    expect(screen.getByText('Verified at Ohio State')).toBeTruthy();
    expect(screen.getByTestId('profile-sell-nudge')).toBeTruthy();
    fireEvent.press(screen.getByText(meCopy.myListings));
    expect(await screen.findByTestId('screen-listings-stub')).toBeTruthy();
  });

  it('F02: edits the name and year', async () => {
    const a = api();
    render(
      {
        'profile/edit': () => (
          <EditProfileScreen
            api={a}
            avatar={{ pick: jest.fn(async () => null), upload: jest.fn() }}
          />
        ),
      },
      '/profile/edit',
    );
    fireEvent.changeText(await screen.findByTestId('edit-first'), 'Aish');
    fireEvent.press(screen.getByText('Senior'));
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() =>
      expect(a.updateProfile).toHaveBeenCalledWith({
        firstName: 'Aish',
        lastInitial: 'A',
        year: 'senior',
        bio: null,
        avatarPath: null,
      }),
    );
  });

  it('F03: tabs by status; relist from Other', async () => {
    render(
      { 'profile/listings': () => <MyListingsScreen api={api()} mediaBase={() => 'http://m'} /> },
      '/profile/listings',
    );
    expect(await screen.findByTestId('my-listing-a')).toBeTruthy();
    expect(screen.queryByTestId('my-listing-b')).toBeNull();
    fireEvent.press(screen.getByText(meCopy.tabs.other));
    fireEvent.press(await screen.findByTestId('relist-c'));
    expect(await screen.findByTestId('screen-relist-stub')).toBeTruthy();
  });

  it('F04: stats with price history', async () => {
    render(
      { 'listing/[id]/stats': () => <ListingStatsScreen id="a" api={api()} /> },
      '/listing/a/stats',
    );
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText(/\$20 → \$15/)).toBeTruthy();
  });

  it('F06: edits the price and deletes', async () => {
    const a = api();
    const listings = {
      getListing: jest.fn(
        async () =>
          ({
            ...listing('a', 'active'),
            description: '',
            open_to_offers: true,
            access: 'owner',
          }) as unknown as ListingResult,
      ),
    };
    render(
      { 'listing/[id]/edit': () => <EditListingScreen id="a" api={a} listings={listings} /> },
      '/listing/a/edit',
    );
    fireEvent.changeText(await screen.findByTestId('edit-price'), '12');
    fireEvent.press(screen.getByTestId('edit-listing-save'));
    await waitFor(() =>
      expect(a.updateListing).toHaveBeenCalledWith('a', {
        title: 'Item a',
        description: '',
        price_cents: 1200,
        open_to_offers: true,
      }),
    );
  });

  it('F08: relist with a new price', async () => {
    const a = api();
    render({ 'listing/[id]/relist': () => <RelistScreen id="c" api={a} /> }, '/listing/c/relist');
    fireEvent.changeText(await screen.findByTestId('relist-price'), '10');
    fireEvent.press(screen.getByTestId('relist-button'));
    await waitFor(() => expect(a.relist).toHaveBeenCalledWith('c', 1000));
  });
});

describe('F10-F18 settings', () => {
  it('F10: sign out of all devices asks first', async () => {
    const signOut = jest.fn(async () => {});
    render(
      {
        settings: () => (
          <SettingsScreen auth={{ signOut }} beforeSignOut={jest.fn(async () => {})} />
        ),
      },
      '/settings',
    );
    fireEvent.press(await screen.findByText(settings.signOutAll));
    fireEvent.press(await screen.findByText(settings.signOutAllConfirm));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith('global'));
    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
  });

  it('F12: privacy toggles', async () => {
    const a = api();
    render({ 'settings/privacy': () => <PrivacyScreen api={a} /> }, '/settings/privacy');
    fireEvent.press(await screen.findByRole('switch', { name: settings.analytics }));
    await waitFor(() => expect(a.updateFlags).toHaveBeenCalledWith({ analytics_opt_in: false }));
  });

  it('F14: appearance', async () => {
    const a = api();
    render({ 'settings/appearance': () => <AppearanceScreen api={a} /> }, '/settings/appearance');
    fireEvent.press(await screen.findByText(settings.modes.dark));
    expect(useThemeModeStore.getState().mode).toBe('dark');
    expect(a.updateFlags).toHaveBeenCalledWith({ theme_mode: 'dark' });
    useThemeModeStore.getState().setMode('system');
  });

  it('F15: change school only to an .edu address', async () => {
    const updateEmail = jest.fn(async () => {});
    render(
      { 'settings/school': () => <ChangeSchoolScreen updateEmail={updateEmail} /> },
      '/settings/school',
    );
    fireEvent.changeText(await screen.findByTestId('school-email'), 'me@gmail.com');
    expect(screen.getByTestId('school-send').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.changeText(screen.getByTestId('school-email'), 'Me@Umich.edu');
    fireEvent.press(screen.getByTestId('school-send'));
    await waitFor(() => expect(updateEmail).toHaveBeenCalledWith('me@umich.edu'));
  });

  it('F18: about shows licenses', async () => {
    render(
      {
        'settings/about': () => <AboutScreen />,
        'legal/[doc]': () => <LegalRoute />,
      },
      '/settings/about',
    );
    fireEvent.press(await screen.findByText(settings.licenses));
    expect(screen.getByTestId('about-licenses')).toBeTruthy();
    // P14-LEGAL-01: the terms open from the bundled copy, offline.
    fireEvent.press(screen.getByText(settings.terms));
    expect(await screen.findByTestId('screen-legal-terms')).toBeTruthy();
    expect(screen.getByText('Version 2026-10')).toBeTruthy();
  });
});
