import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { LinkErrorScreen, UpdateScreen } from '../src/features/system/SystemScreens';
import { redirectSystemPath } from '../app/+native-intent';
import {
  clearInviteCode,
  INVITE_KEEP_MS,
  pendingInviteCode,
  rememberInviteCode,
  sendCodeWithInvite,
  type InviteStorage,
} from '../src/features/auth/invite';
import { inviteCodeFromLink, rewriteDeepLink } from '../src/lib/deeplinks';
import { system } from '../src/strings/en';

const ID = '00000000-0000-4000-8000-000000000001';

describe('P11-STATE-02 deep links', () => {
  it.each([
    [`https://onlyswap.pages.dev/l/${ID}`, `/listing/${ID}`],
    [`/l/${ID}`, `/listing/${ID}`],
    [`/l/${ID}/`, `/listing/${ID}`],
    ['/l/not-an-id', '/link-error'],
    ['https://onlyswap.pages.dev/m/abc123', '/inbox'],
    [`onlyswap://listing/${ID}`, `/listing/${ID}`],
    ['/chat/c1', '/chat/c1'],
    ['', '/'],
    // R11-INVITE-01: invites open the launch gate (Welcome signed out, home signed in).
    ['https://onlyswap.pages.dev/i/ABCD2345', '/'],
    ['onlyswap://i/abcd2345', '/'],
    ['/i/ABCD2345/', '/'],
    ['/i/', '/'],
  ])('%s → %s', (input, out) => {
    expect(rewriteDeepLink(input)).toBe(out);
  });
});

describe('R11-INVITE-01 invite links', () => {
  afterEach(() => clearInviteCode());

  it.each([
    ['https://onlyswap.pages.dev/i/ABCD2345', 'ABCD2345'],
    ['https://onlyswap.pages.dev/i/abcd2345?utm_source=share', 'ABCD2345'],
    ['onlyswap://i/Abcd2345', 'ABCD2345'],
    ['/i/ABCD2345/', 'ABCD2345'],
    ['/i/AB', null],
    ['/i/AB-CD-EF', null],
    ['/i/ABCD2345/extra', null],
    [`/l/${ID}`, null],
    ['/invite/ABCD2345', null],
  ])('%s → %s', (input, code) => {
    expect(inviteCodeFromLink(input)).toBe(code);
  });

  it('opening the link keeps the code on the device for the sign-up', () => {
    expect(
      redirectSystemPath({ path: 'https://onlyswap.pages.dev/i/abcd2345', initial: true }),
    ).toBe('/');
    expect(pendingInviteCode()).toBe('ABCD2345');
    // A listing link leaves it alone.
    redirectSystemPath({ path: `https://onlyswap.pages.dev/l/${ID}`, initial: false });
    expect(pendingInviteCode()).toBe('ABCD2345');
  });

  it('a kept code expires after 30 days', () => {
    let saved: unknown;
    const mem = {
      get: () => saved,
      set: (_k: string, v: unknown) => {
        saved = v;
      },
      remove: () => {
        saved = undefined;
      },
    } as unknown as InviteStorage;
    const t0 = new Date('2026-10-01T00:00:00Z');
    rememberInviteCode('ABCD2345', mem, t0);
    expect(pendingInviteCode(mem, new Date(t0.getTime() + INVITE_KEEP_MS - 1))).toBe('ABCD2345');
    expect(pendingInviteCode(mem, new Date(t0.getTime() + INVITE_KEEP_MS + 1))).toBeUndefined();
    expect(saved).toBeUndefined();
  });

  it('sendCodeWithInvite passes the code only when there is one', async () => {
    const api = { sendCode: jest.fn(async () => {}) };
    await sendCodeWithInvite(api, 'a@osu.edu', 'ABCD2345');
    expect(api.sendCode).toHaveBeenLastCalledWith('a@osu.edu', { inviteCode: 'ABCD2345' });
    await sendCodeWithInvite(api, 'a@osu.edu', undefined);
    expect(api.sendCode).toHaveBeenLastCalledWith('a@osu.edu');
  });
});

describe('P11-STATE-01 system screens', () => {
  it('update opens the download page', () => {
    const openUrl = jest.fn(async () => {});
    renderRouter(
      { index: () => <UpdateScreen openUrl={openUrl} site={() => 'https://s/'} /> },
      { initialUrl: '/' },
    );
    fireEvent.press(screen.getByText(system.updateButton));
    expect(openUrl).toHaveBeenCalledWith('https://s/download');
  });

  it('a bad link offers Discover', async () => {
    renderRouter(
      {
        'link-error': () => <LinkErrorScreen />,
        discover: () => <Text testID="screen-discover">d</Text>,
      },
      { initialUrl: '/link-error' },
    );
    fireEvent.press(screen.getByText(system.goHome));
    expect(await screen.findByTestId('screen-discover')).toBeTruthy();
  });
});
