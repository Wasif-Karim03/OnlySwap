import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { AuthApi } from '../src/features/auth/api';
import type { AppConfig, GateProfile } from '../src/features/auth/logic';
import { CONFIG_WAIT_MS, useAppGate } from '../src/features/auth/useAppGate';
import { useSession, type SessionSource } from '../src/features/auth/useSession';

const config: AppConfig = {
  maintenance: { enabled: false, until: null },
  minVersionIos: '1.0.0',
  minVersionAndroid: '1.0.0',
  rulesVersion: '1',
  rulesChanges: [],
  chatPhotosEnabled: false,
};
const profile: GateProfile = {
  status: 'active',
  firstName: 'Aisha',
  adultConfirmed: true,
  rulesVersion: '1',
};
const session = { user: { id: 'u1' } } as unknown as Session;

function fakeSource(initial: Session | null) {
  let listener: ((e: never, s: Session | null) => void) | undefined;
  const source: SessionSource = {
    getSession: async () => ({ data: { session: initial } }),
    onAuthStateChange: (cb) => {
      listener = cb as typeof listener;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    },
  };
  return { source, emit: (s: Session | null) => listener?.('SIGNED_IN' as never, s) };
}

function fakeApi(over: Partial<Record<'config' | 'profile', () => Promise<unknown>>> = {}) {
  return {
    getAppConfig: jest.fn(over.config ?? (async () => config)),
    getGateProfile: jest.fn(over.profile ?? (async () => profile)),
  } as unknown as AuthApi;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSession', () => {
  it('restores the stored session, then follows auth events', async () => {
    const { source, emit } = fakeSource(null);
    const { result } = renderHook(() => useSession(source));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    act(() => emit(session));
    expect(result.current.status).toBe('signedIn');
  });
});

describe('useAppGate (A01)', () => {
  it('signed out opens Welcome', async () => {
    const { source } = fakeSource(null);
    const { result } = renderHook(
      () =>
        useAppGate({
          api: fakeApi(),
          sessionSource: source,
          appVersion: '1.0.0',
          notificationsAsked: () => true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.route).toBe('welcome'));
  });

  it('a ready student opens the app', async () => {
    const { source } = fakeSource(session);
    const api = fakeApi();
    const { result } = renderHook(
      () =>
        useAppGate({
          api,
          sessionSource: source,
          appVersion: '1.0.0',
          notificationsAsked: () => true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.route).toBe('home'));
    expect(api.getGateProfile).toHaveBeenCalledWith('u1');
  });

  it('does not wait forever for the config (splash budget)', async () => {
    jest.useFakeTimers();
    const { source } = fakeSource(null);
    const api = fakeApi({ config: () => new Promise(() => {}) });
    const { result } = renderHook(
      () =>
        useAppGate({
          api,
          sessionSource: source,
          appVersion: '1.0.0',
          notificationsAsked: () => true,
        }),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.route).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(CONFIG_WAIT_MS);
    });
    expect(result.current.route).toBe('welcome');
    jest.useRealTimers();
  });

  it('a failed profile load asks for a retry instead of guessing', async () => {
    const { source } = fakeSource(session);
    const api = fakeApi({
      profile: async () => Promise.reject(new TypeError('Network request failed')),
    });
    const { result } = renderHook(
      () =>
        useAppGate({
          api,
          sessionSource: source,
          appVersion: '1.0.0',
          notificationsAsked: () => true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.route).toBeNull();
  });
});
