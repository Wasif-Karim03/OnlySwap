import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import TabsLayout from '../app/(tabs)/_layout';
import { canBlock, ReportSheet, reportReasons } from '../src/components/ReportSheet';
import { useToastStore } from '../src/components/Toast';
import { quadApi, type QuadApi, type QuadPost, type QuadReply } from '../src/features/quad/api';
import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import { QuadScreen } from '../src/features/quad/QuadFeedScreen';
import {
  QuadActivityScreen,
  QuadMineScreen,
  QuadMutedScreen,
} from '../src/features/quad/QuadMoreScreens';
import { QuadNewPostScreen } from '../src/features/quad/QuadNewPostScreen';
import { QuadThreadScreen } from '../src/features/quad/QuadThreadScreen';
import { errors, notificationsScreen, quad, report, safety, tabs } from '../src/strings/en';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const NOW = new Date('2026-10-04T12:00:00Z');

function post(over: Partial<QuadPost> = {}): QuadPost {
  return {
    id: 'p1',
    kind: 'text',
    body: 'The 3rd floor has outlets at every table now',
    photo_path: null,
    place: null,
    score: 10,
    reply_count: 2,
    status: 'live',
    replies_enabled: true,
    expires_at: null,
    created_at: '2026-10-04T11:00:00Z',
    is_mine: false,
    my_vote: 0,
    poll: null,
    ...over,
  };
}

function reply(over: Partial<QuadReply> = {}): QuadReply {
  return {
    id: 'r1',
    body: 'finally',
    alias_no: 1,
    is_op: false,
    is_mine: false,
    score: 3,
    status: 'live',
    created_at: '2026-10-04T11:30:00Z',
    my_vote: 0,
    ...over,
  };
}

function fakeApi(over: Partial<QuadApi> = {}): QuadApi {
  return {
    status: jest.fn(async () => ({ enabled: true, rules_accepted: true })),
    acceptRules: jest.fn(async () => {}),
    feed: jest.fn(async () => ({ items: [post()], next_cursor: null, pinned: null })),
    thread: jest.fn(async () => ({
      post: post(),
      replies: [reply({ id: 'r0', alias_no: 0, is_op: true, body: 'op here' }), reply()],
    })),
    createPost: jest.fn(async () => ({ id: 'p9', status: 'live' as const, reason: null })),
    createReply: jest.fn(async () => ({
      id: 'r9',
      status: 'live' as const,
      reason: null,
      alias_no: 2,
    })),
    vote: jest.fn(async (_t, _id, value) => ({ score: 10 + value, my_vote: value })),
    votePoll: jest.fn(async () => ({ options: [], total: 0, my_option: null })),
    hideAuthor: jest.fn(async () => {}),
    unhide: jest.fn(async () => {}),
    hides: jest.fn(async () => [
      { source_post_id: 'p5', excerpt: 'best dining hall', created_at: NOW.toISOString() },
    ]),
    mute: jest.fn(async () => {}),
    unmute: jest.fn(async () => {}),
    mutes: jest.fn(async () => ['finals']),
    setReplies: jest.fn(async () => {}),
    deletePost: jest.fn(async () => {}),
    mine: jest.fn(async () => ({ posts: [], replies: [] })),
    report: jest.fn(async () => {}),
    appeal: jest.fn(async () => {}),
    uploadPhoto: jest.fn(async (id) => `c/c1/quad/${id}/u_full.webp`),
    notifications: jest.fn(async () => ({ items: [], unread: 0 })),
    markRead: jest.fn(async () => {}),
    ...over,
  };
}

const score = () =>
  screen.getByTestId('quad-post-p1-vote-score', { includeHiddenElements: true }).props
    .children as string;

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function TabStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function renderAt(
  routes: Record<string, () => ReactNode>,
  initialUrl: string,
  stubs: Record<string, () => ReactNode> = {
    sell: () => <Stub id="screen-sell" />,
    discover: () => <Stub id="screen-discover" />,
  },
) {
  const qc = client();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      ...stubs,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

afterEach(() => {
  act(() => useToastStore.getState().dismiss());
});

describe('P10-QUAD-02 Quad tab', () => {
  const routes = {
    '(tabs)/_layout': TabsLayout,
    '(tabs)/discover/_layout': TabStack,
    '(tabs)/quad/_layout': TabStack,
    '(tabs)/sell/_layout': TabStack,
    '(tabs)/inbox/_layout': TabStack,
    '(tabs)/profile/_layout': TabStack,
    '(tabs)/discover/index': () => <Stub id="tab-discover" />,
    '(tabs)/quad/index': () => <Stub id="tab-quad" />,
    '(tabs)/sell/index': () => <Stub id="tab-sell" />,
    '(tabs)/inbox/index': () => <Stub id="tab-inbox" />,
    '(tabs)/profile/index': () => <Stub id="tab-profile" />,
  };
  const labels = () =>
    screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel as string | undefined);

  afterEach(() => jest.restoreAllMocks());

  it('is hidden when the campus has the Quad off', async () => {
    jest.spyOn(quadApi, 'status').mockResolvedValue({ enabled: false, rules_accepted: false });
    renderAt(routes, '/discover', {});
    await screen.findByTestId('tab-discover');
    await waitFor(() => expect(quadApi.status).toHaveBeenCalled());
    expect(labels()).toEqual([tabs.discover, tabs.sell, tabs.inbox, tabs.profile]);
  });

  it('is tab 2 when it is on (D1)', async () => {
    jest.spyOn(quadApi, 'status').mockResolvedValue({ enabled: true, rules_accepted: true });
    renderAt(routes, '/discover', {});
    await screen.findByTestId('tab-discover');
    await waitFor(() =>
      expect(labels()).toEqual([tabs.discover, tabs.quad, tabs.sell, tabs.inbox, tabs.profile]),
    );
    fireEvent.press(screen.getByRole('tab', { name: tabs.quad }));
    expect(await screen.findByTestId('tab-quad')).toBeTruthy();
  });
});

describe('Q01 Welcome', () => {
  it('needs the checkbox, then accept_quad_rules opens the feed', async () => {
    const api = fakeApi({
      status: jest.fn(async () => ({ enabled: true, rules_accepted: false })),
    });
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    expect(await screen.findByTestId('quad-welcome')).toBeTruthy();
    // The anonymity disclosure comes before the other rules.
    const all = screen.getAllByText(/./).map((n) => n.props.children as string);
    expect(all.indexOf(quad.ruleAnonTitle)).toBeLessThan(all.indexOf(quad.ruleNamesTitle));
    const enter = screen.getByRole('button', { name: quad.enter });
    expect(enter.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByRole('checkbox', { name: quad.agree }));
    fireEvent.press(screen.getByRole('button', { name: quad.enter }));
    await waitFor(() => expect(api.acceptRules).toHaveBeenCalled());
    expect(await screen.findByTestId('quad-post-p1')).toBeTruthy();
  });

  it('shows the off state when the campus has no Quad', async () => {
    const api = fakeApi({
      status: jest.fn(async () => ({ enabled: false, rules_accepted: false })),
    });
    renderAt({ quad: () => <QuadScreen api={api} /> }, '/quad');
    expect(await screen.findByText(quad.offTitle)).toBeTruthy();
  });
});

describe('Q02 Feed', () => {
  it('renders posts and the pinned announcement, switches sort', async () => {
    const api = fakeApi({
      feed: jest.fn(async () => ({
        items: [post(), post({ id: 'p2', status: 'held', is_mine: true, body: 'mine' })],
        next_cursor: null,
        pinned: { id: 'a1', type: 'info', title: 'Finals week', body: 'Library open 24 h' },
      })),
    });
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    expect(await screen.findByTestId('quad-post-p1')).toBeTruthy();
    expect(screen.getByTestId('quad-pinned')).toBeTruthy();
    expect(screen.getByText(quad.underReview)).toBeTruthy();
    expect(api.feed).toHaveBeenCalledWith('hot', null);
    fireEvent.press(screen.getByRole('tab', { name: quad.sorts.new }));
    await waitFor(() => expect(api.feed).toHaveBeenCalledWith('new', null));
  });

  it('day one: seeded prompts and a way to post', async () => {
    const api = fakeApi({
      feed: jest.fn(async () => ({ items: [], next_cursor: null, pinned: null })),
    });
    renderAt(
      {
        quad: () => <QuadScreen api={api} />,
        'quad/new': () => <Stub id="screen-new" />,
      },
      '/quad',
    );
    expect(await screen.findByTestId('quad-empty')).toBeTruthy();
    expect(screen.getByText(quad.prompts[0])).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: quad.emptyAction }));
    expect(await screen.findByTestId('screen-new')).toBeTruthy();
  });

  it('T-UNIT-QUAD-01 votes show at once and send the final value', async () => {
    const api = fakeApi();
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    await screen.findByTestId('quad-post-p1');
    fireEvent.press(screen.getByTestId('quad-post-p1-vote-up'));
    await waitFor(() => expect(score()).toBe('11'));
    expect(api.vote).not.toHaveBeenCalled();
    await waitFor(() => expect(api.vote).toHaveBeenCalledWith('post', 'p1', 1));
    expect(api.vote).toHaveBeenCalledTimes(1);
  });

  it('a failed vote reverts and says so', async () => {
    const api = fakeApi({
      vote: jest.fn(async () => {
        throw new Error('NOT_FOUND');
      }),
    });
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    await screen.findByTestId('quad-post-p1');
    fireEvent.press(screen.getByTestId('quad-post-p1-vote-down'));
    await waitFor(() => expect(score()).toBe('9'));
    await waitFor(() => expect(score()).toBe('10'));
    expect(useToastStore.getState().current?.message).toBe(quad.voteFailed);
  });

  it('own posts show the score without vote buttons', async () => {
    const api = fakeApi({
      feed: jest.fn(async () => ({
        items: [post({ is_mine: true })],
        next_cursor: null,
        pinned: null,
      })),
    });
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    await screen.findByTestId('quad-post-p1');
    expect(screen.queryByTestId('quad-post-p1-vote-up')).toBeNull();
  });

  it('polls vote inline', async () => {
    const poll = {
      options: [
        { id: 'o1', label: 'Pizza', votes: 1 },
        { id: 'o2', label: 'Tacos', votes: 1 },
      ],
      total: 2,
      my_option: null,
    };
    const api = fakeApi({
      feed: jest.fn(async () => ({
        items: [post({ kind: 'poll', poll })],
        next_cursor: null,
        pinned: null,
      })),
      votePoll: jest.fn(async () => ({ ...poll, total: 3, my_option: 'o2' })),
    });
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    fireEvent.press(await screen.findByRole('button', { name: 'Tacos' }));
    await waitFor(() => expect(api.votePoll).toHaveBeenCalledWith('p1', 'o2'));
    expect(await screen.findByText('3 votes')).toBeTruthy();
  });

  it('post options: hide this person', async () => {
    const api = fakeApi();
    renderAt({ quad: () => <QuadScreen api={api} now={() => NOW} /> }, '/quad');
    fireEvent.press(await screen.findByTestId('quad-post-p1-more'));
    fireEvent.press(await screen.findByRole('button', { name: quad.hideAuthor }));
    await waitFor(() => expect(api.hideAuthor).toHaveBeenCalledWith('p1'));
  });

  it('FEATURE_OFF from the feed shows the off state', async () => {
    const api = fakeApi({
      feed: jest.fn(async () => {
        throw new Error('FEATURE_OFF');
      }),
    });
    renderAt({ quad: () => <QuadScreen api={api} /> }, '/quad');
    expect(await screen.findByTestId('quad-off')).toBeTruthy();
  });
});

describe('Q05 Thread', () => {
  it('shows OP and letter aliases, sends a reply', async () => {
    const api = fakeApi();
    renderAt(
      { 'quad/[id]': () => <QuadThreadScreen id="p1" api={api} now={() => NOW} /> },
      '/quad/p1',
    );
    expect(await screen.findByTestId('quad-reply-r1')).toBeTruthy();
    expect(screen.getAllByText('OP').length).toBeGreaterThan(0);
    expect(screen.getByText('Anon A')).toBeTruthy();
    expect(screen.getByLabelText(quad.opLabel)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('quad-reply-input'), 'same here');
    fireEvent.press(screen.getByTestId('quad-reply-send'));
    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith('p1', 'same here'));
  });

  it('blocked reply explains why and keeps the text', async () => {
    const api = fakeApi({
      createReply: jest.fn(async () => ({
        id: null,
        status: 'blocked' as const,
        reason: 'pii:phone',
      })),
    });
    renderAt(
      { 'quad/[id]': () => <QuadThreadScreen id="p1" api={api} now={() => NOW} /> },
      '/quad/p1',
    );
    fireEvent.changeText(await screen.findByTestId('quad-reply-input'), 'text me 614 555 0142');
    fireEvent.press(screen.getByTestId('quad-reply-send'));
    expect(await screen.findByText(quad.blocked.phone)).toBeTruthy();
    expect(screen.getByTestId('quad-reply-input').props.value).toBe('text me 614 555 0142');
  });

  it('replies off: no composer, a note instead', async () => {
    const api = fakeApi({
      thread: jest.fn(async () => ({ post: post({ replies_enabled: false }), replies: [] })),
    });
    renderAt(
      { 'quad/[id]': () => <QuadThreadScreen id="p1" api={api} now={() => NOW} /> },
      '/quad/p1',
    );
    expect(await screen.findByText(quad.repliesOffNote)).toBeTruthy();
    expect(screen.queryByTestId('quad-reply-input')).toBeNull();
  });

  it('removed post: not available', async () => {
    const api = fakeApi({
      thread: jest.fn(async () => {
        throw new Error('NOT_FOUND');
      }),
    });
    renderAt({ 'quad/[id]': () => <QuadThreadScreen id="p1" api={api} /> }, '/quad/p1');
    expect(await screen.findByText(quad.unavailableTitle)).toBeTruthy();
  });

  it('report a reply with the Quad reasons', async () => {
    const api = fakeApi();
    renderAt(
      { 'quad/[id]': () => <QuadThreadScreen id="p1" api={api} now={() => NOW} /> },
      '/quad/p1',
    );
    fireEvent.press(await screen.findByTestId('quad-reply-r1-more'));
    fireEvent.press(await screen.findByRole('button', { name: quad.reportReply }));
    fireEvent.press(
      await screen.findByRole('radio', { name: report.reasons.quad.calls_out_student }),
    );
    fireEvent.press(screen.getByRole('button', { name: report.send }));
    await waitFor(() =>
      expect(api.report).toHaveBeenCalledWith('quad_reply', 'r1', 'calls_out_student', ''),
    );
  });

  it('own post: delete after confirming', async () => {
    const api = fakeApi({
      thread: jest.fn(async () => ({ post: post({ is_mine: true }), replies: [] })),
    });
    renderAt(
      {
        quad: () => <Stub id="screen-quad" />,
        'quad/[id]': () => <QuadThreadScreen id="p1" api={api} now={() => NOW} />,
      },
      '/quad/p1',
    );
    fireEvent.press(await screen.findByTestId('quad-thread-post-more'));
    fireEvent.press(await screen.findByRole('button', { name: quad.deletePost }));
    const dialog = await screen.findByTestId('quad-delete');
    fireEvent.press(within(dialog).getByRole('button', { name: quad.deletePost }));
    await waitFor(() => expect(api.deletePost).toHaveBeenCalledWith('p1'));
  });
});

describe('Q07 New post', () => {
  const routes = (api: QuadApi) => ({
    quad: () => <Stub id="screen-quad" />,
    'quad/new': () => <QuadNewPostScreen api={api} newId={() => 'new-id'} />,
  });

  it('Post stays off until there is text; live goes back to the feed', async () => {
    const api = fakeApi();
    const router = renderAt(routes(api), '/quad/new');
    const postBtn = await screen.findByRole('button', { name: quad.post });
    expect(postBtn.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('quad-body'), 'Free bagels at the Union');
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith({
        kind: 'text',
        body: 'Free bagels at the Union',
        post_id: 'new-id',
      }),
    );
    expect(await screen.findByTestId('screen-quad')).toBeTruthy();
    expect(router.getSearchParams()).toMatchObject({ sort: 'new' });
  });

  it('held: Sent for review with the reason', async () => {
    const api = fakeApi({
      createPost: jest.fn(async () => ({
        id: 'p9',
        status: 'held' as const,
        reason: 'names_student',
      })),
    });
    renderAt(routes(api), '/quad/new');
    fireEvent.changeText(await screen.findByTestId('quad-body'), 'rate jake r');
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    expect(await screen.findByText(quad.heldTitle)).toBeTruthy();
    expect(screen.getByText(quad.held.names_student)).toBeTruthy();
  });

  it('blocked for a phone number: reason and Make it a listing', async () => {
    const api = fakeApi({
      createPost: jest.fn(async () => ({
        id: null,
        status: 'blocked' as const,
        reason: 'pii:phone',
      })),
    });
    renderAt(routes(api), '/quad/new');
    fireEvent.changeText(await screen.findByTestId('quad-body'), 'text me at 614-555-0142');
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    expect(await screen.findByText(quad.blockedTitle)).toBeTruthy();
    expect(screen.getByText(quad.blocked.phone)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: quad.makeListing }));
    expect(await screen.findByTestId('screen-sell')).toBeTruthy();
  });

  it('blocked for a banned word: no listing button', async () => {
    const api = fakeApi({
      createPost: jest.fn(async () => ({
        id: null,
        status: 'blocked' as const,
        reason: 'term:vape',
      })),
    });
    renderAt(routes(api), '/quad/new');
    fireEvent.changeText(await screen.findByTestId('quad-body'), 'vape');
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    expect(await screen.findByText(quad.blockedTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: quad.makeListing })).toBeNull();
  });

  it('rate limited: friendly copy, stays on the draft', async () => {
    const api = fakeApi({
      createPost: jest.fn(async () => {
        throw new Error('RATE_LIMITED:quad_post');
      }),
    });
    renderAt(routes(api), '/quad/new');
    fireEvent.changeText(await screen.findByTestId('quad-body'), 'hello');
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    expect(await screen.findByText(errors.RATE_LIMITED)).toBeTruthy();
  });

  it('poll: 2 options needed, sent as a poll', async () => {
    const api = fakeApi();
    renderAt(routes(api), '/quad/new');
    fireEvent.press(await screen.findByRole('tab', { name: quad.modes.poll }));
    fireEvent.changeText(screen.getByTestId('quad-body'), 'Best late night food?');
    fireEvent.changeText(screen.getByTestId('quad-option-0'), 'Pizza');
    expect(screen.getByRole('button', { name: quad.post }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.changeText(screen.getByTestId('quad-option-1'), 'Tacos');
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'poll', poll: { options: ['Pizza', 'Tacos'] } }),
      ),
    );
  });

  it('check-in: place and vibe', async () => {
    const api = fakeApi();
    renderAt(routes(api), '/quad/new');
    fireEvent.press(await screen.findByRole('tab', { name: quad.modes.checkin }));
    fireEvent.changeText(screen.getByTestId('quad-place'), 'Library');
    fireEvent.press(screen.getByRole('checkbox', { name: quad.vibes.quiet }));
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith({
        kind: 'checkin',
        body: 'Quiet',
        place: 'Library',
        post_id: 'new-id',
      }),
    );
  });

  it('photo: uploads under the new post id and posts the key', async () => {
    const api = fakeApi();
    const os = {
      get: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
      request: jest.fn(),
    };
    renderAt(
      {
        quad: () => <Stub id="screen-quad" />,
        'quad/new': () => (
          <QuadNewPostScreen
            api={api}
            newId={() => 'new-id'}
            photosOs={os}
            pick={async () => [{ uri: 'file://a.jpg', width: 100, height: 100 }]}
            mediaBase={() => 'http://m'}
          />
        ),
      },
      '/quad/new',
    );
    fireEvent.press(await screen.findByRole('tab', { name: quad.modes.photo }));
    fireEvent.changeText(screen.getByTestId('quad-body'), 'The Oval right now');
    fireEvent.press(screen.getByTestId('quad-add-photo'));
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalled());
    expect((api.uploadPhoto as jest.Mock).mock.calls[0][0]).toBe('new-id');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: quad.post }).props.accessibilityState,
      ).toMatchObject({ disabled: false }),
    );
    fireEvent.press(screen.getByRole('button', { name: quad.post }));
    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith({
        kind: 'photo',
        body: 'The Oval right now',
        photo_path: 'c/c1/quad/new-id/u_full.webp',
        post_id: 'new-id',
      }),
    );
  });
});

describe('Q12 Your Quad', () => {
  it('shows statuses and appeals a removed post', async () => {
    const api = fakeApi({
      mine: jest.fn(async () => ({
        posts: [
          post({ id: 'a', status: 'live', is_mine: true }),
          post({ id: 'b', status: 'held', is_mine: true }),
          post({ id: 'c', status: 'hidden', is_mine: true }),
          post({ id: 'd', status: 'removed', is_mine: true }),
        ],
        replies: [{ ...reply({ is_mine: true }), post_id: 'p1', post_excerpt: 'outlets' }],
      })),
    });
    renderAt({ 'quad/mine': () => <QuadMineScreen api={api} now={() => NOW} /> }, '/quad/mine');
    expect(await screen.findByText(quad.status.live)).toBeTruthy();
    expect(screen.getByText(quad.status.held)).toBeTruthy();
    expect(screen.getByText(quad.status.hidden)).toBeTruthy();
    expect(screen.getByText(quad.status.removed)).toBeTruthy();
    expect(screen.queryByTestId('mine-appeal-a')).toBeNull();
    fireEvent.press(screen.getByTestId('mine-appeal-d'));
    fireEvent.press(await screen.findByRole('button', { name: safety.appealSend }));
    await waitFor(() => expect(api.appeal).toHaveBeenCalledWith('d', 'mistake', ''));
    fireEvent.press(screen.getByRole('tab', { name: quad.mineReplies }));
    expect(await screen.findByText('On: outlets')).toBeTruthy();
  });
});

describe('Q13 Quad activity', () => {
  it('keeps only quad notifications; tap marks read and opens the thread', async () => {
    const api = fakeApi({
      notifications: jest.fn(async () => ({
        items: [
          {
            id: 2,
            type: 'quad_reply',
            grp: 'quad',
            title: 'New reply on the Quad',
            body: 'Someone replied to your post.',
            data: { post_id: 'p1' },
            read: false,
            created_at: NOW.toISOString(),
          },
          {
            id: 1,
            type: 'offer_new',
            grp: 'offers',
            title: 'New offer',
            body: 'x',
            data: {},
            read: false,
            created_at: NOW.toISOString(),
          },
        ],
        unread: 2,
      })),
    });
    renderAt(
      {
        'quad/activity': () => <QuadActivityScreen api={api} now={() => NOW} />,
        'quad/[id]': () => <Stub id="screen-thread" />,
      },
      '/quad/activity',
    );
    expect(await screen.findByTestId('quad-activity-2')).toBeTruthy();
    expect(screen.queryByTestId('quad-activity-1')).toBeNull();
    fireEvent.press(screen.getByTestId('quad-activity-2'));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith([2]));
    expect(await screen.findByTestId('screen-thread')).toBeTruthy();
  });
});

describe('Q14 Muted', () => {
  it('unhide a person, unmute and mute words', async () => {
    const api = fakeApi();
    renderAt({ 'quad/muted': () => <QuadMutedScreen api={api} /> }, '/quad/muted');
    expect(await screen.findByText('Someone you hid, from: "best dining hall"')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unhide-p5'));
    await waitFor(() => expect(api.unhide).toHaveBeenCalledWith('p5'));
    fireEvent.press(await screen.findByRole('button', { name: 'finals, Unmute' }));
    await waitFor(() => expect(api.unmute).toHaveBeenCalledWith('finals'));
    fireEvent.changeText(screen.getByTestId('mute-input'), 'a');
    fireEvent.press(screen.getByTestId('mute-add'));
    expect(await screen.findByText(quad.keywordInvalid)).toBeTruthy();
    expect(api.mute).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('mute-input'), ' midterms ');
    // The button has a double-tap guard; the keyboard's submit adds too.
    fireEvent(screen.getByTestId('mute-input'), 'submitEditing');
    await waitFor(() => expect(api.mute).toHaveBeenCalledWith('midterms'));
  });
});

describe('Q09 ReportSheet for Quad targets', () => {
  it('Quad reasons are DATA_MODEL values; no block toggle', () => {
    const model = readFileSync(join(__dirname, '../../../docs/DATA_MODEL.md'), 'utf8');
    const check = model.match(/reason text not null check \(reason in \(([^)]*)\)/)![1]!;
    const allowed = new Set([...check.matchAll(/'(\w+)'/g)].map((m) => m[1]));
    for (const target of ['quad_post', 'quad_reply'] as const) {
      expect(reportReasons(target)).toEqual([
        'calls_out_student',
        'harassment',
        'threat',
        'hate',
        'sexual',
        'spam',
        'self_harm',
        'other',
      ]);
      for (const r of reportReasons(target)) expect(allowed.has(r)).toBe(true);
      expect(canBlock(target)).toBe(false);
    }
  });

  it('renders the Quad copy and the crisis line for self-harm', () => {
    render(<ReportSheet visible onClose={() => {}} target="quad_post" onSubmit={jest.fn()} />);
    expect(screen.getByRole('header', { name: report.titleQuadPost })).toBeTruthy();
    expect(screen.getByText(report.privateQuad)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByTestId('report-crisis')).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: report.reasons.quad.self_harm }));
    expect(screen.getByTestId('report-crisis')).toBeTruthy();
    expect(screen.getByText(report.crisisBody)).toBeTruthy();
  });
});

describe('F11 Quad replies setting', () => {
  const prefs = {
    offers: true,
    messages: true,
    meetups: true,
    saved_search: true,
    price_drop: true,
    tips: false,
    message_previews: false,
    quiet_start: '23:00',
    quiet_end: '08:00',
  };
  const os = { get: jest.fn(async () => ({ status: 'granted' }) as never), request: jest.fn() };
  const notif = (p: object) => ({
    list: jest.fn(),
    markRead: jest.fn(),
    prefs: jest.fn(async () => p as typeof prefs),
    updatePrefs: jest.fn(async (patch: object) => ({ ...prefs, ...p, ...patch })),
  });

  it('shows the opt-in toggle when the Quad is on and saves it', async () => {
    const api = notif({ ...prefs, quad_replies: false });
    renderAt(
      {
        'settings/notifications': () => (
          <NotificationSettingsScreen api={api} os={os} quad={fakeApi()} />
        ),
      },
      '/settings/notifications',
    );
    const toggle = await screen.findByRole('switch', { name: notificationsScreen.quadReplies });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(toggle);
    await waitFor(() => expect(api.updatePrefs).toHaveBeenCalledWith({ quad_replies: true }));
  });

  it('hidden when the Quad is off', async () => {
    const quadOff = fakeApi({
      status: jest.fn(async () => ({ enabled: false, rules_accepted: false })),
    });
    renderAt(
      {
        'settings/notifications': () => (
          <NotificationSettingsScreen
            api={notif({ ...prefs, quad_replies: false })}
            os={os}
            quad={quadOff}
          />
        ),
      },
      '/settings/notifications',
    );
    await screen.findByRole('switch', { name: notificationsScreen.tips });
    await waitFor(() => expect(quadOff.status).toHaveBeenCalled());
    expect(screen.queryByRole('switch', { name: notificationsScreen.quadReplies })).toBeNull();
  });
});
