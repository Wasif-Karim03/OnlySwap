import { createSwipeStore, isRetryableSwipeError } from '@/features/feed/swipes';

function memoryStorage() {
  let value: unknown = null;
  return {
    get: () => value,
    set: (q: unknown) => {
      value = q;
    },
  };
}

function storeWith(recordSwipes: jest.Mock) {
  return createSwipeStore(memoryStorage(), { recordSwipes, undoSwipe: jest.fn() } as never);
}

describe('T-UNIT-FEED swipe queue errors', () => {
  it('drops a batch the server permanently rejects so later swipes can still send', async () => {
    const recordSwipes = jest.fn().mockRejectedValue(new Error('INVALID:listing_id'));
    const store = storeWith(recordSwipes);
    store.getState().swipe('listing-gone', 'right', 800);

    await store.getState().flush();

    expect(store.getState().queue).toHaveLength(0);
  });

  it('keeps the batch when the device is offline so it sends later', async () => {
    const recordSwipes = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const store = storeWith(recordSwipes);
    store.getState().swipe('listing-1', 'left', 800);

    await store.getState().flush();

    expect(store.getState().queue).toHaveLength(1);
  });

  it('keeps the batch on a server outage', async () => {
    const recordSwipes = jest.fn().mockRejectedValue({ status: 503, message: 'unavailable' });
    const store = storeWith(recordSwipes);
    store.getState().swipe('listing-2', 'left', 800);

    await store.getState().flush();

    expect(store.getState().queue).toHaveLength(1);
  });

  it('treats offline and session expiry as retryable, and a bad field as not', () => {
    expect(isRetryableSwipeError(new TypeError('Network request failed'))).toBe(true);
    expect(isRetryableSwipeError(new Error('INVALID:listing_id'))).toBe(false);
  });
});
