// T-UNIT-TURNSTILE-01 (LR-04): web bot check for the signed-out forms. Pure
// helpers, then the Help, Email access and waitlist forms with a fake field.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useToastStore } from '../src/components/Toast';
import type { TurnstileFieldProps, TurnstileSeam } from '../src/components/TurnstileField';
import type { AuthApi } from '../src/features/auth/api';
import { EmailScreen } from '../src/features/auth/EmailScreen';
import { EmailAccessScreen } from '../src/features/help/EmailAccessScreen';
import { HelpScreen } from '../src/features/safety/SafetyScreens';
import {
  isTurnstileError,
  loadTurnstile,
  mountTurnstile,
  TURNSTILE_SCRIPT,
  turnstileSiteKey,
  type DocumentLike,
  type TurnstileApi,
} from '../src/lib/turnstile';
import { banner, emailAccess, signIn } from '../src/strings/en';

const turnstileRejection = { code: 'P0001', message: 'INVALID:turnstile_token' };

describe('T-UNIT-TURNSTILE-01 helpers', () => {
  it('the site key is used on the web build only', () => {
    const env = { EXPO_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAAtest' };
    expect(turnstileSiteKey(env, 'web')).toBe('0x4AAAAAAAtest');
    expect(turnstileSiteKey(env, 'ios')).toBeNull();
    expect(turnstileSiteKey(env, 'android')).toBeNull();
    expect(() => turnstileSiteKey({}, 'web')).toThrow(/EXPO_PUBLIC_TURNSTILE_SITE_KEY/);
    expect(() => turnstileSiteKey({ EXPO_PUBLIC_TURNSTILE_SITE_KEY: '' }, 'web')).toThrow(
      /EXPO_PUBLIC_TURNSTILE_SITE_KEY/,
    );
  });

  function fakeDoc() {
    const handlers: Record<string, (() => void)[]> = {};
    const listeners = {
      load: () => handlers.load?.forEach((cb) => cb()),
      error: () => handlers.error?.forEach((cb) => cb()),
    };
    const appended: { id: string; src: string; async: boolean }[] = [];
    let existing: unknown = null;
    const doc: DocumentLike = {
      getElementById: () => existing,
      createElement: () => {
        const el = {
          id: '',
          src: '',
          async: false,
          defer: false,
          addEventListener: (type: 'load' | 'error', cb: () => void) => {
            handlers[type] = [...(handlers[type] ?? []), cb];
          },
        };
        return el;
      },
      head: {
        appendChild: (el) => {
          appended.push(el);
          existing = el;
          return el;
        },
      },
    };
    return { doc, listeners, appended };
  }

  it('loads the script once and resolves with window.turnstile', async () => {
    const api = { render: jest.fn(), reset: jest.fn(), remove: jest.fn() } as TurnstileApi;
    const win: { turnstile?: TurnstileApi } = {};
    const { doc, listeners, appended } = fakeDoc();
    const loading = loadTurnstile(win, doc);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ src: TURNSTILE_SCRIPT, async: true });
    const again = loadTurnstile(win, doc);
    expect(appended).toHaveLength(1);
    win.turnstile = api;
    listeners.load?.();
    await expect(loading).resolves.toBe(api);
    await expect(again).resolves.toBe(api);
    await expect(loadTurnstile(win, doc)).resolves.toBe(api);
  });

  it('a script that fails to load rejects', async () => {
    const { doc, listeners } = fakeDoc();
    const loading = loadTurnstile({}, doc);
    listeners.error?.();
    await expect(loading).rejects.toThrow('turnstile failed to load');
  });

  it('mounts interaction-only; expiry, errors and reset clear the token', () => {
    let opts: Parameters<TurnstileApi['render']>[1] | undefined;
    const api: TurnstileApi = {
      render: jest.fn((_el, o) => {
        opts = o;
        return 'w1';
      }),
      reset: jest.fn(),
      remove: jest.fn(),
    };
    const tokens: (string | null)[] = [];
    const widget = mountTurnstile(api, 'EL', 'site-key-123', (t) => tokens.push(t));
    expect(api.render).toHaveBeenCalledWith(
      'EL',
      expect.objectContaining({ sitekey: 'site-key-123', appearance: 'interaction-only' }),
    );
    opts?.callback('tok1');
    opts?.['expired-callback']();
    opts?.callback('tok2');
    opts?.['error-callback']();
    widget.reset();
    expect(api.reset).toHaveBeenCalledWith('w1');
    widget.remove();
    expect(api.remove).toHaveBeenCalledWith('w1');
    expect(tokens).toEqual(['tok1', null, 'tok2', null, null]);
  });

  it('isTurnstileError matches only INVALID:turnstile_token', () => {
    expect(isTurnstileError(turnstileRejection)).toBe(true);
    expect(isTurnstileError({ code: 'P0001', message: 'INVALID:email' })).toBe(false);
    expect(isTurnstileError({ code: 'P0001', message: 'RATE_LIMITED:ip:waitlist' })).toBe(false);
    expect(isTurnstileError(new Error('boom'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Forms. The fake field hands out `tok<n>` only when the test says the check passed, so the
// gap between a reset and the next token is visible.

function fakeTurnstile() {
  const state: { onToken?: (t: string | null) => void; resetKey: number } = { resetKey: 0 };
  function Field({ onToken, resetKey }: TurnstileFieldProps) {
    useEffect(() => {
      state.onToken = onToken;
      state.resetKey = resetKey;
    }, [onToken, resetKey]);
    return <View testID="fake-turnstile" />;
  }
  const seam: TurnstileSeam = { Field, siteKey: 'site-key-123' };
  // Past the Button's 500 ms double-tap guard, then the check passes.
  const pass = () =>
    act(() => {
      jest.advanceTimersByTime(600);
      state.onToken?.(`tok${state.resetKey + 1}`);
    });
  return { seam, state, pass };
}

function Stub({ id }: { id: string }) {
  return (
    <View testID={id}>
      <Text>{id}</Text>
    </View>
  );
}

function render(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    { index: () => <Stub id="screen-index" />, ...routes },
    { initialUrl, wrapper },
  );
}

function waitlistApi(joinWaitlist: jest.Mock) {
  return {
    lookupSchool: jest.fn(async () => ({ kind: 'unknown' })),
    joinWaitlist,
  } as unknown as AuthApi;
}

async function openUnknownSchool() {
  fireEvent.changeText(await screen.findByTestId('email-input'), 'sam@nowhere.edu');
  expect(
    await screen.findByText(signIn.unknownTitle.replace('{domain}', 'nowhere.edu')),
  ).toBeTruthy();
}

describe('T-UNIT-TURNSTILE-01 waitlist card (EmailScreen)', () => {
  it('two waitlist submissions send tok1 then tok2; submit waits for each new token', async () => {
    const joinWaitlist = jest.fn(async () => {});
    const { seam, pass } = fakeTurnstile();
    render(
      { email: () => <EmailScreen api={waitlistApi(joinWaitlist)} turnstileField={seam} /> },
      '/email',
    );
    await openUnknownSchool();
    expect(screen.getByTestId('fake-turnstile')).toBeTruthy();
    expect(screen.getByTestId('email-waitlist')).toBeDisabled();

    pass();
    expect(screen.getByTestId('email-waitlist')).toBeEnabled();
    fireEvent.press(screen.getByTestId('email-waitlist'));
    await waitFor(() => expect(joinWaitlist).toHaveBeenLastCalledWith('sam@nowhere.edu', 'tok1'));
    // Reset after the send: disabled until the widget issues a new token.
    await waitFor(() => expect(screen.getByTestId('email-waitlist')).toBeDisabled());

    pass();
    await waitFor(() => expect(screen.getByTestId('email-waitlist')).toBeEnabled());
    fireEvent.press(screen.getByTestId('email-waitlist'));
    await waitFor(() => expect(joinWaitlist).toHaveBeenLastCalledWith('sam@nowhere.edu', 'tok2'));
    expect(joinWaitlist).toHaveBeenCalledTimes(2);
  });

  it('a rejected token shows the bot check copy and also resets', async () => {
    const joinWaitlist = jest
      .fn()
      .mockRejectedValueOnce(turnstileRejection)
      .mockResolvedValue(undefined);
    const { seam, pass } = fakeTurnstile();
    render(
      { email: () => <EmailScreen api={waitlistApi(joinWaitlist)} turnstileField={seam} /> },
      '/email',
    );
    await openUnknownSchool();
    pass();
    await waitFor(() => expect(screen.getByTestId('email-waitlist')).toBeEnabled());
    fireEvent.press(screen.getByTestId('email-waitlist'));
    await waitFor(() =>
      expect(useToastStore.getState().current).toMatchObject({
        kind: 'error',
        message: banner.botCheckFailed,
      }),
    );
    await waitFor(() => expect(screen.getByTestId('email-waitlist')).toBeDisabled());
    pass();
    await waitFor(() => expect(screen.getByTestId('email-waitlist')).toBeEnabled());
    fireEvent.press(screen.getByTestId('email-waitlist'));
    await waitFor(() => expect(joinWaitlist).toHaveBeenLastCalledWith('sam@nowhere.edu', 'tok2'));
  });

  it('native (no site key): no widget, submit enabled, no token sent', async () => {
    const joinWaitlist = jest.fn(async () => {});
    render({ email: () => <EmailScreen api={waitlistApi(joinWaitlist)} /> }, '/email');
    await openUnknownSchool();
    expect(screen.queryByTestId('turnstile')).toBeNull();
    expect(screen.getByTestId('email-waitlist')).toBeEnabled();
    fireEvent.press(screen.getByTestId('email-waitlist'));
    await waitFor(() => expect(joinWaitlist).toHaveBeenCalledWith('sam@nowhere.edu'));
    expect(joinWaitlist.mock.calls[0]).toHaveLength(1);
  });
});

describe('T-UNIT-TURNSTILE-01 Help and Email access forms', () => {
  it('Help sends the token, waits for it, and resets after a failure', async () => {
    const sendSupportRequest = jest
      .fn()
      .mockRejectedValueOnce(turnstileRejection)
      .mockResolvedValue(undefined);
    const { seam, pass } = fakeTurnstile();
    render(
      {
        help: () => (
          <HelpScreen auth={{ sendSupportRequest }} email="a@osu.edu" turnstileField={seam} />
        ),
      },
      '/help',
    );
    fireEvent.changeText(await screen.findByTestId('help-body'), 'The chat is stuck');
    expect(screen.getByTestId('help-send')).toBeDisabled();
    pass();
    await waitFor(() => expect(screen.getByTestId('help-send')).toBeEnabled());
    fireEvent.press(screen.getByTestId('help-send'));
    expect(await screen.findByText(banner.botCheckFailed)).toBeTruthy();
    expect(sendSupportRequest).toHaveBeenLastCalledWith({
      email: 'a@osu.edu',
      topic: 'general',
      body: 'The chat is stuck',
      turnstileToken: 'tok1',
    });
    await waitFor(() => expect(screen.getByTestId('help-send')).toBeDisabled());
    pass();
    await waitFor(() => expect(screen.getByTestId('help-send')).toBeEnabled());
    fireEvent.press(screen.getByTestId('help-send'));
    expect(await screen.findByTestId('help-sent')).toBeTruthy();
    expect(sendSupportRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ turnstileToken: 'tok2' }),
    );
  });

  it('Email access sends the token with the request', async () => {
    const sendSupportRequest = jest.fn(async () => {});
    const { seam, pass } = fakeTurnstile();
    const api = { sendSupportRequest } as unknown as AuthApi;
    render(
      { 'help/email-access': () => <EmailAccessScreen api={api} turnstileField={seam} /> },
      '/help/email-access',
    );
    fireEvent.changeText(await screen.findByTestId('email-access-contact'), 'me@gmail.com');
    fireEvent.changeText(screen.getByTestId('email-access-message'), 'Help');
    expect(screen.getByTestId('email-access-send')).toBeDisabled();
    pass();
    fireEvent.press(screen.getByTestId('email-access-send'));
    expect(await screen.findByText(emailAccess.sentTitle)).toBeTruthy();
    expect(sendSupportRequest).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'cant_access_email', turnstileToken: 'tok1' }),
    );
  });
});
