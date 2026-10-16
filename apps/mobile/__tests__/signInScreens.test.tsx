import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { AuthApi } from '../src/features/auth/api';
import { AgeScreen, PICKER_START_YEARS_AGO } from '../src/features/auth/AgeScreen';
import { EmailScreen } from '../src/features/auth/EmailScreen';
import {
  clearInviteCode,
  pendingInviteCode,
  rememberInviteCode,
} from '../src/features/auth/invite';
import { VerifyScreen } from '../src/features/auth/VerifyScreen';
import { hadLoginIntent, setLoginIntent } from '../src/features/auth/loginIntent';
import { CODE_TTL_MS, verifyStore } from '../src/features/auth/verifyLogic';
import { age as ageCopy, errors, signIn } from '../src/strings/en';

// A plain stand-in for the native date picker: tests fire its onChange directly.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View: V } = jest.requireActual('react-native');
  return { __esModule: true, default: (props: object) => <V {...props} /> };
});

const appError = (code: string) => ({ code: 'P0001', message: code });
const osu = {
  kind: 'school' as const,
  school: {
    campusId: 'c1',
    name: 'The Ohio State University',
    shortName: 'Ohio State',
    status: 'live' as const,
    isReview: false,
  },
};
const demo = {
  kind: 'school' as const,
  school: {
    campusId: 'c2',
    name: 'Demo University',
    shortName: 'Demo U',
    status: 'live' as const,
    isReview: true,
  },
};

function fakeApi(over: Partial<Record<keyof AuthApi, jest.Mock>> = {}) {
  const api = {
    lookupSchool: jest.fn(async (e: string) =>
      e.endsWith('@osu.edu')
        ? osu
        : e.endsWith('@review.onlyswap.test')
          ? demo
          : { kind: 'unknown' },
    ),
    sendCode: jest.fn(async () => {}),
    verifyCode: jest.fn(async () => ({})),
    signInReviewer: jest.fn(async () => ({})),
    signOut: jest.fn(async () => {}),
    joinWaitlist: jest.fn(async () => {}),
    confirmAge: jest.fn(async () => ({ eligible: true, ageBand: '18_plus' as const })),
    deleteUnderageAccount: jest.fn(async () => {}),
    recordAgeAssurance: jest.fn(async () => {}),
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

function setup(initialUrl: string, api: AuthApi, extra: { now?: () => number; age?: object } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      welcome: () => <Stub id="screen-welcome-stub" />,
      email: () => <EmailScreen api={api} />,
      verify: () => <VerifyScreen api={api} now={extra.now} />,
      age: () => <AgeScreen api={api} {...extra.age} />,
    },
    { initialUrl, wrapper },
  );
}

/** expo-router's renderRouter runs on Jest fake timers; this moves them (and Date) forward. */
function passTime(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

async function typeEmail(value: string) {
  fireEvent.changeText(await screen.findByTestId('email-input'), value);
}

describe('P4-AUTH-05 S-A03 school email: every A3/A4/A5 state', () => {
  it('A3: detects the school and sends the code', async () => {
    const api = fakeApi();
    const router = setup('/email', api);
    await typeEmail(' Aisha@OSU.edu ');
    expect(await screen.findByText(osu.school.name)).toBeTruthy();
    fireEvent.press(screen.getByTestId('email-send'));
    await waitFor(() => expect(router.getPathname()).toBe('/verify'));
    expect(api.sendCode).toHaveBeenCalledWith('aisha@osu.edu');
    expect(router.getSearchParams()).toEqual({ email: 'aisha@osu.edu' });
  });

  it('Send stays disabled until a school is detected', async () => {
    setup('/email', fakeApi());
    await typeEmail('aisha@os');
    expect(screen.getByTestId('email-send')).toBeDisabled();
  });

  it('wrong email: a personal address explains the fix, with no server call', async () => {
    const api = fakeApi();
    setup('/email', api);
    await typeEmail('wasif@gmail.com');
    expect(await screen.findByText(signIn.personal)).toBeTruthy();
    expect(screen.getByText(signIn.alumniTitle)).toBeTruthy();
    expect(screen.getByTestId('email-send')).toBeDisabled();
    expect(api.lookupSchool).not.toHaveBeenCalled();
  });

  it('A5: an unknown school offers the waitlist', async () => {
    const api = fakeApi();
    setup('/email', api);
    await typeEmail('sam@nowhere.edu');
    expect(
      await screen.findByText(signIn.unknownTitle.replace('{domain}', 'nowhere.edu')),
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('email-waitlist'));
    await waitFor(() => expect(api.joinWaitlist).toHaveBeenCalledWith('sam@nowhere.edu'));
    expect(screen.getByTestId('email-send')).toBeDisabled();
  });

  it('A4: a listed reviewer gets a password field and signs in without a code', async () => {
    const api = fakeApi();
    const router = setup('/email', api);
    await typeEmail('appreview@review.onlyswap.test');
    expect(
      await screen.findByText(signIn.reviewAccount.replace('{school}', 'Demo University')),
    ).toBeTruthy();
    expect(screen.getByTestId('email-send')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('email-password'), 'secret');
    fireEvent.press(screen.getByTestId('email-send'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.signInReviewer).toHaveBeenCalledWith('appreview@review.onlyswap.test', 'secret');
    expect(api.sendCode).not.toHaveBeenCalled();
  });

  it('a wrong reviewer password says so', async () => {
    const api = fakeApi({
      signInReviewer: jest.fn(async () =>
        Promise.reject({ status: 400, message: 'Invalid login credentials' }),
      ),
    });
    setup('/email', api);
    await typeEmail('appreview@review.onlyswap.test');
    fireEvent.changeText(await screen.findByTestId('email-password'), 'nope');
    fireEvent.press(screen.getByTestId('email-send'));
    expect(await screen.findByText(signIn.wrongPassword)).toBeTruthy();
  });

  it.each([
    ['DOMAIN_BLOCKED', errors.DOMAIN_BLOCKED],
    ['AGE_BLOCKED', errors.AGE_BLOCKED],
    ['BANNED', errors.BANNED],
  ])('the Auth hook refusal %s shows its copy', async (code, text) => {
    const api = fakeApi({ sendCode: jest.fn(async () => Promise.reject(appError(code))) });
    setup('/email', api);
    await typeEmail('aisha@osu.edu');
    await screen.findByText(osu.school.name);
    fireEvent.press(screen.getByTestId('email-send'));
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('rate limited and offline states', async () => {
    const api = fakeApi({
      sendCode: jest
        .fn()
        .mockRejectedValueOnce(appError('RATE_LIMITED:otp'))
        .mockRejectedValueOnce(new TypeError('Network request failed')),
    });
    setup('/email', api);
    await typeEmail('aisha@osu.edu');
    await screen.findByText(osu.school.name);
    fireEvent.press(screen.getByTestId('email-send'));
    expect(await screen.findByText(errors.RATE_LIMITED)).toBeTruthy();
    // Buttons ignore a second tap within 500 ms (double-tap guard).
    passTime(550);
    fireEvent.press(screen.getByTestId('email-send'));
    expect(await screen.findByText(errors.ERR_OFFLINE)).toBeTruthy();
  });

  it('sign-in mode has its own title', async () => {
    setup('/email?mode=login', fakeApi());
    expect(await screen.findByRole('header', { name: signIn.titleSignIn })).toBeTruthy();
  });
});

describe('P4-AUTH-06 S-A04 verify code: wrong, expired, locked', () => {
  const email = 'aisha@osu.edu';
  let clock = 0;
  const now = () => clock;
  beforeEach(() => {
    clock = 1_800_000_000_000;
    verifyStore.clear();
    verifyStore.set(email, { sentAt: clock, wrong: 0, lockedUntil: null });
  });

  const enter = (code: string) => fireEvent.changeText(screen.getByTestId('otp-input'), code);

  it('a right code signs in and hands over to the launch gate', async () => {
    const api = fakeApi();
    const router = setup(`/verify?email=${email}`, api, { now });
    await screen.findByTestId('screen-verify');
    enter('123456');
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.verifyCode).toHaveBeenCalledWith(email, '123456');
    expect(verifyStore.get(email)).toBeUndefined();
  });

  it('a wrong code says how many tries are left; the fifth locks for 5 minutes', async () => {
    const api = fakeApi({
      verifyCode: jest.fn(async () =>
        Promise.reject({ status: 403, message: 'Token has expired or is invalid' }),
      ),
    });
    setup(`/verify?email=${email}`, api, { now });
    await screen.findByTestId('screen-verify');
    enter('000000');
    expect(await screen.findByText(signIn.wrongCode.replace('{count}', '4'))).toBeTruthy();
    for (const left of ['3', '2']) {
      enter('000001');
      enter('000000');
      expect(await screen.findByText(signIn.wrongCode.replace('{count}', left))).toBeTruthy();
    }
    enter('000001');
    enter('000000');
    expect(await screen.findByText(signIn.wrongCodeOne)).toBeTruthy();
    enter('000001');
    enter('000000');
    expect(await screen.findByText(signIn.locked.replace('{time}', '5:00'))).toBeTruthy();
    expect(screen.getByTestId('verify-resend-main')).toBeTruthy();
    expect(screen.getByTestId('otp-input').props.editable).toBe(false);
    expect(api.verifyCode).toHaveBeenCalledTimes(5);
  });

  it('an expired code sends a new one automatically instead of checking it', async () => {
    const api = fakeApi();
    setup(`/verify?email=${email}`, api, { now });
    await screen.findByTestId('screen-verify');
    clock += CODE_TTL_MS;
    enter('123456');
    expect(await screen.findByText(signIn.expired)).toBeTruthy();
    expect(api.sendCode).toHaveBeenCalledWith(email);
    expect(api.verifyCode).not.toHaveBeenCalled();
  });

  it('resend waits for its timer', async () => {
    setup(`/verify?email=${email}`, fakeApi(), { now });
    expect(await screen.findByText(signIn.resendIn.replace('{time}', '1:00'))).toBeTruthy();
    expect(screen.queryByTestId('verify-resend')).toBeNull();
  });

  it('after the timer, resend sends a new code', async () => {
    verifyStore.set(email, { sentAt: clock - 60_000, wrong: 0, lockedUntil: null });
    const api = fakeApi();
    setup(`/verify?email=${email}`, api, { now });
    fireEvent.press(await screen.findByTestId('verify-resend'));
    expect(await screen.findByText(signIn.resent)).toBeTruthy();
    expect(api.sendCode).toHaveBeenCalledWith(email);
  });
});

describe('P4-AUTH-07 A05 age check', () => {
  const ios26 = { os: 'ios' as const, version: '26.1' };
  const signal = (range: object | null) => ({
    requestAgeRangeAsync: jest.fn(async () => range),
    requestAgeSignalsAccessAsync: jest.fn(async () => 'SHARED'),
  });

  it('an adult OS signal confirms without asking a birthday', async () => {
    const api = fakeApi();
    const router = setup('/age', api, {
      age: { ageModule: signal({ lowerBound: 18 }), device: ios26 },
    });
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.confirmAge).toHaveBeenCalledWith({ method: 'os_signal', band: '18_plus' });
  });

  it('a 13 to 17 OS signal confirms and goes on (minimum age 13)', async () => {
    const api = fakeApi({
      confirmAge: jest.fn(async () => ({ eligible: true, ageBand: '13_17' as const })),
    });
    const router = setup('/age', api, {
      age: { ageModule: signal({ lowerBound: 13, upperBound: 17 }), device: ios26 },
    });
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.confirmAge).toHaveBeenCalledWith({ method: 'os_signal', band: '13_17' });
    expect(api.deleteUnderageAccount).not.toHaveBeenCalled();
  });

  it('an under 13 OS signal deletes the account, signs out and shows Not eligible', async () => {
    const api = fakeApi({ confirmAge: jest.fn(async () => ({ eligible: false, ageBand: null })) });
    const router = setup('/age', api, {
      age: { ageModule: signal({ upperBound: 12 }), device: ios26 },
    });
    expect(await screen.findByText(ageCopy.blockedTitle)).toBeTruthy();
    expect(api.confirmAge).toHaveBeenCalledWith({ method: 'os_signal', band: 'under_13' });
    expect(api.deleteUnderageAccount).toHaveBeenCalled();
    expect(api.signOut).toHaveBeenCalledWith('local');
    fireEvent.press(screen.getByTestId('age-close'));
    await waitFor(() => expect(router.getPathname()).toBe('/welcome'));
  });

  it('the date wheels open about 20 years back, as wheels on every platform', async () => {
    setup('/age', fakeApi(), { age: { ageModule: signal(null), device: ios26 } });
    await screen.findByRole('header', { name: ageCopy.title });
    fireEvent.press(screen.getByTestId('age-field'));
    const picker = screen.getByTestId('age-picker');
    expect(picker.props.display).toBe('spinner');
    expect((picker.props.value as Date).getFullYear()).toBe(
      new Date().getFullYear() - PICKER_START_YEARS_AGO,
    );
    expect(screen.getByText(ageCopy.fieldPlaceholder)).toBeTruthy();
  });

  it('no signal shows the birthday field; nothing is prefilled', async () => {
    const api = fakeApi();
    const router = setup('/age', api, { age: { ageModule: signal(null), device: ios26 } });
    expect(await screen.findByRole('header', { name: ageCopy.title })).toBeTruthy();
    expect(screen.getByText(ageCopy.fieldPlaceholder)).toBeTruthy();
    expect(screen.getByTestId('age-continue')).toBeDisabled();
    act(() => {
      screen.getByTestId('age-picker').props.onChange({ type: 'set' }, new Date(2000, 4, 17));
    });
    fireEvent.press(screen.getByTestId('age-continue'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.confirmAge).toHaveBeenCalledWith({
      method: 'self_declared',
      birthDate: '2000-05-17',
    });
  });

  it('a birthday under 13 takes the blocked path', async () => {
    const api = fakeApi({ confirmAge: jest.fn(async () => ({ eligible: false, ageBand: null })) });
    setup('/age', api, { age: { ageModule: null, device: ios26 } });
    await screen.findByRole('header', { name: ageCopy.title });
    act(() => {
      screen.getByTestId('age-picker').props.onChange({ type: 'set' }, new Date(2010, 0, 1));
    });
    fireEvent.press(screen.getByTestId('age-continue'));
    expect(await screen.findByText(ageCopy.blockedTitle)).toBeTruthy();
    expect(api.deleteUnderageAccount).toHaveBeenCalled();
  });

  it('a date the server refuses asks to check it', async () => {
    const api = fakeApi({
      confirmAge: jest.fn(async () => Promise.reject(appError('INVALID:birth_date'))),
    });
    setup('/age', api, { age: { ageModule: null, device: ios26 } });
    await screen.findByRole('header', { name: ageCopy.title });
    act(() => {
      screen.getByTestId('age-picker').props.onChange({ type: 'set' }, new Date(1900, 0, 1));
    });
    fireEvent.press(screen.getByTestId('age-continue'));
    expect(await screen.findByText(ageCopy.invalidDate)).toBeTruthy();
  });

  it('iOS before 26 always asks the birthday (the OS answer is not real there)', async () => {
    const mod = signal({ lowerBound: 18 });
    setup('/age', fakeApi(), { age: { ageModule: mod, device: { os: 'ios', version: '18.5' } } });
    expect(await screen.findByRole('header', { name: ageCopy.title })).toBeTruthy();
    expect(mod.requestAgeRangeAsync).not.toHaveBeenCalled();
  });
});

describe('AR-03 Apple age assurance (Texas, Utah, Louisiana)', () => {
  const ios264 = { os: 'ios' as const, version: '26.4' };
  const regulated = (ranges: (object | null | Error)[], features: string[] = []) => {
    const queue = [...ranges];
    return {
      requestAgeRangeAsync: jest.fn(async () => {
        const next = queue.shift() ?? null;
        if (next instanceof Error) throw next;
        return next;
      }),
      requestAgeSignalsAccessAsync: jest.fn(async () => null),
      isEligibleForAgeFeaturesAsync: jest.fn(async () => true),
      getRequiredRegulatoryFeaturesAsync: jest.fn(async () => [
        'declaredAgeRangeRequired',
        ...features,
      ]),
    };
  };

  it('a regulated teen confirms from the OS and records consent with the declaration', async () => {
    const api = fakeApi({
      confirmAge: jest.fn(async () => ({ eligible: true, ageBand: '13_17' as const })),
    });
    const router = setup('/age', api, {
      age: {
        ageModule: regulated([
          { lowerBound: 13, upperBound: 17, ageRangeDeclaration: 'guardianDeclared' },
        ]),
        device: ios264,
      },
    });
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.confirmAge).toHaveBeenCalledWith({ method: 'os_signal', band: '13_17' });
    expect(api.recordAgeAssurance).toHaveBeenCalledWith({
      regulated: true,
      declaration: 'guardian_declared',
    });
  });

  it('a regulated person who declines never sees the birthday field, and can retry', async () => {
    const api = fakeApi();
    const router = setup('/age', api, {
      age: {
        ageModule: regulated([
          new Error('ERR_AGE_RANGE_USER_DECLINED'),
          { lowerBound: 18, ageRangeDeclaration: 'selfDeclared' },
        ]),
        device: ios264,
      },
    });
    expect(await screen.findByRole('header', { name: ageCopy.osRequiredTitle })).toBeTruthy();
    expect(screen.queryByTestId('age-field')).toBeNull();
    expect(screen.queryByTestId('age-continue')).toBeNull();
    expect(api.confirmAge).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('age-os-retry'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.confirmAge).toHaveBeenCalledWith({ method: 'os_signal', band: '18_plus' });
    expect(api.recordAgeAssurance).toHaveBeenCalledWith({
      regulated: true,
      declaration: 'self_declared',
    });
  });

  it('Close on the share screen goes back to Welcome', async () => {
    const router = setup('/age', fakeApi(), {
      age: { ageModule: regulated([null]), device: ios264 },
    });
    fireEvent.press(await screen.findByTestId('age-os-close'));
    await waitFor(() => expect(router.getPathname()).toBe('/welcome'));
  });

  it('where the law does not apply, a decline falls back to the birthday and nothing is recorded', async () => {
    const mod = {
      ...regulated([null]),
      isEligibleForAgeFeaturesAsync: jest.fn(async () => false),
      getRequiredRegulatoryFeaturesAsync: jest.fn(async () => []),
    };
    const api = fakeApi();
    setup('/age', api, { age: { ageModule: mod, device: ios264 } });
    expect(await screen.findByRole('header', { name: ageCopy.title })).toBeTruthy();
    expect(screen.getByTestId('age-field')).toBeTruthy();
    expect(api.recordAgeAssurance).not.toHaveBeenCalled();
  });

  it('a failed record still lets a confirmed person through', async () => {
    const api = fakeApi({
      recordAgeAssurance: jest.fn(async () => Promise.reject(appError('NETWORK'))),
    });
    const router = setup('/age', api, {
      age: { ageModule: regulated([{ lowerBound: 18 }]), device: ios264 },
    });
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.recordAgeAssurance).toHaveBeenCalledWith({ regulated: true, declaration: null });
  });
});

describe('A03 login mode with an address that has no account yet', () => {
  const noSignal = {
    requestAgeRangeAsync: jest.fn(async () => null),
    requestAgeSignalsAccessAsync: jest.fn(async () => 'SHARED'),
  };
  const ios26 = { os: 'ios' as const, version: '26.1' };

  afterEach(() => setLoginIntent(false));

  it('sends the same code as sign-up (no account enumeration) and remembers the intent', async () => {
    const api = fakeApi();
    const router = setup('/email?mode=login', api);
    await typeEmail('new@osu.edu');
    expect(await screen.findByText(osu.school.name)).toBeTruthy();
    fireEvent.press(screen.getByTestId('email-send'));
    await waitFor(() => expect(router.getPathname()).toBe('/verify'));
    expect(api.sendCode).toHaveBeenCalledWith('new@osu.edu');
    expect(hadLoginIntent()).toBe(true);
  });

  it('after the code, the birthday step explains that a new account is being set up', async () => {
    setLoginIntent(true);
    setup('/age', fakeApi(), { age: { ageModule: noSignal, device: ios26 } });
    expect(await screen.findByText(`${ageCopy.newFromSignIn} ${ageCopy.body}`)).toBeTruthy();
  });

  it('the sign-up path keeps the plain birthday copy', async () => {
    setLoginIntent(false);
    setup('/age', fakeApi(), { age: { ageModule: noSignal, device: ios26 } });
    expect(await screen.findByText(ageCopy.body)).toBeTruthy();
  });
});

describe('R11-INVITE-01 an invite code from an /i/ link goes out with the sign-up', () => {
  afterEach(() => clearInviteCode());

  it('Send code carries the kept code; a verified code spends it', async () => {
    rememberInviteCode('ABCD2345');
    const api = fakeApi();
    const router = setup('/email', api);
    await typeEmail('aisha@osu.edu');
    expect(await screen.findByText(osu.school.name)).toBeTruthy();
    fireEvent.press(screen.getByTestId('email-send'));
    await waitFor(() => expect(router.getPathname()).toBe('/verify'));
    expect(api.sendCode).toHaveBeenCalledWith('aisha@osu.edu', { inviteCode: 'ABCD2345' });
    fireEvent.changeText(await screen.findByTestId('otp-input'), '123456');
    await waitFor(() => expect(api.verifyCode).toHaveBeenCalled());
    await waitFor(() => expect(pendingInviteCode()).toBeUndefined());
  });

  it('without a link, sendCode gets the email only', async () => {
    const api = fakeApi();
    const router = setup('/email', api);
    await typeEmail('aisha@osu.edu');
    expect(await screen.findByText(osu.school.name)).toBeTruthy();
    fireEvent.press(screen.getByTestId('email-send'));
    await waitFor(() => expect(router.getPathname()).toBe('/verify'));
    expect(api.sendCode).toHaveBeenCalledWith('aisha@osu.edu');
  });
});
