import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { AuthApi } from '../src/features/auth/api';
import type { AvatarDeps } from '../src/features/auth/avatar';
import type { AppConfig } from '../src/features/auth/logic';
import { NotificationsScreen } from '../src/features/auth/NotificationsScreen';
import { ProfileSetupScreen } from '../src/features/auth/ProfileSetupScreen';
import { RulesScreen } from '../src/features/auth/RulesScreen';
import type { OsPermission } from '../src/lib/permissions';
import { errors, primer, profileSetup, rules } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-notifications', () => ({}));

const appError = (code: string) => ({ code: 'P0001', message: code });

const config: AppConfig = {
  maintenance: { enabled: false, until: null },
  minVersionIos: '1.0.0',
  minVersionAndroid: '1.0.0',
  rulesVersion: '3',
  rulesChanges: ['Fakes are now on the banned list.', 'Meetups need a Meetup spot after dark.'],
  chatPhotosEnabled: false,
};

function fakeApi(over: Partial<Record<keyof AuthApi, jest.Mock>> = {}) {
  const api = {
    updateProfile: jest.fn(async () => {}),
    acceptRules: jest.fn(async () => {}),
    getAppConfig: jest.fn(async () => config),
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
  // gcTime Infinity: no garbage-collection timer is left running after the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(['profile', 'u1', 'gate'], { firstName: null });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const router = renderRouter(
    { index: () => <Stub id="screen-index" />, ...routes },
    { initialUrl, wrapper },
  );
  return { router, client };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const photo = { uri: 'file:///picked.jpg', width: 3024, height: 4032 };

describe('P4-AUTH-08 A06 profile setup', () => {
  const avatarNone: AvatarDeps = { pick: jest.fn(async () => null), upload: jest.fn() };

  it('a first name is required; nothing is sent without it', async () => {
    const api = fakeApi();
    setup('/profile-setup', {
      'profile-setup': () => <ProfileSetupScreen api={api} avatar={avatarNone} />,
    });
    fireEvent.press(await screen.findByTestId('profile-continue'));
    expect(await screen.findByText(profileSetup.nameEmpty)).toBeTruthy();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('saves first name, last initial and year, then hands back to the gate with a fresh profile', async () => {
    const api = fakeApi();
    const { router, client } = setup('/profile-setup', {
      'profile-setup': () => <ProfileSetupScreen api={api} avatar={avatarNone} />,
    });
    fireEvent.changeText(await screen.findByTestId('profile-first'), ' Wasif ');
    fireEvent.changeText(screen.getByTestId('profile-last'), 'karim');
    expect(screen.getByText('Shown as Wasif K.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(profileSetup.years.sophomore));
    fireEvent.press(screen.getByTestId('profile-continue'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.updateProfile).toHaveBeenCalledWith({
      firstName: 'Wasif',
      lastInitial: 'K',
      year: 'sophomore',
      avatarPath: null,
    });
    expect(client.getQueryData(['profile', 'u1', 'gate'])).toBeUndefined();
  });

  it('the photo uploads with progress; Continue waits for it and sends the key', async () => {
    const api = fakeApi();
    const upload = deferred<string>();
    let report: (f: number) => void = () => {};
    const avatar: AvatarDeps = {
      pick: jest.fn(async () => photo),
      upload: jest.fn((_p, onProgress) => {
        report = onProgress;
        return upload.promise;
      }),
    };
    const { router } = setup('/profile-setup', {
      'profile-setup': () => <ProfileSetupScreen api={api} avatar={avatar} />,
    });
    fireEvent.press(await screen.findByTestId('profile-photo'));
    expect(await screen.findByTestId('profile-photo-progress')).toBeTruthy();
    act(() => report(0.5));
    expect(screen.getByTestId('profile-photo-progress').props.accessibilityValue.now).toBe(50);
    expect(screen.getByTestId('profile-continue')).toBeDisabled();
    await act(async () => upload.resolve('c/osu/u/u1/avatar_x.webp'));
    expect(await screen.findByTestId('profile-photo-done')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('profile-first'), 'Ana');
    fireEvent.press(screen.getByTestId('profile-continue'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Ana',
        lastInitial: null,
        avatarPath: 'c/osu/u/u1/avatar_x.webp',
      }),
    );
  });

  it('a failed upload can be retried or skipped; removing the photo sends none', async () => {
    const api = fakeApi();
    const avatar: AvatarDeps = {
      pick: jest.fn(async () => photo),
      upload: jest
        .fn()
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce('c/osu/u/u1/avatar_y.webp'),
    };
    setup('/profile-setup', {
      'profile-setup': () => <ProfileSetupScreen api={api} avatar={avatar} />,
    });
    fireEvent.press(await screen.findByTestId('profile-photo'));
    expect(await screen.findByText(profileSetup.uploadFailed)).toBeTruthy();
    expect(screen.getByTestId('profile-continue')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('profile-photo-retry'));
    expect(await screen.findByTestId('profile-photo-done')).toBeTruthy();
    expect(avatar.upload).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByTestId('profile-photo-remove'));
    fireEvent.changeText(screen.getByTestId('profile-first'), 'Ana');
    fireEvent.press(screen.getByTestId('profile-continue'));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled());
    expect(api.updateProfile.mock.calls[0][0].avatarPath).toBeNull();
  });

  it('permission denied: explains and links to Settings', async () => {
    const avatar: AvatarDeps = {
      pick: jest.fn(async () => {
        throw new Error('permission');
      }),
      upload: jest.fn(),
    };
    setup('/profile-setup', {
      'profile-setup': () => <ProfileSetupScreen api={fakeApi()} avatar={avatar} />,
    });
    fireEvent.press(await screen.findByTestId('profile-photo'));
    expect(await screen.findByTestId('profile-photo-denied')).toBeTruthy();
    expect(screen.getByText(primer.photos.deniedTitle)).toBeTruthy();
    expect(screen.getByTestId('profile-photo-settings')).toBeTruthy();
  });

  it('server refusals and offline show the right copy and stay on the step', async () => {
    const api = fakeApi({
      updateProfile: jest
        .fn()
        .mockRejectedValueOnce(appError('INVALID:first_name'))
        .mockRejectedValueOnce(new TypeError('Network request failed')),
    });
    const { router } = setup('/profile-setup', {
      'profile-setup': () => <ProfileSetupScreen api={api} avatar={avatarNone} />,
    });
    fireEvent.changeText(await screen.findByTestId('profile-first'), 'Ana');
    fireEvent.press(screen.getByTestId('profile-continue'));
    expect(await screen.findByText(profileSetup.nameInvalid)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('profile-first'), 'Anna');
    // Past the 500 ms double-tap guard.
    act(() => {
      jest.advanceTimersByTime(600);
    });
    fireEvent.press(screen.getByTestId('profile-continue'));
    expect(await screen.findByText(errors.ERR_OFFLINE)).toBeTruthy();
    expect(router.getPathname()).toBe('/profile-setup');
  });
});

describe('P4-AUTH-09 A07 community rules', () => {
  it("can't continue unchecked; checked agrees to the current version", async () => {
    const api = fakeApi();
    const { router } = setup('/rules', {
      rules: () => <RulesScreen api={api} openLegal={jest.fn()} />,
    });
    expect(await screen.findByText(rules.title)).toBeTruthy();
    expect(screen.getByTestId('rules-agree')).toBeDisabled();
    fireEvent.press(screen.getByTestId('rules-agree'));
    expect(api.acceptRules).not.toHaveBeenCalled();
    const box = screen.getByTestId('rules-checkbox');
    fireEvent.press(box);
    expect(screen.getByRole('checkbox', { name: rules.agreeLabel })).toBeChecked();
    fireEvent.press(screen.getByTestId('rules-agree'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.acceptRules).toHaveBeenCalledWith('3');
  });

  it('the checkbox says it confirms 18+; the legal pages open', async () => {
    const openLegal = jest.fn();
    setup('/rules', { rules: () => <RulesScreen api={fakeApi()} openLegal={openLegal} /> });
    expect(await screen.findByText(rules.agreeLabel)).toBeTruthy();
    fireEvent.press(screen.getByTestId('rules-link-terms'));
    fireEvent.press(screen.getByTestId('rules-link-privacy'));
    fireEvent.press(screen.getByTestId('rules-link-rules'));
    expect(openLegal.mock.calls.map((c) => c[0])).toEqual(['terms', 'privacy', 'rules']);
  });

  it('never says "safe-exchange zone"', async () => {
    setup('/rules', { rules: () => <RulesScreen api={fakeApi()} openLegal={jest.fn()} /> });
    await screen.findByText(rules.title);
    expect(screen.queryByText(/safe-exchange/i)).toBeNull();
    expect(screen.getByText(/Meetup spot/)).toBeTruthy();
  });

  it('loading, then an error with retry when the config cannot load', async () => {
    const api = fakeApi({
      getAppConfig: jest
        .fn()
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce(config),
    });
    setup('/rules', { rules: () => <RulesScreen api={api} openLegal={jest.fn()} /> });
    expect(screen.getByTestId('screen-rules-loading')).toBeTruthy();
    expect(await screen.findByTestId('screen-rules-error')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(rules.title)).toBeTruthy();
  });

  it('an outdated version (rules changed meanwhile) refetches and asks again', async () => {
    const api = fakeApi({
      acceptRules: jest.fn().mockRejectedValueOnce(appError('INVALID:version')),
    });
    setup('/rules', { rules: () => <RulesScreen api={api} openLegal={jest.fn()} /> });
    fireEvent.press(await screen.findByTestId('rules-checkbox'));
    fireEvent.press(screen.getByTestId('rules-agree'));
    expect(await screen.findByTestId('rules-error')).toBeTruthy();
    await waitFor(() => expect(api.getAppConfig).toHaveBeenCalledTimes(2));
  });
});

describe('P4-AUTH-17 D10 Updated rules (E2E-22 app half)', () => {
  it('shows what changed and agrees to the new version', async () => {
    const api = fakeApi();
    const { router } = setup('/rules?updated=1', {
      rules: () => <RulesScreen api={api} openLegal={jest.fn()} />,
    });
    expect(await screen.findByText(rules.updatedTitle)).toBeTruthy();
    expect(screen.getByText(rules.whatChanged)).toBeTruthy();
    expect(screen.getByText('Fakes are now on the banned list.')).toBeTruthy();
    expect(screen.queryByText(rules.step)).toBeNull();
    fireEvent.press(screen.getByTestId('rules-checkbox'));
    fireEvent.press(screen.getByTestId('rules-agree'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.acceptRules).toHaveBeenCalledWith('3');
  });

  it('without a change list it still explains', async () => {
    const api = fakeApi({ getAppConfig: jest.fn(async () => ({ ...config, rulesChanges: [] })) });
    setup('/rules?updated=1', { rules: () => <RulesScreen api={api} openLegal={jest.fn()} /> });
    expect(await screen.findByText(rules.noChangeList)).toBeTruthy();
  });
});

describe('P4-AUTH-10 A08 notifications primer', () => {
  const perm = (status: OsPermission['status'], canAskAgain = true): OsPermission => ({
    status,
    canAskAgain,
  });
  function os(current: OsPermission, after: OsPermission = perm('granted')) {
    return { get: jest.fn(async () => current), request: jest.fn(async () => after) };
  }

  it('the OS prompt fires only on the button', async () => {
    const api = os(perm('undetermined'));
    const markAsked = jest.fn();
    const { router } = setup('/allow-notifications', {
      'allow-notifications': () => <NotificationsScreen os={api} markAsked={markAsked} />,
    });
    expect(await screen.findByTestId('screen-notifications')).toBeTruthy();
    expect(screen.getByText(primer.notifications.title)).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('notifications-turn-on'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(markAsked).toHaveBeenCalledTimes(1);
  });

  it('Not now never prompts and does not ask again', async () => {
    const api = os(perm('undetermined'));
    const markAsked = jest.fn();
    const { router } = setup('/allow-notifications', {
      'allow-notifications': () => <NotificationsScreen os={api} markAsked={markAsked} />,
    });
    fireEvent.press(await screen.findByTestId('notifications-not-now'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.request).not.toHaveBeenCalled();
    expect(markAsked).toHaveBeenCalledTimes(1);
  });

  it('a refusal at the OS prompt still moves on', async () => {
    const api = os(perm('undetermined'), perm('denied', false));
    const { router } = setup('/allow-notifications', {
      'allow-notifications': () => <NotificationsScreen os={api} markAsked={jest.fn()} />,
    });
    fireEvent.press(await screen.findByTestId('notifications-turn-on'));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });

  it('already granted skips the screen', async () => {
    const api = os(perm('granted'));
    const markAsked = jest.fn();
    const { router } = setup('/allow-notifications', {
      'allow-notifications': () => <NotificationsScreen os={api} markAsked={markAsked} />,
    });
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(markAsked).toHaveBeenCalledTimes(1);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('denied for good offers Settings, and Not now continues', async () => {
    const api = os(perm('denied', false));
    const { router } = setup('/allow-notifications', {
      'allow-notifications': () => <NotificationsScreen os={api} markAsked={jest.fn()} />,
    });
    expect(await screen.findByTestId('screen-notifications-denied')).toBeTruthy();
    expect(screen.getByText(primer.openSettings)).toBeTruthy();
    fireEvent.press(screen.getByText(primer.notifications.alternative));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(api.request).not.toHaveBeenCalled();
  });
});
