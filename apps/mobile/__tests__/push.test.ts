import { routeForNotification } from '../src/lib/push';

describe('P9-PUSH-02 tap routing', () => {
  it.each([
    [
      { type: 'offer_new', offer_id: 'o1', listing_id: 'l1' },
      { pathname: '/offer/[id]', params: { id: 'o1' } },
    ],
    [
      { type: 'message_new', chat_id: 'c1' },
      { pathname: '/chat/[id]', params: { id: 'c1' } },
    ],
    [
      { type: 'meetup_reminder', meetup_id: 'm1', chat_id: 'c1' },
      { pathname: '/meetup/[id]', params: { id: 'm1' } },
    ],
    [
      { type: 'deal_check', chat_id: 'c1' },
      { pathname: '/chat/[id]/deal', params: { id: 'c1' } },
    ],
    [
      { type: 'rate_prompt', chat_id: 'c1' },
      { pathname: '/deal/[chatId]/rate', params: { chatId: 'c1' } },
    ],
    [
      { type: 'price_drop', listing_id: 'l1' },
      { pathname: '/listing/[id]', params: { id: 'l1' } },
    ],
    [{ type: 'account_notice' }, '/notifications'],
  ])('%o', (data, href) => {
    expect(routeForNotification(data)).toEqual(href);
  });

  it('nothing to open without data', () => {
    expect(routeForNotification(null)).toBeNull();
  });
});
