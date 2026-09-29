import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { appealTarget, type AccountStatus, type SafetyApi } from '../src/features/safety/api';
import {
  AccountStatusScreen,
  BlockedScreen,
  DeleteAccountScreen,
} from '../src/features/safety/AccountScreens';
import {
  HelpScreen,
  ReportUpdateScreen,
  SafetyCenterScreen,
} from '../src/features/safety/SafetyScreens';
import { safety } from '../src/strings/en';

const status = (patch: Partial<AccountStatus> = {}): AccountStatus => ({
  status: 'paused',
  reason: 'noshow',
  paused_until: '2027-03-17T12:00:00Z',
  strikes: [],
  noshows: [{ id: 'n1', status: 'confirmed', created_at: '' }],
  appeals: [],
  ...patch,
});

describe('appeal target', () => {
  it('suspension first, then no-shows, then strikes; nothing already appealed', () => {
    expect(appealTarget(status({ status: 'suspended' }), 'me')).toEqual({
      subject: 'suspension',
      id: 'me',
    });
    expect(appealTarget(status(), 'me')).toEqual({ subject: 'noshow', id: 'n1' });
    expect(
      appealTarget(
        status({
          appeals: [
            { id: 'a', subject_type: 'noshow', subject_id: 'n1', status: 'open', created_at: '' },
          ],
          strikes: [{ id: 's1', reason: null, expires_at: '', created_at: '' }],
        }),
        'me',
      ),
    ).toEqual({ subject: 'strike', id: 's1' });
    expect(appealTarget(status({ noshows: [] }), 'me')).toBeNull();
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
      inbox: () => <Stub id="screen-inbox" />,
      welcome: () => <Stub id="screen-welcome" />,
      help: () => <Stub id="screen-help-stub" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

function api(over: Partial<SafetyApi> = {}): SafetyApi {
  return {
    status: jest.fn(async () => status()),
    appeal: jest.fn(async () => {}),
    blocked: jest.fn(async () => [
      { id: 'u1', display_name: 'Ben B.', avatar_path: null, blocked_at: '' },
    ]),
    unblock: jest.fn(async () => {}),
    report: jest.fn(async () => ({
      id: 'r1',
      status: 'reviewed' as const,
      timeline: [
        { event: 'received', at: '2027-03-01' },
        { event: 'reviewed', at: '2027-03-02' },
      ],
    })),
    ...over,
  };
}

describe('X10 account status', () => {
  it('paused: open chats and appeal the no-show', async () => {
    const a = api();
    render(
      {
        'account-status': () => (
          <AccountStatusScreen api={a} auth={{ signOut: jest.fn(async () => {}) }} me="me" />
        ),
      },
      '/account-status',
    );
    expect(await screen.findByTestId('screen-account-status-paused')).toBeTruthy();
    fireEvent.press(screen.getByTestId('status-appeal'));
    fireEvent.changeText(await screen.findByTestId('appeal-body'), 'I was there at 4');
    fireEvent.press(screen.getByTestId('appeal-send'));
    await waitFor(() =>
      expect(a.appeal).toHaveBeenCalledWith('noshow', 'n1', 'mistake', 'I was there at 4'),
    );
    fireEvent.press(screen.getByTestId('status-open-chats'));
    expect(await screen.findByTestId('screen-inbox')).toBeTruthy();
  });

  it('banned: no appeal, sign out works', async () => {
    const signOut = jest.fn(async () => {});
    render(
      {
        'account-status': () => (
          <AccountStatusScreen
            api={api({ status: jest.fn(async () => status({ status: 'banned' })) })}
            auth={{ signOut }}
            me="me"
          />
        ),
      },
      '/account-status',
    );
    expect(await screen.findByText(safety.statusTitle.banned)).toBeTruthy();
    expect(screen.queryByTestId('status-appeal')).toBeNull();
    fireEvent.press(screen.getByText(safety.signOut));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
  });
});

describe('F13 blocked', () => {
  it('lists and unblocks', async () => {
    const a = api();
    render(
      { 'settings/blocked': () => <BlockedScreen api={a} mediaBase={() => 'http://m'} /> },
      '/settings/blocked',
    );
    fireEvent.press(await screen.findByText(safety.unblock));
    await waitFor(() => expect(a.unblock).toHaveBeenCalledWith('u1'));
    expect(await screen.findByTestId('blocked-empty')).toBeTruthy();
  });
});

describe('F16 delete account', () => {
  it('only after typing DELETE', async () => {
    const auth = { deleteAccount: jest.fn(async () => {}), signOut: jest.fn(async () => {}) };
    render({ 'settings/delete': () => <DeleteAccountScreen auth={auth} /> }, '/settings/delete');
    const button = await screen.findByTestId('delete-button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('delete-confirm'), 'DELETE');
    fireEvent.press(screen.getByTestId('delete-button'));
    await waitFor(() => expect(auth.deleteAccount).toHaveBeenCalled());
    expect(await screen.findByTestId('screen-welcome')).toBeTruthy();
  });
});

describe('E21 report update', () => {
  it('shows the generic outcome', async () => {
    render({ 'report/[id]': () => <ReportUpdateScreen id="r1" api={api()} /> }, '/report/r1');
    expect(await screen.findByTestId('report-reviewed')).toBeTruthy();
    expect(screen.getByText(safety.reportReviewedBody)).toBeTruthy();
  });
});

describe('F19 safety center and F20 help', () => {
  it('spots with directions, 911, banned items', async () => {
    const openUrl = jest.fn(async () => {});
    render(
      {
        safety: () => (
          <SafetyCenterScreen
            openUrl={openUrl}
            spots={async () => [
              {
                id: 's1',
                name: 'Police lobby',
                description: null,
                hours: null,
                lat: 1,
                lng: 2,
                police: true,
                isDefault: false,
                sort: 1,
              },
            ]}
          />
        ),
      },
      '/safety',
    );
    fireEvent.press(await screen.findByLabelText('Directions to Police lobby'));
    fireEvent.press(screen.getByTestId('safety-911'));
    expect(openUrl).toHaveBeenLastCalledWith('tel:911');
    expect(screen.getByText(`• ${safety.banned[0]}`)).toBeTruthy();
  });

  it('FAQ opens and the contact form sends', async () => {
    const auth = { sendSupportRequest: jest.fn(async () => {}) };
    render({ help: () => <HelpScreen auth={auth} email="a@osu.edu" /> }, '/help');
    fireEvent.press(await screen.findByText(safety.faq[0]!.q));
    expect(screen.getByText(safety.faq[0]!.a)).toBeTruthy();
    fireEvent.press(screen.getByText(safety.topics.bug));
    fireEvent.changeText(screen.getByTestId('help-body'), 'The chat is stuck');
    fireEvent.press(screen.getByTestId('help-send'));
    await waitFor(() =>
      expect(auth.sendSupportRequest).toHaveBeenCalledWith({
        email: 'a@osu.edu',
        topic: 'bug',
        body: 'The chat is stuck',
      }),
    );
    expect(await screen.findByTestId('help-sent')).toBeTruthy();
  });
});
