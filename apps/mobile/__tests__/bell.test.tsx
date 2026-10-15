import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import { NotificationBell } from '../src/features/notifications/NotificationBell';
import type { RealtimeSource } from '../src/lib/realtime';

// DEC 122: the bell's count updates live from user:{uid} pings, and the app
// icon's number follows it.
describe('T-UNIT-BELL-01 live unread count', () => {
  function setup() {
    const handlers = new Map<string, () => void>();
    const realtime: RealtimeSource = {
      userId: async () => 'me',
      subscribe: (topic, event, onEvent) => {
        handlers.set(`${topic}/${event}`, onEvent as () => void);
        return () => handlers.delete(`${topic}/${event}`);
      },
    };
    let unread = 2;
    const fetch = jest.fn(async () => unread);
    const badge = jest.fn(async () => {});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderRouter(
      {
        index: () => (
          <NotificationBell
            accessibilityLabel="Notifications"
            fetch={fetch}
            realtime={realtime}
            badge={badge}
            testID="bell"
          />
        ),
      },
      { initialUrl: '/', wrapper },
    );
    return { handlers, fetch, badge, setUnread: (n: number) => (unread = n) };
  }

  it('refetches on a bell or inbox ping and sets the app icon number', async () => {
    const { handlers, fetch, badge, setUnread } = setup();
    expect(await screen.findByText('2', { includeHiddenElements: true })).toBeTruthy();
    expect(badge).toHaveBeenLastCalledWith(2);
    await waitFor(() => expect(handlers.has('user:me/bell')).toBe(true));
    expect(handlers.has('user:me/inbox')).toBe(true);

    setUnread(3);
    const calls = fetch.mock.calls.length;
    act(() => {
      handlers.get('user:me/bell')!();
      handlers.get('user:me/inbox')!();
    });
    expect(await screen.findByText('3', { includeHiddenElements: true })).toBeTruthy();
    // A burst of pings is one refetch.
    expect(fetch.mock.calls.length).toBe(calls + 1);
    expect(badge).toHaveBeenLastCalledWith(3);
  });
});
