import { claimNotificationResponse } from '@/lib/push';

describe('T-UNIT-PUSH claimNotificationResponse', () => {
  it('lets the first tap of a notification through', () => {
    expect(claimNotificationResponse('notif-first')).toBe(true);
  });

  it('blocks a replay of the same tap on the next mount', () => {
    claimNotificationResponse('notif-replayed');

    expect(claimNotificationResponse('notif-replayed')).toBe(false);
  });

  it('lets a new tap through after an older one was handled', () => {
    claimNotificationResponse('notif-old');

    expect(claimNotificationResponse('notif-new')).toBe(true);
  });

  it('does not block a response with no identifier', () => {
    expect(claimNotificationResponse(undefined)).toBe(true);
  });
});
