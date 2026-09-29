import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { MeetupsApi } from '../src/features/meetups/api';
import {
  countdown,
  dayOptions,
  meetupActions,
  shareUrl,
  timeOptions,
  whenLabel,
  type Meetup,
} from '../src/features/meetups/logic';
import { MeetupCard } from '../src/features/meetups/MeetupCard';
import { MeetupDayScreen } from '../src/features/meetups/MeetupDayScreen';
import { PlanMeetupScreen } from '../src/features/meetups/PlanMeetupScreen';
import type { Spot } from '../src/features/sell/logic';
import { meetup } from '../src/strings/en';

const NOW = new Date(2027, 2, 10, 12, 0); // local 12:00

const m = (patch: Partial<Meetup> = {}): Meetup => ({
  id: 'm1',
  chat_id: 'c1',
  status: 'confirmed',
  starts_at: new Date(2027, 2, 10, 16, 30).toISOString(),
  spot: { id: 's1', name: 'Rec Center lobby', lat: 40, lng: -83, police: true, hours: null },
  custom_place: null,
  proposed_by_me: false,
  confirmed_at: null,
  my_here_at: null,
  other_here_at: null,
  late_minutes: null,
  late_is_me: false,
  cancelled_by_me: false,
  cancel_reason: null,
  previous_starts_at: null,
  share_token: null,
  my_noshow_report: null,
  ...patch,
});

describe('meetup logic', () => {
  it('labels days and times', () => {
    expect(whenLabel(new Date(2027, 2, 10, 16, 30).toISOString(), NOW)).toBe('Today 4:30 PM');
    expect(whenLabel(new Date(2027, 2, 11, 10, 0).toISOString(), NOW)).toBe('Tomorrow 10:00 AM');
    expect(dayOptions(NOW)).toHaveLength(7);
    expect(dayOptions(NOW)[0]!.label).toBe(meetup.today);
  });

  it('offers half-hour slots from 8 AM to 10 PM, at least 15 minutes out', () => {
    const today = timeOptions(NOW, NOW);
    expect(today[0]).toEqual(new Date(2027, 2, 10, 12, 30));
    expect(today[today.length - 1]).toEqual(new Date(2027, 2, 10, 22, 0));
    expect(timeOptions(new Date(2027, 2, 11), NOW)).toHaveLength(29);
  });

  it('counts down and up', () => {
    expect(countdown(new Date(2027, 2, 10, 12, 25).toISOString(), NOW)).toBe('Starts in 25 min');
    expect(countdown(new Date(2027, 2, 10, 11, 55).toISOString(), NOW)).toBe('Started 5 min ago');
    expect(countdown(new Date(2027, 2, 10, 14, 5).toISOString(), NOW)).toBe('Starts in 2 h 5 min');
  });

  it('mirrors the server windows', () => {
    const start = new Date(2027, 2, 10, 16, 30);
    const at = (h: number, min: number) => new Date(2027, 2, 10, h, min);
    expect(meetupActions(m(), at(15, 29)).checkIn).toBe(false);
    expect(meetupActions(m(), at(15, 30)).checkIn).toBe(true);
    expect(meetupActions(m({ my_here_at: start.toISOString() }), at(16, 49)).noShow).toBe(false);
    expect(meetupActions(m({ my_here_at: start.toISOString() }), at(16, 50)).noShow).toBe(true);
    expect(
      meetupActions(
        m({ my_here_at: start.toISOString(), other_here_at: start.toISOString() }),
        at(17, 0),
      ).noShow,
    ).toBe(false);
    expect(meetupActions(m({ status: 'cancelled' }), at(12, 0)).cancel).toBe(false);
  });

  it('builds the share url', () => {
    expect(shareUrl('https://site/', 'abc')).toBe('https://site/m/abc');
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
      'chat/[id]/index': () => <Stub id="screen-chat" />,
      'chat/[id]/meetup': () => <Stub id="screen-plan" />,
      'meetup/[id]': () => <Stub id="screen-meetup" />,
      inbox: () => <Stub id="screen-inbox" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

function api(over: Partial<MeetupsApi> = {}): MeetupsApi {
  return {
    propose: jest.fn(async () => m({ status: 'proposed' })),
    confirm: jest.fn(async () => {}),
    checkIn: jest.fn(async () => {}),
    late: jest.fn(async () => {}),
    cancel: jest.fn(async () => {}),
    get: jest.fn(async () => m()),
    forChat: jest.fn(async () => null),
    share: jest.fn(async () => ({ token: 'tok123', expires_at: '' })),
    noShow: jest.fn(async () => {}),
    ...over,
  };
}

const spots: Spot[] = [
  {
    id: 's2',
    name: 'Library steps',
    description: null,
    hours: null,
    lat: 1,
    lng: 2,
    police: false,
    isDefault: true,
    sort: 1,
  },
  {
    id: 's1',
    name: 'Police station lobby',
    description: null,
    hours: null,
    lat: 3,
    lng: 4,
    police: true,
    isDefault: false,
    sort: 2,
  },
];

describe('E05 Plan the pickup', () => {
  it('lists police-designated first, opens directions, and suggests a time', async () => {
    const a = api();
    const openUrl = jest.fn(async () => {});
    render(
      {
        'chat/[id]/meetup': () => (
          <PlanMeetupScreen
            chatId="c1"
            api={a}
            spots={async () => spots}
            openUrl={openUrl}
            now={() => NOW}
          />
        ),
      },
      '/chat/c1/meetup',
    );
    await screen.findByText('Police station lobby');
    const rows = screen.getAllByRole('radio');
    expect(rows[0]!.props.accessibilityLabel ?? '').toContain('Police station lobby');
    fireEvent.press(screen.getByLabelText('Directions to Police station lobby'));
    expect(openUrl).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Police station lobby'));
    fireEvent.press(screen.getByText(meetup.tomorrow));
    fireEvent.press(screen.getByText('4:30 PM'));
    fireEvent.press(screen.getByTestId('meetup-suggest'));
    await waitFor(() =>
      expect(a.propose).toHaveBeenCalledWith('c1', new Date(2027, 2, 11, 16, 30), { spotId: 's1' }),
    );
  });

  it('a custom place works too', async () => {
    const a = api();
    render(
      {
        'chat/[id]/meetup': () => (
          <PlanMeetupScreen chatId="c1" api={a} spots={async () => []} now={() => NOW} />
        ),
      },
      '/chat/c1/meetup',
    );
    fireEvent.press(await screen.findByText(meetup.somewhereElse));
    fireEvent.changeText(screen.getByTestId('meetup-custom'), 'Morrill Tower lobby');
    fireEvent.press(screen.getByText('6:00 PM'));
    fireEvent.press(screen.getByTestId('meetup-suggest'));
    await waitFor(() =>
      expect(a.propose).toHaveBeenCalledWith('c1', new Date(2027, 2, 10, 18, 0), {
        custom: 'Morrill Tower lobby',
      }),
    );
  });
});

describe('P8-MEET-04 MeetupCard', () => {
  it('the other side accepts or suggests another', async () => {
    const a = api();
    const onChanged = jest.fn();
    render(
      {
        'chat/[id]/index': () => (
          <MeetupCard
            meetup={m({ status: 'proposed' })}
            chatId="c1"
            otherName="Aisha"
            api={a}
            onChanged={onChanged}
            now={() => NOW}
          />
        ),
      },
      '/chat/c1',
    );
    expect(
      await screen.findByText('Aisha suggested Today 4:30 PM at Rec Center lobby'),
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('meetup-accept'));
    await waitFor(() => expect(a.confirm).toHaveBeenCalledWith('m1'));
    expect(onChanged).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('meetup-suggest-another'));
    expect(await screen.findByTestId('screen-plan')).toBeTruthy();
  });

  it('a confirmed card opens the meetup', async () => {
    render(
      {
        'chat/[id]/index': () => (
          <MeetupCard
            meetup={m()}
            chatId="c1"
            otherName="Aisha"
            api={api()}
            onChanged={jest.fn()}
            now={() => NOW}
          />
        ),
      },
      '/chat/c1',
    );
    fireEvent.press(await screen.findByTestId('meetup-card-open'));
    expect(await screen.findByTestId('screen-meetup')).toBeTruthy();
  });
});

describe('E06 Meetup day', () => {
  const at = (h: number, min: number) => () => new Date(2027, 2, 10, h, min);

  it('before: countdown, share, cancel; no check-in yet', async () => {
    const a = api();
    const share = jest.fn(async () => {});
    render(
      {
        'meetup/[id]': () => (
          <MeetupDayScreen
            id="m1"
            otherName="Aisha"
            api={a}
            site={() => 'https://s'}
            share={share}
            now={at(12, 0)}
          />
        ),
      },
      '/meetup/m1',
    );
    expect(await screen.findByText('Starts in 4 h 30 min')).toBeTruthy();
    expect(screen.queryByTestId('meetup-here')).toBeNull();
    fireEvent.press(screen.getByTestId('meetup-share'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect((share.mock.calls[0] as unknown[])[0]).toMatchObject({
      message: expect.stringContaining('https://s/m/tok123'),
    });
    fireEvent.press(screen.getByTestId('meetup-cancel'));
    await screen.findByText(meetup.cancelTitle);
    const confirms = screen.getAllByText(meetup.cancelConfirm);
    fireEvent.press(confirms[confirms.length - 1]!);
    await waitFor(() => expect(a.cancel).toHaveBeenCalledWith('m1'));
  });

  it("at the time: I'm here and running late", async () => {
    const a = api();
    render(
      {
        'meetup/[id]': () => <MeetupDayScreen id="m1" otherName="Aisha" api={a} now={at(16, 25)} />,
      },
      '/meetup/m1',
    );
    fireEvent.press(await screen.findByTestId('meetup-here'));
    await waitFor(() => expect(a.checkIn).toHaveBeenCalledWith('m1'));
    fireEvent.press(screen.getByTestId('meetup-late'));
    fireEvent.press(await screen.findByText('10 min'));
    await waitFor(() => expect(a.late).toHaveBeenCalledWith('m1', 10));
  });

  it('20 minutes in without them: report a no-show', async () => {
    const a = api({
      get: jest.fn(async () => m({ my_here_at: new Date(2027, 2, 10, 16, 30).toISOString() })),
    });
    render(
      {
        'meetup/[id]': () => <MeetupDayScreen id="m1" otherName="Aisha" api={a} now={at(16, 55)} />,
      },
      '/meetup/m1',
    );
    fireEvent.press(await screen.findByTestId('meetup-noshow'));
    fireEvent.press(await screen.findByText(meetup.noShowConfirm, { exact: true }));
    await waitFor(() => expect(a.noShow).toHaveBeenCalledWith('m1'));
  });

  it('911 is always there', async () => {
    const openUrl = jest.fn(async () => {});
    render(
      {
        'meetup/[id]': () => (
          <MeetupDayScreen id="m1" api={api()} openUrl={openUrl} now={at(12, 0)} />
        ),
      },
      '/meetup/m1',
    );
    fireEvent.press(await screen.findByText(meetup.emergency));
    expect(openUrl).toHaveBeenCalledWith('tel:911');
  });
});
