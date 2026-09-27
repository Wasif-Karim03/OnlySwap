import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import {
  createAuthApi,
  type AuthApi,
  type AuthClient,
  type ProfileQuery,
} from '../src/features/auth/api';
import { computeGate, localDate, type GateInput } from '../src/features/auth/logic';
import { formatDueDate, ReverifyScreen } from '../src/features/auth/ReverifyScreen';
import { SessionExpiredSheet } from '../src/features/auth/SessionExpiredSheet';
import {
  noteIntentionalSignOut,
  resetSessionExpiry,
  useSessionExpiry,
  watchSessionExpiry,
} from '../src/features/auth/sessionExpiry';
import { VerifyScreen } from '../src/features/auth/VerifyScreen';
import { composeMessage, EmailAccessScreen } from '../src/features/help/EmailAccessScreen';
import { emailAccess, errors, reverify, sessionExpired } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const appError = (code: string) => ({ code: 'P0001', message: code });

function fakeApi(over: Partial<Record<keyof AuthApi, jest.Mock>> = {}) {
  const api = {
    sendCode: jest.fn(async () => {}),
    verifyCode: jest.fn(async () => ({})),
    signOut: jest.fn(async () => {}),
    completeReverify: jest.fn(async () => ({ verifiedUntil: '2028-03-05' })),
    getAccountEmail: jest.fn(async () => ({ email: 'aisha@osu.edu', verifiedUntil: '2027-08-31' })),
    lookupSchool: jest.fn(async () => ({
      kind: 'school',
      school: {
        campusId: 'c1',
        name: 'The Ohio State University',
        shortName: 'Ohio State',
        status: 'live',
        isReview: false,
      },
    })),
    sendSupportRequest: jest.fn(async () => {}),
    ...over,
  };
  return api as unknown as AuthApi & typeof api;
}

function Stub({ id }: { id: string }) {
  return (
    <View testID={id}>
      <Text>{id}</Text>
    </View>
  );
}

function setup(initialUrl: string, routes: Record<string, () => ReactNode>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(['profile', 'u1', 'gate'], { status: 'reverify' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const router = renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      welcome: () => <Stub id="screen-welcome" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
  return { router, client };
}

// ---------------------------------------------------------------------------------------------
describe('P4-AUTH-14 re-verify gate', () => {
  const base: GateInput = {
    config: null,
    appVersion: '1.0.0',
    platform: 'ios',
    session: 'signedIn',
    notificationsAsked: true,
    profile: {
      status: 'active',
      firstName: 'Aisha',
      adultConfirmed: true,
      rulesVersion: '1',
      verifiedUntil: '2027-03-01',
    },
  };
  it('an overdue check routes to X9 before the nightly job flips the status', () => {
    expect(computeGate({ ...base, today: '2027-03-02' })).toBe('reverify');
  });
  it('due today, or no date known, still opens the app', () => {
    expect(computeGate({ ...base, today: '2027-03-01' })).toBe('home');
    expect(computeGate({ ...base, today: undefined })).toBe('home');
  });
  it('localDate and the due date format', () => {
    expect(localDate(new Date(2027, 1, 3))).toBe('2027-02-03');
    expect(formatDueDate('2027-08-31')).toBe('Aug 31, 2027');
    expect(formatDueDate('junk')).toBe('junk');
  });
});

describe('P4-AUTH-14 X9 Re-verify screen', () => {
  it('shows the school, email and due date, sends a code and opens Verify in reverify mode', async () => {
    const api = fakeApi();
    const { router } = setup('/reverify', {
      reverify: () => <ReverifyScreen api={api} />,
      verify: () => <Stub id="screen-verify-stub" />,
    });
    expect(await screen.findByText(reverify.title.replace('{school}', 'Ohio State'))).toBeTruthy();
    expect(screen.getByText('aisha@osu.edu')).toBeTruthy();
    expect(screen.getByText('Aug 31, 2027')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reverify-send'));
    await waitFor(() => expect(router.getPathname()).toBe('/verify'));
    expect(api.sendCode).toHaveBeenCalledWith('aisha@osu.edu');
    expect(router.getSearchParams()).toEqual({ email: 'aisha@osu.edu', mode: 'reverify' });
  });

  it('a failed send stays with the error; log out goes to Welcome', async () => {
    const api = fakeApi({
      sendCode: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    });
    const { router } = setup('/reverify', { reverify: () => <ReverifyScreen api={api} /> });
    fireEvent.press(await screen.findByTestId('reverify-send'));
    expect(await screen.findByText(errors.ERR_OFFLINE)).toBeTruthy();
    fireEvent.press(screen.getByTestId('reverify-logout'));
    await waitFor(() => expect(router.getPathname()).toBe('/welcome'));
    expect(api.signOut).toHaveBeenCalledWith('local');
  });

  it('loading and error states', async () => {
    const api = fakeApi({
      getAccountEmail: jest
        .fn()
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValue(null),
    });
    setup('/reverify', { reverify: () => <ReverifyScreen api={api} /> });
    expect(screen.getByTestId('screen-reverify-loading')).toBeTruthy();
    expect(await screen.findByTestId('screen-reverify-error')).toBeTruthy();
  });
});

describe('P4-AUTH-14 Verify in reverify mode', () => {
  it('a right code calls complete_reverify, then hands back to the gate with a fresh profile', async () => {
    const api = fakeApi();
    const { router, client } = setup('/verify?email=aisha%40osu.edu&mode=reverify', {
      verify: () => <VerifyScreen api={api} />,
    });
    expect(screen.queryByTestId('verify-different-email')).toBeNull();
    fireEvent.changeText(await screen.findByTestId('otp-input'), '123456');
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.verifyCode).toHaveBeenCalledWith('aisha@osu.edu', '123456');
    expect(api.completeReverify).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['profile', 'u1', 'gate'])).toBeUndefined();
  });

  it('if complete_reverify fails the screen says why and stays', async () => {
    const api = fakeApi({
      completeReverify: jest.fn().mockRejectedValue(appError('RATE_LIMITED:complete_reverify')),
    });
    const { router } = setup('/verify?email=aisha%40osu.edu&mode=reverify', {
      verify: () => <VerifyScreen api={api} />,
    });
    fireEvent.changeText(await screen.findByTestId('otp-input'), '123456');
    expect(await screen.findByTestId('verify-message')).toBeTruthy();
    expect(router.getPathname()).toBe('/verify');
  });

  it('"Can\'t get into your school email?" opens the help form', async () => {
    const { router } = setup('/verify?email=aisha%40osu.edu', {
      verify: () => <VerifyScreen api={fakeApi()} />,
      'help/email-access': () => <Stub id="screen-email-access-stub" />,
    });
    fireEvent.press(await screen.findByTestId('verify-cant-access'));
    await waitFor(() => expect(router.getPathname()).toBe('/help/email-access'));
  });
});

// ---------------------------------------------------------------------------------------------
type Listener = (event: string, session: unknown) => void;
function fakeAuthSource() {
  let listener: Listener = () => {};
  const unsubscribe = jest.fn();
  return {
    source: {
      onAuthStateChange: (cb: Listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    emit: (event: string, session: unknown = null) => act(() => listener(event, session)),
    unsubscribe,
  };
}
const signedIn = { user: { email: 'aisha@osu.edu' } };

describe('P4-AUTH-14 X7 Session expired', () => {
  beforeEach(() => resetSessionExpiry());

  it('an unexpected sign-out (revoked or expired) opens the sheet for the last email', () => {
    const auth = fakeAuthSource();
    const stop = watchSessionExpiry(auth.source as never);
    auth.emit('INITIAL_SESSION', signedIn);
    auth.emit('SIGNED_OUT');
    expect(useSessionExpiry.getState()).toMatchObject({ open: true, email: 'aisha@osu.edu' });
    stop();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it('a sign-out the person asked for opens nothing', () => {
    const auth = fakeAuthSource();
    watchSessionExpiry(auth.source as never);
    auth.emit('SIGNED_IN', signedIn);
    noteIntentionalSignOut();
    auth.emit('SIGNED_OUT');
    expect(useSessionExpiry.getState().open).toBe(false);
    // and the next unexpected one still does (after a new sign-in)
    auth.emit('SIGNED_IN', signedIn);
    auth.emit('SIGNED_OUT');
    expect(useSessionExpiry.getState().open).toBe(true);
  });

  it('never signed in: nothing to show', () => {
    const auth = fakeAuthSource();
    watchSessionExpiry(auth.source as never);
    auth.emit('SIGNED_OUT');
    expect(useSessionExpiry.getState().open).toBe(false);
  });

  it('the sheet sends a code, and the right code closes it on the same screen', async () => {
    const api = fakeApi();
    const { router } = setup('/somewhere', {
      somewhere: () => (
        <>
          <Stub id="screen-somewhere" />
          <SessionExpiredSheet api={api} />
        </>
      ),
    });
    act(() => useSessionExpiry.getState().show('aisha@osu.edu'));
    expect(await screen.findByText(sessionExpired.title)).toBeTruthy();
    await waitFor(() => expect(api.sendCode).toHaveBeenCalledWith('aisha@osu.edu'));
    fireEvent.changeText(screen.getByTestId('otp-input'), '654321');
    await waitFor(() => expect(useSessionExpiry.getState().open).toBe(false));
    expect(api.verifyCode).toHaveBeenCalledWith('aisha@osu.edu', '654321');
    expect(router.getPathname()).toBe('/somewhere');
  });

  it('a wrong code says so; "Log out instead" goes to Welcome', async () => {
    const api = fakeApi({
      verifyCode: jest
        .fn()
        .mockRejectedValue({ status: 403, message: 'Token has expired or is invalid' }),
    });
    const { router } = setup('/somewhere', {
      somewhere: () => <SessionExpiredSheet api={api} />,
    });
    act(() => useSessionExpiry.getState().show('aisha@osu.edu'));
    fireEvent.changeText(await screen.findByTestId('otp-input'), '000000');
    expect(await screen.findByText(sessionExpired.wrongCode)).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-expired-logout'));
    await waitFor(() => expect(router.getPathname()).toBe('/welcome'));
    expect(api.signOut).toHaveBeenCalledWith('local');
    expect(useSessionExpiry.getState().open).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('P4-AUTH-19 F20 "I can\'t get into my school email"', () => {
  it('sends a cant_access_email request with the old school address first', async () => {
    const api = fakeApi();
    setup('/help/email-access', { 'help/email-access': () => <EmailAccessScreen api={api} /> });
    fireEvent.changeText(await screen.findByTestId('email-access-contact'), ' Me@Gmail.com ');
    fireEvent.changeText(screen.getByTestId('email-access-school'), 'aisha@osu.edu');
    fireEvent.changeText(
      screen.getByTestId('email-access-message'),
      'My school moved me to a new address.',
    );
    fireEvent.press(screen.getByTestId('email-access-send'));
    expect(await screen.findByText(emailAccess.sentTitle)).toBeTruthy();
    expect(api.sendSupportRequest).toHaveBeenCalledWith({
      email: 'me@gmail.com',
      topic: 'cant_access_email',
      body: 'School email on the account: aisha@osu.edu\n\nMy school moved me to a new address.',
    });
  });

  it('a contact email and a note are required; server errors show', async () => {
    const api = fakeApi({
      sendSupportRequest: jest.fn().mockRejectedValue(appError('RATE_LIMITED:ip:support')),
    });
    setup('/help/email-access', { 'help/email-access': () => <EmailAccessScreen api={api} /> });
    fireEvent.press(await screen.findByTestId('email-access-send'));
    expect(await screen.findByText(emailAccess.contactInvalid)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('email-access-contact'), 'me@gmail.com');
    act(() => {
      jest.advanceTimersByTime(600);
    });
    fireEvent.press(screen.getByTestId('email-access-send'));
    expect(await screen.findByText(emailAccess.messageEmpty)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('email-access-message'), 'Help');
    act(() => {
      jest.advanceTimersByTime(600);
    });
    fireEvent.press(screen.getByTestId('email-access-send'));
    expect(await screen.findByTestId('email-access-error')).toBeTruthy();
    expect(api.sendSupportRequest).toHaveBeenCalledTimes(1);
  });

  it('composeMessage trims and caps at 2000 characters', () => {
    expect(composeMessage('  ', ' hi ')).toBe('hi');
    expect(composeMessage('a@b.edu', 'x'.repeat(3000))).toHaveLength(2000);
  });
});

// ---------------------------------------------------------------------------------------------
describe('P4-AUTH-18 / P4-AUTH-19 auth api', () => {
  function build() {
    const rpc = jest.fn(async () => ({ data: { verified_until: '2028-03-05' }, error: null }));
    const invoke = jest.fn(async () => ({ data: { ok: true }, error: null }));
    const signOut = jest.fn(async () => ({ error: null }));
    const api = createAuthApi({
      auth: () =>
        ({
          signOut,
          getUser: async () => ({ data: { user: { id: 'u1', email: 'aisha@osu.edu' } } }),
        }) as unknown as AuthClient,
      rpc: () => ({ rpc, auth: { refreshSession: async () => ({ error: null }) } }),
      functions: () => ({ invoke }),
      profile: (async () => ({
        data: { verified_until: '2027-08-31' },
        error: null,
      })) as unknown as ProfileQuery,
    });
    return { api, rpc, invoke, signOut };
  }

  it('T-INT-AUTH-05 app half: "Sign out of all devices" uses the global scope and opens no sheet', async () => {
    resetSessionExpiry();
    const { api, signOut } = build();
    const auth = fakeAuthSource();
    watchSessionExpiry(auth.source as never);
    auth.emit('SIGNED_IN', signedIn);
    await api.signOut('global');
    auth.emit('SIGNED_OUT');
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(useSessionExpiry.getState().open).toBe(false);
  });

  it('completeReverify, getAccountEmail and sendSupportRequest', async () => {
    const { api, rpc, invoke } = build();
    await expect(api.completeReverify()).resolves.toEqual({ verifiedUntil: '2028-03-05' });
    expect(rpc).toHaveBeenCalledWith('complete_reverify', undefined);
    await expect(api.getAccountEmail()).resolves.toEqual({
      email: 'aisha@osu.edu',
      verifiedUntil: '2027-08-31',
    });
    await api.sendSupportRequest({
      email: ' me@gmail.com ',
      topic: 'cant_access_email',
      body: ' hi ',
    });
    expect(invoke).toHaveBeenCalledWith('support-request', {
      body: { email: 'me@gmail.com', topic: 'cant_access_email', body: 'hi' },
    });
  });
});
