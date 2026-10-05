import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { useToastStore } from '../src/components/Toast';
import { createAuthApi, type AuthClient } from '../src/features/auth/api';
import {
  computeGate,
  GATE_HREF,
  shouldShowUnlocked,
  type GateInput,
} from '../src/features/auth/logic';
import type { WaitlistApi, WaitlistInfo } from '../src/features/waitlist/api';
import {
  invitedText,
  inviteLink,
  peopleLeft,
  positionText,
  progressOf,
  shareMessage,
  waitlistNext,
} from '../src/features/waitlist/logic';
import { UnlockedScreen } from '../src/features/waitlist/UnlockedScreen';
import { WaitlistScreen } from '../src/features/waitlist/WaitlistScreen';
import { unlocked, waitlist } from '../src/strings/en';

const SITE = 'https://onlyswap.pages.dev';

function info(over: Partial<WaitlistInfo> = {}): WaitlistInfo {
  return {
    position: 488,
    members: 488,
    threshold: 500,
    campus: {
      id: 'c1',
      name: 'The Ohio State University',
      short_name: 'Ohio State',
      slug: 'osu',
      status: 'waitlist',
      unlocked_at: null,
    },
    invite_code: 'WASIF7',
    invited: 3,
    seen_unlock_at: null,
    show_unlocked: false,
    ...over,
  };
}

function fakeApi(over: Partial<WaitlistApi> = {}): WaitlistApi {
  return {
    position: jest.fn(async () => info()),
    markUnlockSeen: jest.fn(async () => {}),
    ...over,
  };
}

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      welcome: () => <Stub id="screen-welcome" />,
      discover: () => <Stub id="screen-discover" />,
      sell: () => <Stub id="screen-sell" />,
      'allow-notifications': () => <Stub id="screen-allow" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => useToastStore.getState().dismiss());
});

// ---------------------------------------------------------------------------------------------
describe('P4-AUTH-12 waitlist rules', () => {
  it('invite link on the site', () => {
    expect(inviteLink(SITE, 'WASIF7')).toBe('https://onlyswap.pages.dev/i/WASIF7');
    expect(inviteLink(`${SITE}/`, 'AB CD')).toBe('https://onlyswap.pages.dev/i/AB%20CD');
  });

  it('progress, people left and your place', () => {
    expect(peopleLeft(info())).toBe(12);
    expect(peopleLeft(info({ members: 510 }))).toBe(0);
    expect(progressOf(info())).toBeCloseTo(0.976);
    expect(progressOf(info({ members: 600 }))).toBe(1);
    expect(progressOf(info({ threshold: 0 }))).toBe(1);
    expect(positionText(info())).toBe(
      "You're number 488. Once 12 more people join, it opens for everyone.",
    );
    expect(positionText(info({ members: 499 }))).toBe(
      "You're number 488. Once 1 more person joins, it opens for everyone.",
    );
    expect(positionText(info({ members: 500 }))).toBe(waitlist.almost);
    expect(positionText(info({ position: null }))).toBe(
      'Once 12 more people join, it opens for everyone.',
    );
  });

  it('invited count and the share message', () => {
    expect(invitedText(0)).toBe(waitlist.invitedNone);
    expect(invitedText(1)).toBe(waitlist.invitedOne);
    expect(invitedText(4)).toBe('4 people joined with your link.');
    expect(shareMessage(info(), 'L')).toContain('Ohio State');
    expect(shareMessage(info({ campus: null }), 'L')).toContain('L');
  });

  it('what to do with fresh data', () => {
    expect(waitlistNext(info())).toBe('wait');
    expect(waitlistNext(info({ show_unlocked: true }))).toBe('unlocked');
    const live = { ...info().campus!, status: 'live' as const };
    expect(waitlistNext(info({ campus: live, position: null }))).toBe('gate');
    // Still waiting on a live campus (mid-flip): stay, so the gate can't bounce back here.
    expect(waitlistNext(info({ campus: live }))).toBe('wait');
  });
});

// ---------------------------------------------------------------------------------------------
describe('A09 Waitlist screen', () => {
  const open = (api: WaitlistApi, extra: Partial<Parameters<typeof WaitlistScreen>[0]> = {}) =>
    renderAt(
      {
        waitlist: () => (
          <WaitlistScreen
            api={api}
            auth={{ signOut: jest.fn(async () => {}) }}
            site={() => SITE}
            notificationsAsked={() => true}
            registerPush={jest.fn(async () => null)}
            {...extra}
          />
        ),
        unlocked: () => <Stub id="screen-unlocked" />,
      },
      '/waitlist',
    );

  it('shows the count, your place, the link and how many joined with it', async () => {
    open(fakeApi());
    expect(await screen.findByText('Ohio State opens at 500 students')).toBeTruthy();
    expect(screen.getByTestId('waitlist-count').props.children).toBe('488 / 500');
    expect(screen.getByTestId('waitlist-progress').props.accessibilityLabel).toBe(
      '488 of 500 students joined',
    );
    expect(screen.getByTestId('waitlist-position').props.children).toContain('number 488');
    expect(screen.getByTestId('waitlist-link').props.children).toBe(`${SITE}/i/WASIF7`);
    expect(screen.getByText('3 people joined with your link.')).toBeTruthy();
    expect(screen.getByTestId('waitlist-tour')).toBeTruthy();
    expect(screen.getByText(waitlist.nextTitle)).toBeTruthy();
  });

  it('Copy puts the link on the clipboard', async () => {
    const copyText = jest.fn(async () => true);
    open(fakeApi(), { copyText });
    fireEvent.press(await screen.findByTestId('waitlist-copy'));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith(`${SITE}/i/WASIF7`));
    await waitFor(() => expect(useToastStore.getState().current?.message).toBe(waitlist.copied));
  });

  it('Share opens the share sheet with the link', async () => {
    const share = jest.fn(async () => ({}));
    open(fakeApi(), { share });
    fireEvent.press(await screen.findByTestId('waitlist-share'));
    expect(share).toHaveBeenCalledWith({
      message: `Join me on OnlySwap, the marketplace just for Ohio State students. ${SITE}/i/WASIF7`,
      url: `${SITE}/i/WASIF7`,
    });
  });

  it('registers for push, and offers notifications when not asked yet', async () => {
    const registerPush = jest.fn(async () => null);
    open(fakeApi(), { registerPush, notificationsAsked: () => false });
    fireEvent.press(await screen.findByTestId('waitlist-notify'));
    expect(await screen.findByTestId('screen-allow')).toBeTruthy();
    expect(registerPush).toHaveBeenCalled();
  });

  it('switches to the open screen once the campus opens', async () => {
    open(fakeApi({ position: jest.fn(async () => info({ show_unlocked: true, position: null })) }));
    expect(await screen.findByTestId('screen-unlocked')).toBeTruthy();
  });

  it('refreshes every minute', async () => {
    const position = jest
      .fn()
      .mockResolvedValueOnce(info())
      .mockResolvedValue(info({ members: 495 }));
    open(fakeApi({ position }));
    await screen.findByText('488 / 500');
    await act(async () => {
      jest.advanceTimersByTime(61_000);
    });
    expect(await screen.findByText('495 / 500')).toBeTruthy();
  });

  it('error with retry', async () => {
    const position = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(info());
    open(fakeApi({ position }));
    expect(await screen.findByTestId('waitlist-error')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByTestId('waitlist-invite')).toBeTruthy();
  });

  it('sign out', async () => {
    const signOut = jest.fn(async () => {});
    open(fakeApi(), { auth: { signOut } });
    fireEvent.press(await screen.findByTestId('waitlist-sign-out'));
    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
    expect(signOut).toHaveBeenCalledWith('local');
  });
});

// ---------------------------------------------------------------------------------------------
describe('A10 Campus open, shown once', () => {
  const open = (api: WaitlistApi) =>
    renderAt({ unlocked: () => <UnlockedScreen api={api} /> }, '/unlocked');

  it('marks it seen once and leads into the app', async () => {
    const api = fakeApi({
      position: jest.fn(async () =>
        info({ position: null, campus: { ...info().campus!, status: 'live' } }),
      ),
    });
    open(api);
    expect(await screen.findByText(unlocked.title)).toBeTruthy();
    expect(await screen.findByText(/Ohio State reached 500 students/)).toBeTruthy();
    await waitFor(() => expect(api.markUnlockSeen).toHaveBeenCalledTimes(1));
    // Re-renders (the campus query arriving, the fade) don't mark it again.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(api.markUnlockSeen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('unlocked-confetti', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('unlocked-list'));
    expect(await screen.findByTestId('screen-sell')).toBeTruthy();
  });

  it('Start swiping goes to Discover', async () => {
    open(fakeApi());
    fireEvent.press(await screen.findByTestId('unlocked-start'));
    expect(await screen.findByTestId('screen-discover')).toBeTruthy();
  });

  it('reduce motion: no confetti, the screen just fades in', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    open(fakeApi());
    await screen.findByText(unlocked.title);
    await waitFor(() =>
      expect(screen.queryByTestId('unlocked-confetti', { includeHiddenElements: true })).toBeNull(),
    );
  });

  it('a failed mark is quiet (the gate shows it again next launch)', async () => {
    const api = fakeApi({ markUnlockSeen: jest.fn(async () => Promise.reject(new Error('x'))) });
    open(api);
    expect(await screen.findByTestId('screen-unlocked')).toBeTruthy();
    await waitFor(() => expect(api.markUnlockSeen).toHaveBeenCalled());
  });
});

describe('P4-AUTH-13 launch gate shows A10 once', () => {
  const base: GateInput = {
    config: null,
    appVersion: '1.0.0',
    platform: 'ios',
    session: 'signedIn',
    profile: {
      status: 'active',
      firstName: 'Aisha',
      adultConfirmed: true,
      rulesVersion: '1',
    },
    notificationsAsked: true,
  };
  const withProfile = (over: Partial<NonNullable<GateInput['profile']>>): GateInput => ({
    ...base,
    profile: { ...base.profile!, ...over },
  });

  it('routes to /unlocked only while it is unseen', () => {
    expect(GATE_HREF.unlocked).toBe('/unlocked');
    expect(computeGate(withProfile({ showUnlocked: true }))).toBe('unlocked');
    expect(computeGate(withProfile({ showUnlocked: false }))).toBe('home');
    expect(computeGate(withProfile({}))).toBe('home');
    expect(computeGate(withProfile({ status: 'waitlist', showUnlocked: true }))).toBe('waitlist');
    // Before the notifications primer, so the first thing after the wait is the good news.
    expect(computeGate({ ...withProfile({ showUnlocked: true }), notificationsAsked: false })).toBe(
      'unlocked',
    );
  });

  it('same rule as show_unlocked: opened after you joined and not seen', () => {
    const campus = { status: 'live', unlocked_at: '2026-10-01T00:00:00Z' };
    expect(shouldShowUnlocked({ created_at: '2026-09-01T00:00:00Z', campus })).toBe(true);
    expect(
      shouldShowUnlocked({
        created_at: '2026-09-01T00:00:00Z',
        seen_unlock_at: '2026-10-01T01:00:00Z',
        campus,
      }),
    ).toBe(false);
    expect(shouldShowUnlocked({ created_at: '2026-10-02T00:00:00Z', campus })).toBe(false);
    expect(
      shouldShowUnlocked({
        created_at: '2026-09-01T00:00:00Z',
        campus: { status: 'waitlist', unlocked_at: null },
      }),
    ).toBe(false);
    expect(shouldShowUnlocked({ created_at: '2026-09-01T00:00:00Z', campus: null })).toBe(false);
  });

  it('the gate profile reads it from the row and its campus', async () => {
    const profile = jest.fn(async () => ({
      data: {
        status: 'active' as const,
        first_name: 'Aisha',
        adult_confirmed_at: '2026-09-01T00:00:00Z',
        rules_version: '1',
        created_at: '2026-09-01T00:00:00Z',
        seen_unlock_at: null,
        campuses: { status: 'live', unlocked_at: '2026-10-01T00:00:00Z' },
      },
      error: null,
    }));
    const api = createAuthApi({
      auth: () => ({}) as unknown as AuthClient,
      rpc: () => ({ rpc: jest.fn() }) as never,
      profile,
    });
    await expect(api.getGateProfile('u1')).resolves.toMatchObject({ showUnlocked: true });
  });
});
