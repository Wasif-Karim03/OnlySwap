import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import type { FeedApi } from '../src/features/feed/api';
import { movingOutLine, trustLine, type FeedItem } from '../src/features/feed/logic';
import type { OffersApi } from '../src/features/offers/api';
import { offerTitle } from '../src/features/offers/logic';
import { OfferSheetScreen } from '../src/features/offers/OfferSheetScreen';
import type { ProfileApi } from '../src/features/profiles/api';
import { draftCarry } from '../src/features/sell/posted';
import { emptyDraft } from '../src/features/sell/logic';

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderRouter(routes, { initialUrl, wrapper });
}

const seller = { id: 'u1', display_name: 'Jordan K.', moving_out_by: '2027-03-30' };
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'sale',
  status: 'active',
  title: `Item ${id}`,
  price_cents: 800,
  open_to_offers: false,
  seller,
  photos: [],
  access: 'buyer',
  ...over,
});

describe('T-UNIT-MOVING-01 moving out helpers (DEC 133)', () => {
  it('says the date on the trust line, and nothing without one', () => {
    expect(movingOutLine('2027-03-30')).toBe('Moving out by Mar 30');
    expect(movingOutLine(null)).toBeNull();
    const s = { ...seller, swaps_count: 0 } as unknown as FeedItem['seller'];
    expect(trustLine(s)).toBe('Verified student · Moving out by Mar 30');
  });

  it('a bundle offer is titled with the count', () => {
    const listing = { id: 'l1', title: 'Mini fridge' } as never;
    expect(offerTitle({ listing, bundle: [{} as never, {} as never] })).toBe(
      'Mini fridge + 2 more',
    );
    expect(offerTitle({ listing })).toBe('Mini fridge');
  });

  it('List another keeps spots, note, times and pick-up-by', () => {
    const d = {
      ...emptyDraft(),
      title: 'Lamp',
      spotIds: ['s1'],
      meetNote: 'Lobby',
      availability: ['evenings' as const],
      pickupBy: 'sunday' as const,
    };
    expect(draftCarry(d)).toEqual({
      spotIds: ['s1'],
      meetNote: 'Lobby',
      availability: ['evenings'],
      pickupBy: 'sunday',
    });
  });
});

describe('T-UNIT-BUNDLE-01 one offer for several items (DEC 133)', () => {
  const open = (main: ReturnType<typeof item>, others: ReturnType<typeof item>[]) => {
    const listings = { getListing: jest.fn(async () => main) } as unknown as Pick<
      FeedApi,
      'getListing'
    >;
    const profiles = {
      getProfile: jest.fn(async () => ({ id: 'u1', access: 'ok', listings: [main, ...others] })),
    } as unknown as Pick<ProfileApi, 'getProfile'>;
    const api = {
      make: jest.fn(async () => ({})),
      makeBundle: jest.fn(async () => ({})),
    } as unknown as OffersApi;
    renderAt(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen
            listingId={main.id}
            api={api}
            listings={listings}
            profiles={profiles}
            mediaBase={() => ''}
          />
        ),
      },
      `/listing/${main.id}/offer`,
    );
    return { api, profiles };
  };

  it('picks more items; the amount is for everything (no firm price)', async () => {
    const { api } = open(item('l1'), [
      item('l2', { price_cents: 1500 }),
      item('l3', { kind: 'free', price_cents: 0 }),
      item('l4', { status: 'hold' }),
    ]);
    fireEvent.press(await screen.findByTestId('offer-bundle-l2'));
    fireEvent.press(screen.getByTestId('offer-bundle-l3'));
    expect(screen.queryByTestId('offer-bundle-l4')).toBeNull();
    expect(screen.getByTestId('offer-bundle-ask').props.children).toBe('Asking $23 for 3 items');
    expect(screen.getByTestId('offer-amount').props.value).toBe('$23');
    fireEvent.changeText(screen.getByTestId('offer-amount'), '$20');
    fireEvent.press(screen.getByTestId('offer-send'));
    await waitFor(() =>
      expect(api.makeBundle).toHaveBeenCalledWith('l1', ['l2', 'l3'], 2000, '', []),
    );
    expect(api.make).not.toHaveBeenCalled();
  });

  it('no picker when the seller is not moving out', async () => {
    const { profiles } = open(item('l1', { seller: { ...seller, moving_out_by: null } }), [
      item('l2'),
    ]);
    expect(await screen.findByTestId('screen-offer')).toBeTruthy();
    expect(screen.queryByTestId('offer-bundle')).toBeNull();
    expect(profiles.getProfile).not.toHaveBeenCalled();
  });
});
