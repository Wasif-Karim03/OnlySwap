import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';

import { appFocusRing, Input } from '../src/components/Input';
import { otpCellState } from '../src/components/OTPInput';
import { TabBar } from '../src/components/TabBar';
import { SYSTEM_FONT_STACK, WebDateInput } from '../src/components/WebDateInput';
import type { AuthApi } from '../src/features/auth/api';
import { AuthStep, SIGNUP_STEPS } from '../src/features/auth/AuthStep';
import { EmailScreen } from '../src/features/auth/EmailScreen';
import { setLoginIntent } from '../src/features/auth/loginIntent';
import { VerifyScreen } from '../src/features/auth/VerifyScreen';
import type { FeedApi } from '../src/features/feed/api';
import type { Me } from '../src/features/me/api';
import { SettingsScreen } from '../src/features/me/SettingsScreens';
import type { AppNotification, NotificationsApi } from '../src/features/notifications/api';
import {
  notificationActor,
  notificationGlyph,
  notificationListingId,
} from '../src/features/notifications/logic';
import { NotificationsScreen } from '../src/features/notifications/NotificationsScreen';
import type { QuadApi, QuadPost } from '../src/features/quad/api';
import { cardMetaLine } from '../src/features/quad/components/QuadPostCard';
import { QuadScreen } from '../src/features/quad/QuadFeedScreen';
import { SafetyCenterScreen } from '../src/features/safety/SafetyScreens';
import { nav, quad, safety, settings, signIn, tabs } from '../src/strings/en';
import { lightTheme } from '../src/theme/themes';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date(2027, 2, 10, 12, 0);

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    { index: () => <Stub id="screen-index" />, ...routes },
    { initialUrl, wrapper },
  );
}

describe('DEC 90 web focus ring: one ring, not two', () => {
  it('fields that draw their own ink border opt out of the page outline on web only', () => {
    expect(appFocusRing('web')).toEqual({ dataSet: { focusRing: 'app' } });
    expect(appFocusRing('ios')).toEqual({});
    expect(appFocusRing('android')).toEqual({});
  });

  it('the page CSS turns the outline off only for those fields, and keeps it elsewhere', () => {
    const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');
    expect(html).toContain(':focus-visible {\n        outline: 2px solid Highlight !important;');
    expect(html).toMatch(/\[data-focus-ring='app'\]:focus-visible \{\s*outline: none !important;/);
  });

  it('Input on web carries the marker, draws no outline of its own, and still shows the ink border', () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      render(<Input label="School email" testID="field" />);
      const input = screen.getByTestId('field');
      expect(input.props.dataSet).toEqual({ focusRing: 'app' });
      expect(StyleSheet.flatten(input.props.style).outlineWidth).toBe(0);
      fireEvent(input, 'focus');
      // Walk up to the bordered box around the text field.
      let node = screen.getByTestId('field').parent;
      while (node && StyleSheet.flatten(node.props.style ?? {}).borderWidth !== 2) {
        node = node.parent;
      }
      expect(StyleSheet.flatten(node?.props.style).borderColor).toBe(lightTheme.colors.ink);
    } finally {
      restore.restore();
    }
  });

  it('inline label: the label sits inside the field', () => {
    render(<Input label="School email" inlineLabel testID="field" />);
    expect(screen.getByText('School email')).toBeTruthy();
    expect(screen.getByTestId('field').props.accessibilityLabel).toBe('School email');
  });
});

describe('DEC 90 web birthday field uses the system font', () => {
  it('no serif fallback: the system stack, the focus marker and no outline', () => {
    render(
      <WebDateInput
        value={new Date(2004, 4, 14)}
        max={new Date(2027, 0, 1)}
        label="Birthday"
        onChange={() => {}}
        testID="bday"
      />,
    );
    const input = screen.UNSAFE_root.findByType('input' as never);
    expect(input.props.style.fontFamily).toBe(SYSTEM_FONT_STACK);
    expect(input.props.style.fontFamily).not.toBe('inherit');
    expect(SYSTEM_FONT_STACK).toMatch(/^-apple-system/);
    expect(input.props['data-focus-ring']).toBe('app');
    expect(input.props.style.outline).toBe('none');
    expect(input.props.value).toBe('2004-05-14');
  });
});

describe('DEC 90 Getting in', () => {
  it('sign-up steps: back, "Step n of 5" and a thin bar', async () => {
    renderAt({ step: () => <AuthStep title="Title" step={2} testID="screen-step" /> }, '/step');
    expect(await screen.findByText(`Step 2 of ${SIGNUP_STEPS}`)).toBeTruthy();
    const bar = screen.getByTestId('auth-progress');
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 2 });
    expect(screen.getByRole('button', { name: nav.back })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Title' })).toBeTruthy();
  });

  it('no step: the plain nav bar', async () => {
    renderAt({ step: () => <AuthStep title="Title" testID="screen-step" /> }, '/step');
    expect(await screen.findByTestId('screen-step')).toBeTruthy();
    expect(screen.queryByTestId('auth-progress')).toBeNull();
  });

  const api = {
    lookupSchool: jest.fn(async () => ({
      kind: 'school',
      school: {
        campusId: 'c1',
        name: 'Demo University',
        shortName: 'Demo U',
        status: 'live',
        isReview: false,
      },
    })),
    sendCode: jest.fn(async () => {}),
    verifyCode: jest.fn(async () => ({})),
  } as unknown as AuthApi;

  it('email: step 1, label inside the field, the school as one line with a check, legal line', async () => {
    renderAt({ email: () => <EmailScreen api={api} /> }, '/email');
    expect(await screen.findByText('Step 1 of 5')).toBeTruthy();
    expect(screen.getByText(signIn.emailLabel)).toBeTruthy();
    expect(screen.getByTestId('email-legal').props.children).toBe(signIn.legal);
    fireEvent.changeText(screen.getByTestId('email-input'), 'maya@demo.edu');
    expect(await screen.findByText('Demo University')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('email-school').props.style).backgroundColor).toBe(
      undefined,
    );
  });

  it('email in sign-in mode: no step count', async () => {
    renderAt({ email: () => <EmailScreen api={api} /> }, '/email?mode=login');
    expect(await screen.findByTestId('screen-email')).toBeTruthy();
    expect(screen.queryByTestId('auth-step')).toBeNull();
  });

  it('verify: step 2, the email in the sentence, resend and Change email on one row, spam line', async () => {
    setLoginIntent(false);
    renderAt(
      { verify: () => <VerifyScreen api={api} now={() => Date.now()} /> },
      '/verify?email=maya%40demo.edu',
    );
    expect(await screen.findByText('Step 2 of 5')).toBeTruthy();
    expect(screen.getByTestId('verify-sent-to')).toHaveTextContent(
      'We sent a code to maya@demo.edu',
    );
    const row = within(screen.getByTestId('verify-links'));
    expect(row.getByTestId('verify-resend-timer')).toHaveTextContent(/^Resend in \d:\d\d$/);
    expect(row.getByTestId('verify-different-email')).toBeTruthy();
    expect(screen.getByText(signIn.spamHint)).toBeTruthy();
    expect(screen.getByText(signIn.differentEmail)).toBeTruthy();
  });

  it('code cells: filled, the active one, then empty', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => otpCellState(i, '482', false))).toEqual([
      'filled',
      'filled',
      'filled',
      'active',
      'empty',
      'empty',
    ]);
    expect(otpCellState(5, '482913', false)).toBe('filled');
    expect(otpCellState(0, '', true)).toBe('empty');
  });
});

describe('DEC 90 tab bar', () => {
  const items = [
    { key: 'discover', label: tabs.discover, icon: 'cards' as const },
    { key: 'quad', label: tabs.quad, icon: 'quad' as const },
    { key: 'sell', label: tabs.sell, icon: 'plus' as const, prominent: true },
    { key: 'inbox', label: tabs.inbox, icon: 'chat' as const, badge: 3 },
    { key: 'profile', label: tabs.profile, icon: 'user' as const },
  ];

  it('Sell is the accent rectangle in the middle, still named Sell, with no visible label', () => {
    const onSelect = jest.fn();
    render(
      <TabBar items={items} activeKey="discover" onSelect={onSelect} variant="ios" testID="tb" />,
    );
    const sell = screen.getByRole('tab', { name: tabs.sell });
    expect(sell).toBeTruthy();
    expect(screen.queryByText(tabs.sell)).toBeNull();
    const rect = StyleSheet.flatten(screen.getByTestId('tb-sell-prominent').props.style);
    expect(rect.backgroundColor).toBe(lightTheme.colors.accent);
    fireEvent.press(sell);
    expect(onSelect).toHaveBeenCalledWith('sell');
  });

  it('the Inbox badge still shows and is spoken', () => {
    render(<TabBar items={items} activeKey="discover" onSelect={() => {}} variant="ios" />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByRole('tab', { name: `${tabs.inbox}, 3 new` })).toBeTruthy();
  });

  it('white bar with a hairline; on is ink, off is ink3', () => {
    render(
      <TabBar items={items} activeKey="discover" onSelect={() => {}} variant="ios" testID="tb" />,
    );
    const bar = StyleSheet.flatten(screen.getByTestId('tb').props.style);
    expect(bar).toMatchObject({ backgroundColor: lightTheme.colors.bg, borderTopWidth: 1 });
    const color = (label: string) =>
      (StyleSheet.flatten(screen.getByText(label).props.style) as { color?: string }).color;
    expect(color(tabs.discover)).toBe(lightTheme.colors.ink);
    expect(color(tabs.profile)).toBe(lightTheme.colors.ink3);
  });
});

describe('DEC 90 Settings', () => {
  it('grey page, large title, icon tiles, Safety and Help, sign out and delete apart', async () => {
    renderAt(
      {
        settings: () => <SettingsScreen />,
        safety: () => <Stub id="screen-safety-stub" />,
        help: () => <Stub id="screen-help-stub" />,
      },
      '/settings',
    );
    expect(await screen.findByRole('header', { name: settings.title })).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('screen-settings').props.style)).toMatchObject({
      backgroundColor: lightTheme.colors.bg2,
    });
    expect(screen.getByText(settings.deleteAccount)).toBeTruthy();
    expect(screen.queryByText(settings.account.toUpperCase())).toBeNull();
    fireEvent.press(screen.getByText(settings.safety));
    expect(await screen.findByTestId('screen-safety-stub')).toBeTruthy();
  });
});

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: 1,
  type: 'message',
  grp: 'messages',
  title: 'Jordan K.',
  body: 'See you at 3.',
  data: {},
  read: false,
  created_at: new Date(2027, 2, 10, 11, 48).toISOString(),
  ...over,
});

describe('DEC 90 Notifications', () => {
  it('finds the person and the item', () => {
    expect(notificationActor(n({}))).toBe('Jordan');
    expect(
      notificationActor(n({ title: 'New offer on Mini fridge', body: 'Priya S. offered $55.' })),
    ).toBe('Priya');
    expect(
      notificationActor(
        n({
          title: 'Meetup today at 3:00 PM',
          body: 'Studio headphones with Jordan K. at Library steps.',
        }),
      ),
    ).toBe('Jordan');
    expect(
      notificationActor(n({ title: 'Price drop on Film camera', body: 'Now $60, was $75.' })),
    ).toBe(null);
    expect(notificationActor(n({ data: { actor_name: 'Sam' } }))).toBe('Sam');
    expect(notificationListingId(n({ data: { listing_id: 'l1' } }))).toBe('l1');
    expect(notificationListingId(n({ data: { chat_id: 'c1' } }))).toBe(null);
    expect(notificationGlyph({ grp: 'meetups', type: 'meetup_reminder' })).toBe('cal');
    expect(notificationGlyph({ grp: 'deals', type: 'rate_prompt' })).toBe('swap');
  });

  it('rows show the item photo, the person initial or a glyph, time below, unread dot', async () => {
    const items = [
      n({ id: 3 }),
      n({
        id: 2,
        type: 'price_drop',
        grp: 'price_drop',
        title: 'Price drop on Film camera',
        body: 'Now $60, was $75.',
        data: { listing_id: 'l1' },
        read: true,
      }),
      n({
        id: 1,
        type: 'rate_prompt',
        grp: 'deals',
        title: 'How did it go?',
        body: 'Leave a quick rating.',
        read: true,
      }),
    ];
    const api = {
      list: jest.fn(async () => ({ items, unread: 1 })),
      markRead: jest.fn(async () => {}),
    } as unknown as NotificationsApi;
    const listings = {
      getListing: jest.fn(async () => ({
        access: 'buyer',
        id: 'l1',
        photos: [{ path: 'a/full.webp', thumb_path: 'a/thumb.webp', blurhash: null }],
      })),
    } as unknown as Pick<FeedApi, 'getListing'>;
    renderAt(
      {
        notifications: () => (
          <NotificationsScreen
            api={api}
            listings={listings}
            mediaBase={() => 'https://m.test'}
            now={() => NOW}
            badge={jest.fn(async () => {})}
          />
        ),
      },
      '/notifications',
    );
    expect(await screen.findByRole('header', { name: 'Notifications' })).toBeTruthy();
    expect(await screen.findByTestId('notification-3-person')).toBeTruthy();
    expect(await screen.findByTestId('notification-2-photo')).toBeTruthy();
    expect(screen.getByTestId('notification-1-glyph')).toBeTruthy();
    expect(screen.getByTestId('notification-3-unread')).toBeTruthy();
    expect(screen.queryByTestId('notification-2-unread')).toBeNull();
    expect(screen.getAllByText('12m').length).toBeGreaterThan(0);
    await waitFor(() => expect(listings.getListing).toHaveBeenCalledWith('l1'));
  });
});

describe('DEC 90 Safety', () => {
  it('the 911 card first, then numbered tips, no campus police button without a number', async () => {
    const openUrl = jest.fn(async () => true);
    renderAt(
      { safety: () => <SafetyCenterScreen spots={async () => []} openUrl={openUrl} /> },
      '/safety',
    );
    expect(await screen.findByText(safety.emergencyTitle)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: safety.emergency }));
    expect(openUrl).toHaveBeenCalledWith('tel:911');
    expect(screen.queryByText(/campus police/i)).toBeNull();
    safety.tipItems.forEach((t, i) => {
      expect(screen.getByTestId(`safety-tip-${i}`).props.accessibilityLabel).toBe(
        `${i + 1}. ${t.title}. ${t.body}`,
      );
    });
  });
});

function quadPost(over: Partial<QuadPost> = {}): QuadPost {
  return {
    id: 'p1',
    kind: 'text',
    body: 'Outlets at every table now',
    photo_path: null,
    place: null,
    score: 10,
    reply_count: 2,
    status: 'live',
    replies_enabled: true,
    expires_at: null,
    created_at: new Date(2027, 2, 10, 10, 0).toISOString(),
    is_mine: false,
    my_vote: 0,
    poll: null,
    ...over,
  };
}

describe('DEC 90 The Quad', () => {
  it('one quiet line: kind for polls and check-ins, replies, time', () => {
    expect(cardMetaLine(quadPost({ kind: 'poll', reply_count: 31 }), '5h')).toBe(
      'Poll · 31 replies · 5h',
    );
    expect(cardMetaLine(quadPost({ reply_count: 1 }), '2h')).toBe('1 reply · 2h');
  });

  it('campus line, sort chips as tabs, lilac pinned card, votes left, Post pill clear of the list', async () => {
    const feed = jest.fn(async () => ({
      items: [quadPost()],
      next_cursor: null,
      pinned: { id: 'a1', type: 'info', title: 'Finals week.', body: 'Library open 24 h.' },
    }));
    const api = {
      status: jest.fn(async () => ({ enabled: true, rules_accepted: true })),
      feed,
      vote: jest.fn(async () => ({ score: 11, my_vote: 1 })),
    } as unknown as QuadApi;
    const loadMe = async () =>
      ({
        campus: { id: 'c', name: 'Demo University', short_name: 'Demo U', timezone: 'UTC' },
      }) as Me;
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} loadMe={loadMe} /> }, '/quad');
    expect(await screen.findByTestId('quad-post-p1')).toBeTruthy();
    expect(await screen.findByText('Anonymous · Demo U')).toBeTruthy();
    const pinned = screen.getByTestId('quad-pinned');
    expect(StyleSheet.flatten(pinned.props.style).backgroundColor).toBe(lightTheme.colors.lilacBg);
    expect(pinned.props.accessibilityLabel).toBe('Pinned: Finals week.. Library open 24 h.');
    // Votes come first (left) in the feed card.
    const card = screen.getByTestId('quad-post-p1');
    expect(card.props.children[0].props.testID).toBe('quad-post-p1-vote');
    // The Post pill is ink with a label, and the list leaves room for it.
    const post = screen.getByRole('button', { name: quad.newPost });
    expect(post).toHaveTextContent(quad.post);
    const list = screen.getByTestId('quad-feed');
    const pad = StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom as number;
    expect(pad).toBeGreaterThanOrEqual(lightTheme.size.buttonM + lightTheme.space.lg);
    fireEvent.press(screen.getByRole('tab', { name: quad.sorts.new }));
    await waitFor(() => expect(feed).toHaveBeenCalledWith('new', null));
  });

  it('without a campus it says anonymous to students', async () => {
    const api = {
      status: jest.fn(async () => ({ enabled: true, rules_accepted: true })),
      feed: jest.fn(async () => ({ items: [quadPost()], next_cursor: null, pinned: null })),
    } as unknown as QuadApi;
    renderAt(
      {
        quad: () => (
          <QuadScreen api={api} now={() => NOW} loadMe={async () => ({ campus: null }) as Me} />
        ),
      },
      '/quad',
    );
    expect(await screen.findByText(quad.subtitle)).toBeTruthy();
  });
});
