import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import {
  clockLabel,
  daySection,
  QUIET_TIMES,
  type NotificationsApi,
} from '../src/features/notifications/api';
import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import { NotificationsScreen } from '../src/features/notifications/NotificationsScreen';
import { notificationsScreen } from '../src/strings/en';

const NOW = new Date(2027, 2, 10, 12, 0);

describe('notification helpers', () => {
  it('groups by day', () => {
    expect(daySection(new Date(2027, 2, 10, 8).toISOString(), NOW)).toBe('today');
    expect(daySection(new Date(2027, 2, 9, 23).toISOString(), NOW)).toBe('yesterday');
    expect(daySection(new Date(2027, 2, 1).toISOString(), NOW)).toBe('earlier');
  });
  it('quiet-hour options and labels', () => {
    expect(QUIET_TIMES).toHaveLength(48);
    expect(clockLabel('23:00')).toBe('11:00 PM');
    expect(clockLabel('08:30')).toBe('8:30 AM');
  });
});

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
      'offer/[id]': () => <Stub id="screen-offer" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

const prefs = {
  offers: true,
  messages: true,
  meetups: true,
  saved_search: true,
  price_drop: true,
  tips: false,
  message_previews: false,
  quiet_start: '23:00',
  quiet_end: '08:00',
};

function api(over: Partial<NotificationsApi> = {}): NotificationsApi {
  return {
    list: jest.fn(async () => ({
      items: [
        {
          id: 2,
          type: 'offer_new',
          grp: 'offers',
          title: 'New offer',
          body: 'Ben offered $35',
          data: { offer_id: 'o1' },
          read: false,
          created_at: new Date(2027, 2, 10, 9).toISOString(),
        },
        {
          id: 1,
          type: 'price_drop',
          grp: 'alerts',
          title: 'Price drop',
          body: 'Lamp is $10',
          data: {},
          read: true,
          created_at: new Date(2027, 2, 1).toISOString(),
        },
      ],
      unread: 1,
    })),
    markRead: jest.fn(async () => {}),
    prefs: jest.fn(async () => prefs),
    updatePrefs: jest.fn(async (p) => ({ ...prefs, ...p })),
    ...over,
  };
}

describe('F09 Notifications', () => {
  it('lists by day, sets the badge, opens and marks read', async () => {
    const a = api();
    const badge = jest.fn(async () => {});
    render(
      { notifications: () => <NotificationsScreen api={a} now={() => NOW} badge={badge} /> },
      '/notifications',
    );
    expect(await screen.findByText(notificationsScreen.today)).toBeTruthy();
    expect(screen.getByText(notificationsScreen.earlier)).toBeTruthy();
    await waitFor(() => expect(badge).toHaveBeenCalledWith(1));
    fireEvent.press(screen.getByTestId('notification-2'));
    await waitFor(() => expect(a.markRead).toHaveBeenCalledWith([2]));
    expect(await screen.findByTestId('screen-offer')).toBeTruthy();
  });

  it('mark all read', async () => {
    const a = api();
    render(
      {
        notifications: () => (
          <NotificationsScreen api={a} now={() => NOW} badge={jest.fn(async () => {})} />
        ),
      },
      '/notifications',
    );
    fireEvent.press(await screen.findByTestId('notifications-mark-all'));
    await waitFor(() => expect(a.markRead).toHaveBeenCalledWith(null));
  });

  it('empty (X36)', async () => {
    render(
      {
        notifications: () => (
          <NotificationsScreen
            api={api({ list: jest.fn(async () => ({ items: [], unread: 0 })) })}
            badge={jest.fn(async () => {})}
          />
        ),
      },
      '/notifications',
    );
    expect(await screen.findByTestId('notifications-empty')).toBeTruthy();
  });
});

describe('F11 Notification settings', () => {
  const osOn = { get: jest.fn(async () => ({ status: 'granted' }) as never), request: jest.fn() };
  const osOff = {
    get: jest.fn(async () => ({ status: 'denied', canAskAgain: false }) as never),
    request: jest.fn(),
  };

  it('tips are opt-in; toggles save', async () => {
    const a = api();
    render(
      { 'settings/notifications': () => <NotificationSettingsScreen api={a} os={osOn} /> },
      '/settings/notifications',
    );
    const tips = await screen.findByRole('switch', { name: notificationsScreen.tips });
    expect(tips.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(tips);
    await waitFor(() => expect(a.updatePrefs).toHaveBeenCalledWith({ tips: true }));
    expect(screen.queryByTestId('notifications-os-off')).toBeNull();
  });

  it('quiet hours', async () => {
    const a = api();
    render(
      { 'settings/notifications': () => <NotificationSettingsScreen api={a} os={osOn} /> },
      '/settings/notifications',
    );
    fireEvent.press(await screen.findByTestId('quiet-start'));
    fireEvent.press(screen.getByText('10:00 PM'));
    await waitFor(() => expect(a.updatePrefs).toHaveBeenCalledWith({ quiet_start: '22:00' }));
  });

  it('OS notifications off: banner with Settings', async () => {
    const openSettings = jest.fn(async () => {});
    render(
      {
        'settings/notifications': () => (
          <NotificationSettingsScreen api={api()} os={osOff} openSettings={openSettings} />
        ),
      },
      '/settings/notifications',
    );
    expect(await screen.findByTestId('notifications-os-off')).toBeTruthy();
    fireEvent.press(screen.getByText(notificationsScreen.openSettings));
    expect(openSettings).toHaveBeenCalled();
  });
});
