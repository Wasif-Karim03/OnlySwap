import { hidesTabBar } from '../src/lib/tabBarVisibility';

describe('QA-M1 tab bar hides in pushed form flows', () => {
  it('shows on a tab whose stack has not been entered yet', () => {
    expect(hidesTabBar({ name: 'sell' })).toBe(false);
  });

  it('shows on the first Sell step', () => {
    expect(hidesTabBar({ name: 'sell', state: { index: 0, routes: [{ name: 'index' }] } })).toBe(
      false,
    );
  });

  it('hides on later Sell steps', () => {
    const state = { index: 1, routes: [{ name: 'index' }, { name: 'details' }] };
    expect(hidesTabBar({ name: 'sell', state })).toBe(true);
    expect(
      hidesTabBar({ name: 'sell', state: { routes: [{ name: 'index' }, { name: 'meetup' }] } }),
    ).toBe(true);
  });

  it('hides on Edit profile but not on My listings', () => {
    expect(
      hidesTabBar({
        name: 'profile',
        state: { index: 1, routes: [{ name: 'index' }, { name: 'edit' }] },
      }),
    ).toBe(true);
    expect(
      hidesTabBar({
        name: 'profile',
        state: { index: 1, routes: [{ name: 'index' }, { name: 'listings' }] },
      }),
    ).toBe(false);
  });

  it('ignores the same name on another tab', () => {
    expect(hidesTabBar({ name: 'feed', state: { index: 0, routes: [{ name: 'edit' }] } })).toBe(
      false,
    );
  });
});
