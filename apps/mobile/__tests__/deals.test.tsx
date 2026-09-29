import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { ChatInfo } from '../src/features/chat/api';
import { maybeAskForReview, type DealsApi } from '../src/features/deals/api';
import { DidItSellScreen, MarkSoldScreen, RateScreen } from '../src/features/deals/DealScreens';
import { ratePhase, shouldAskForReview } from '../src/features/deals/logic';
import type { Offer } from '../src/features/offers/logic';
import { deal } from '../src/strings/en';

const NOW = new Date('2027-06-01T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('T-UNIT-DEAL-01 maybeAskForReview', () => {
  const base = {
    swaps: 3,
    accountCreatedAt: days(30),
    lastAskedAt: null,
    lastOutcome: 'done' as const,
  };

  it('asks after 3 swaps, 14 days in, 120 days since the last ask', () => {
    expect(shouldAskForReview(base, NOW)).toBe(true);
    expect(shouldAskForReview({ ...base, swaps: 2 }, NOW)).toBe(false);
    expect(shouldAskForReview({ ...base, accountCreatedAt: days(13) }, NOW)).toBe(false);
    expect(shouldAskForReview({ ...base, lastAskedAt: days(119) }, NOW)).toBe(false);
    expect(shouldAskForReview({ ...base, lastAskedAt: days(121) }, NOW)).toBe(true);
  });

  it('never after a fell-through deal or a no-show', () => {
    expect(shouldAskForReview({ ...base, lastOutcome: 'fell_through' }, NOW)).toBe(false);
    expect(shouldAskForReview({ ...base, lastOutcome: 'no_show' }, NOW)).toBe(false);
  });

  it('remembers when it asked and only asks when the OS can', async () => {
    const remember = jest.fn();
    const request = jest.fn(async () => {});
    const ctx = { swaps: 5, accountCreatedAt: days(60), lastOutcome: 'done' as const };
    await expect(
      maybeAskForReview(ctx, {
        now: () => NOW,
        lastAsked: () => undefined,
        remember,
        request,
        available: async () => true,
      }),
    ).resolves.toBe(true);
    expect(remember).toHaveBeenCalledWith(NOW.toISOString());
    expect(request).toHaveBeenCalled();
    await expect(
      maybeAskForReview(ctx, {
        now: () => NOW,
        lastAsked: () => undefined,
        remember,
        request,
        available: async () => false,
      }),
    ).resolves.toBe(false);
  });

  it('rate phases', () => {
    expect(ratePhase(undefined)).toBe('submit');
    expect(
      ratePhase({
        mine: { thumbs_up: true, tags: [], comment: null },
        theirs: null,
        theirs_waiting: false,
      }),
    ).toBe('waiting');
    expect(
      ratePhase({
        mine: { thumbs_up: true, tags: [], comment: null },
        theirs: { thumbs_up: true, tags: [], comment: null },
        theirs_waiting: false,
      }),
    ).toBe('revealed');
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
      'deal/[chatId]/rate': () => <Stub id="screen-rate" />,
      'listing/[id]/index': () => <Stub id="screen-listing" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

const api = (over: Partial<DealsApi> = {}): DealsApi => ({
  confirm: jest.fn(async () => {}),
  rate: jest.fn(async () => {}),
  myRating: jest.fn(async () => ({ mine: null, theirs: null, theirs_waiting: false })),
  markSold: jest.fn(async () => {}),
  ...over,
});
const chats = (role: 'buyer' | 'seller') => ({
  chat: jest.fn(
    async () =>
      ({
        id: 'c1',
        role,
        listing_title: 'Mini fridge',
        listing_id: 'l1',
        other: { id: 'u1', display_name: 'Aisha A.' },
      }) as unknown as ChatInfo,
  ),
});

describe('E07 Did it sell?', () => {
  it('done goes to rating', async () => {
    const a = api();
    render(
      { 'chat/[id]/deal': () => <DidItSellScreen chatId="c1" api={a} chats={chats('seller')} /> },
      '/chat/c1/deal',
    );
    expect(await screen.findByText(deal.didItSellTitle)).toBeTruthy();
    fireEvent.press(screen.getByTestId('deal-done'));
    await waitFor(() => expect(a.confirm).toHaveBeenCalledWith('c1', 'done'));
    expect(await screen.findByTestId('screen-rate')).toBeTruthy();
  });

  it('fell through asks first', async () => {
    const a = api();
    render(
      { 'chat/[id]/deal': () => <DidItSellScreen chatId="c1" api={a} chats={chats('buyer')} /> },
      '/chat/c1/deal',
    );
    expect(await screen.findByText(deal.didYouGetItTitle)).toBeTruthy();
    fireEvent.press(screen.getByTestId('deal-fell-through'));
    fireEvent.press(await screen.findByText(deal.fellThroughConfirm));
    await waitFor(() => expect(a.confirm).toHaveBeenCalledWith('c1', 'fell_through'));
  });
});

describe('F07 Mark sold', () => {
  it('picks the buyer from accepted offers, or someone off the app', async () => {
    const a = api();
    const offers = {
      listingOffers: jest.fn(
        async () =>
          [
            {
              id: 'o1',
              status: 'accepted',
              other: { id: 'b1', display_name: 'Ben B.', avatar_path: null },
            },
            {
              id: 'o2',
              status: 'declined',
              other: { id: 'b2', display_name: 'Cam C.', avatar_path: null },
            },
          ] as unknown as Offer[],
      ),
    };
    render(
      { 'listing/[id]/sold': () => <MarkSoldScreen listingId="l1" api={a} offers={offers} /> },
      '/listing/l1/sold',
    );
    fireEvent.press(await screen.findByText('Ben B.'));
    expect(screen.queryByText('Cam C.')).toBeNull();
    fireEvent.press(screen.getByTestId('mark-sold'));
    await waitFor(() => expect(a.markSold).toHaveBeenCalledWith('l1', 'b1'));
  });
});

describe('E08 Rate the swap', () => {
  it('submits thumbs, tags and a comment', async () => {
    const myRating = jest
      .fn()
      .mockResolvedValueOnce({ mine: null, theirs: null, theirs_waiting: false })
      .mockResolvedValue({
        mine: { thumbs_up: true, tags: ['on_time'], comment: null },
        theirs: null,
        theirs_waiting: false,
      });
    const a = api({ myRating });
    render(
      {
        'deal/[chatId]/rate': () => (
          <RateScreen
            chatId="c1"
            api={a}
            chats={chats('buyer')}
            people={{ getProfile: jest.fn() }}
            askForReview={jest.fn()}
          />
        ),
      },
      '/deal/c1/rate',
    );
    expect(await screen.findByText('How was swapping with Aisha A.?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('rate-up'));
    fireEvent.press(screen.getByText(deal.tags.on_time));
    fireEvent.press(screen.getByTestId('rate-submit'));
    await waitFor(() => expect(a.rate).toHaveBeenCalledWith('c1', true, ['on_time'], ''));
    expect(await screen.findByTestId('screen-rate-waiting')).toBeTruthy();
  });

  it('shows theirs once revealed', async () => {
    const a = api({
      myRating: jest.fn(async () => ({
        mine: { thumbs_up: true, tags: [], comment: null },
        theirs: { thumbs_up: true, tags: ['friendly' as const], comment: 'Smooth' },
        theirs_waiting: false,
      })),
    });
    render(
      {
        'deal/[chatId]/rate': () => (
          <RateScreen
            chatId="c1"
            api={a}
            chats={chats('buyer')}
            people={{ getProfile: jest.fn() }}
          />
        ),
      },
      '/deal/c1/rate',
    );
    expect(await screen.findByTestId('screen-rate-revealed')).toBeTruthy();
    expect(screen.getByText('Smooth')).toBeTruthy();
  });
});
