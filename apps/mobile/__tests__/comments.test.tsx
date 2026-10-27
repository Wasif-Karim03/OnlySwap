import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { canBlock, reportReasons } from '../src/components/ReportSheet';
import { useToastStore } from '../src/components/Toast';
import type { CampusApi } from '../src/features/campus/api';
import { CampusFeedScreen } from '../src/features/campus/CampusFeedScreen';
import type { CampusItem, CampusPage } from '../src/features/campus/logic';
import type {
  CommentsApi,
  CommentsPage,
  FeedComment,
  LikeResult,
} from '../src/features/comments/api';
import { CommentsScreen } from '../src/features/comments/CommentsScreen';
import {
  addComment,
  addReply,
  allComments,
  blockedText,
  commentsText,
  createLikeSender,
  likesText,
  mergeReplies,
  moreReplies,
  patchComment,
  removeComment,
  toggleLike,
  viewRepliesText,
} from '../src/features/comments/logic';
import { CHANNELS, routeForNotification } from '../src/lib/push';
import { comments as copy } from '../src/strings/en';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2026-10-04T12:00:00Z');
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

function comment(id: string, over: Partial<FeedComment> = {}): FeedComment {
  return {
    id,
    listing_id: 'l1',
    parent_id: null,
    body: `Comment ${id}`,
    status: 'live',
    created_at: at(-60),
    author: { id: `u-${id}`, display_name: `Sam ${id}`, avatar_path: null },
    is_author_of_post: false,
    like_count: 0,
    liked: false,
    reply_count: 0,
    is_own: false,
    can_delete: false,
    ...over,
  };
}

function page(items: FeedComment[], over: Partial<CommentsPage> = {}): CommentsPage {
  return {
    items,
    next_cursor: null,
    comment_count: items.length,
    like_count: 3,
    liked: false,
    comments_enabled: true,
    can_comment: true,
    is_owner: false,
    title: 'Desk lamp',
    kind: 'sale',
    ...over,
  };
}

const data = (...pages: CommentsPage[]): InfiniteData<CommentsPage> => ({
  pages,
  pageParams: pages.map(() => null),
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------------------------
describe('T-UNIT-COMMENTS-01 likes', () => {
  it('flips the like and never counts below zero', () => {
    expect(toggleLike({ liked: false, count: 2 })).toEqual({ liked: true, count: 3 });
    expect(toggleLike({ liked: true, count: 3 })).toEqual({ liked: false, count: 2 });
    expect(toggleLike({ liked: true, count: 0 })).toEqual({ liked: false, count: 0 });
  });

  it('sends one call per post at a time and ends on the last choice', async () => {
    const calls: [string, boolean][] = [];
    const gates: ReturnType<typeof deferred<LikeResult>>[] = [];
    const settled = jest.fn();
    const send = createLikeSender((id, liked) => {
      calls.push([id, liked]);
      const d = deferred<LikeResult>();
      gates.push(d);
      return d.promise;
    }, settled);
    send('a', true);
    send('a', false);
    send('a', true);
    send('b', true);
    expect(calls).toEqual([
      ['a', true],
      ['b', true],
    ]);
    await act(async () => gates[0]!.resolve({ liked: true, like_count: 1 }));
    // The last choice was already sent: no second call for 'a'.
    expect(calls).toHaveLength(2);
    expect(settled).toHaveBeenCalledWith('a', { liked: true, like_count: 1 });
    send('a', false);
    expect(calls[2]).toEqual(['a', false]);
    await act(async () => gates[2]!.reject(new Error('offline')));
    expect(settled).toHaveBeenLastCalledWith('a', null);
  });

  it('sends the newest choice after the one in flight', async () => {
    const calls: boolean[] = [];
    const gates: ReturnType<typeof deferred<LikeResult>>[] = [];
    const settled = jest.fn();
    const send = createLikeSender((_id, liked) => {
      calls.push(liked);
      const d = deferred<LikeResult>();
      gates.push(d);
      return d.promise;
    }, settled);
    send('a', true);
    send('a', false);
    await act(async () => gates[0]!.resolve({ liked: true, like_count: 1 }));
    expect(calls).toEqual([true, false]);
    expect(settled).not.toHaveBeenCalled();
    await act(async () => gates[1]!.resolve({ liked: false, like_count: 0 }));
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith('a', { liked: false, like_count: 0 });
  });
});

describe('T-UNIT-COMMENTS-02 text', () => {
  it('counts likes, comments and replies', () => {
    expect(likesText(0)).toBe('');
    expect(likesText(1)).toBe(copy.likeCount1);
    expect(likesText(12)).toBe(copy.likeCount.replace('{n}', '12'));
    expect(commentsText(0)).toBe('');
    expect(commentsText(1)).toBe(copy.commentCount1);
    expect(commentsText(4)).toBe(copy.commentCount.replace('{n}', '4'));
    expect(viewRepliesText(1)).toBe(copy.viewReplies1);
    expect(viewRepliesText(3)).toBe(copy.viewReplies.replace('{n}', '3'));
  });

  it('explains why a comment was blocked', () => {
    expect(blockedText('pii:phone')).toBe(copy.blocked.phone);
    expect(blockedText('pii:email')).toBe(copy.blocked.email);
    expect(blockedText('url')).toBe(copy.blocked.url);
    expect(blockedText('term:venmo')).toBe(copy.blocked.term.replace('{term}', 'venmo'));
    expect(blockedText(null)).toBe(copy.blocked.other);
    expect(blockedText('pii:weird')).toBe(copy.blocked.other);
  });
});

describe('T-UNIT-COMMENTS-03 cache', () => {
  it('counts the replies not shown yet', () => {
    expect(moreReplies(comment('a', { reply_count: 5 }), 2)).toBe(3);
    expect(moreReplies(comment('a', { reply_count: 1 }), 2)).toBe(0);
  });

  it('merges replies once each, oldest first', () => {
    const r1 = comment('r1', { created_at: at(-50) });
    const r2 = comment('r2', { created_at: at(-40) });
    const mine = comment('r9', { created_at: at(-1) });
    expect(mergeReplies([r1, mine], [r1, r2]).map((r) => r.id)).toEqual(['r1', 'r2', 'r9']);
  });

  it('patches a comment or a reply wherever it is', () => {
    const d = data(page([comment('a', { replies: [comment('r1')] })]), page([comment('b')]));
    const liked = (c: FeedComment) => ({ ...c, liked: true });
    expect(patchComment(d, 'r1', liked).pages[0]!.items[0]!.replies![0]!.liked).toBe(true);
    expect(patchComment(d, 'b', liked).pages[1]!.items[0]!.liked).toBe(true);
  });

  it('adds a new comment first and a reply under its thread', () => {
    const d = data(page([comment('a', { reply_count: 1, replies: [comment('r1')] })]));
    const added = addComment(d, comment('n'));
    expect(allComments(added).map((c) => c.id)).toEqual(['n', 'a']);
    expect(added.pages[0]!.comment_count).toBe(2);
    // A held comment shows to its author but is not counted.
    expect(addComment(d, comment('h', { status: 'held' })).pages[0]!.comment_count).toBe(1);
    const replied = addReply(d, 'a', comment('r2', { parent_id: 'a', created_at: at(0) }));
    const top = replied.pages[0]!.items[0]!;
    expect(top.reply_count).toBe(2);
    expect(top.replies!.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(replied.pages[0]!.comment_count).toBe(2);
  });

  it('removes a reply, keeps a comment with replies as deleted, drops one without', () => {
    const d = data(
      page(
        [
          comment('a', { reply_count: 1, replies: [comment('r1')] }),
          comment('b'),
          comment('c', { status: 'held' }),
        ],
        { comment_count: 3 },
      ),
    );
    const noReply = removeComment(d, 'r1');
    expect(noReply.pages[0]!.items[0]!.replies).toEqual([]);
    expect(noReply.pages[0]!.items[0]!.reply_count).toBe(0);
    expect(noReply.pages[0]!.comment_count).toBe(2);
    const keep = removeComment(d, 'a').pages[0]!.items[0]!;
    expect(keep).toMatchObject({ status: 'deleted', body: null, author: null });
    const drop = removeComment(d, 'b');
    expect(allComments(drop).map((c) => c.id)).toEqual(['a', 'c']);
    expect(drop.pages[0]!.comment_count).toBe(2);
    // A held comment was never counted.
    expect(removeComment(d, 'c').pages[0]!.comment_count).toBe(3);
  });

  it('lists each comment once across pages', () => {
    expect(
      allComments(data(page([comment('a'), comment('b')]), page([comment('b'), comment('c')]))).map(
        (c) => c.id,
      ),
    ).toEqual(['a', 'b', 'c']);
    expect(allComments(undefined)).toEqual([]);
  });
});

describe('T-UNIT-COMMENTS-04 push and report', () => {
  it('opens the comments for comment and like notifications', () => {
    for (const type of ['listing_comment', 'comment_reply', 'comment_like', 'listing_like']) {
      expect(routeForNotification({ type, listing_id: 'l1', comment_id: 'c1' })).toEqual({
        pathname: '/listing/[id]/comments',
        params: { id: 'l1' },
      });
    }
  });

  it('has an Android channel for every group the server sends', () => {
    const ids = CHANNELS.map((c) => c.id);
    for (const grp of [
      'offers',
      'messages',
      'meetups',
      'alerts',
      'selling',
      'safety',
      'account',
      'campus',
      'quad',
      'comments',
    ]) {
      expect(ids).toContain(grp);
    }
  });

  it('reports a comment with the community reasons and offers a block', () => {
    expect(reportReasons('listing_comment')).toEqual(reportReasons('quad_post'));
    expect(canBlock('listing_comment')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderRouter(
    { index: () => <Stub id="screen-index" />, feed: () => <Stub id="screen-feed" />, ...routes },
    { initialUrl, wrapper },
  );
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => useToastStore.getState().dismiss());
});

function fakeApi(over: Partial<CommentsApi> = {}): CommentsApi {
  const top = comment('c1', {
    reply_count: 3,
    like_count: 2,
    replies: [
      comment('r1', { parent_id: 'c1', created_at: at(-50) }),
      comment('r2', { parent_id: 'c1', created_at: at(-40) }),
    ],
  });
  return {
    list: jest.fn(async () => page([top, comment('c2', { is_own: true, can_delete: true })])),
    replies: jest.fn(async () => ({
      items: [
        comment('r1', { parent_id: 'c1', created_at: at(-50) }),
        comment('r2', { parent_id: 'c1', created_at: at(-40) }),
        comment('r3', { parent_id: 'c1', created_at: at(-30) }),
      ],
      next_cursor: null,
    })),
    create: jest.fn(async ({ body, parentId }) => ({
      status: 'live' as const,
      reason: null,
      comment: comment('new', {
        body,
        parent_id: parentId,
        created_at: at(0),
        is_own: true,
        can_delete: true,
      }),
    })),
    likePost: jest.fn(async (_id, liked) => ({ liked, like_count: liked ? 4 : 3 })),
    likeComment: jest.fn(async (_id, liked) => ({ liked, like_count: liked ? 3 : 2 })),
    remove: jest.fn(async () => {}),
    setEnabled: jest.fn(async (_id, enabled) => enabled),
    report: jest.fn(async () => {}),
    block: jest.fn(async () => {}),
    ...over,
  };
}

const openComments = (api: CommentsApi) =>
  renderAt(
    {
      'listing/[id]/comments': () => (
        <CommentsScreen listingId="l1" api={api} now={() => NOW} mediaBase={() => 'http://m'} />
      ),
      'listing/[id]': () => <Stub id="screen-listing" />,
    },
    '/listing/l1/comments',
  );

describe('T-UNIT-COMMENTS-05 comments screen', () => {
  it('shows the post, threads with replies, and loads the rest of a thread', async () => {
    const api = fakeApi();
    openComments(api);
    expect(await screen.findByTestId('comment-c1')).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith('l1', 'top', null);
    expect(screen.getByText('Desk lamp')).toBeTruthy();
    expect(screen.getByText('Comment r2')).toBeTruthy();
    expect(screen.queryByText('Comment r3')).toBeNull();
    fireEvent.press(screen.getByTestId('comment-c1-more'));
    expect(await screen.findByText('Comment r3')).toBeTruthy();
    expect(api.replies).toHaveBeenCalledWith('c1', null);
    expect(screen.queryByTestId('comment-c1-more')).toBeNull();
  });

  it('switches to newest first', async () => {
    const api = fakeApi();
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.press(screen.getByTestId('comments-sort-new'));
    await waitFor(() => expect(api.list).toHaveBeenCalledWith('l1', 'new', null));
  });

  it('likes the post and a comment at once, then keeps the server count', async () => {
    const api = fakeApi();
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.press(screen.getByTestId('comments-like-post'));
    expect(await screen.findByText(copy.likeCount.replace('{n}', '4'))).toBeTruthy();
    await waitFor(() => expect(api.likePost).toHaveBeenCalledWith('l1', true));
    fireEvent.press(screen.getByTestId('comment-c1-like'));
    expect(await within(screen.getByTestId('comment-c1-likes')).findByText('3')).toBeTruthy();
    await waitFor(() => expect(api.likeComment).toHaveBeenCalledWith('c1', true));
  });

  it('rolls back a failed like with a toast', async () => {
    const api = fakeApi({
      likeComment: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.press(screen.getByTestId('comment-c1-like'));
    await waitFor(() => expect(useToastStore.getState().current?.message).toBe(copy.likeFailed));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('posts a comment and a reply with one client id each', async () => {
    const api = fakeApi();
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.changeText(screen.getByTestId('comments-input'), '  Still have it?  ');
    fireEvent.press(screen.getByTestId('comments-send'));
    expect(await screen.findByText('Still have it?')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('comments-input').props.value).toBe(''));
    const first = (api.create as jest.Mock).mock.calls[0][0];
    expect(first).toMatchObject({ listingId: 'l1', body: 'Still have it?', parentId: null });
    expect(first.clientId).toMatch(/^[0-9a-f-]{36}$/);

    fireEvent.press(screen.getByTestId('comment-r1-reply'));
    expect(await screen.findByTestId('comments-replying')).toBeTruthy();
    expect(screen.getByText(copy.replyingTo.replace('{name}', 'Sam r1'))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('comments-input'), 'Yes');
    // The send button ignores a second tap within the double-tap guard.
    const later = Date.now() + 5_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.press(screen.getByTestId('comments-send'));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    const second = (api.create as jest.Mock).mock.calls[1][0];
    expect(second).toMatchObject({ body: 'Yes', parentId: 'r1' });
    expect(second.clientId).not.toBe(first.clientId);
    await waitFor(() => expect(screen.queryByTestId('comments-replying')).toBeNull());
  });

  it('keeps the words and explains a blocked comment', async () => {
    const api = fakeApi({
      create: jest.fn(async () => ({
        status: 'blocked' as const,
        reason: 'pii:phone',
        comment: null,
      })),
    });
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.changeText(screen.getByTestId('comments-input'), 'text me 614 555 0100');
    fireEvent.press(screen.getByTestId('comments-send'));
    expect(await screen.findByText(copy.blocked.phone)).toBeTruthy();
    expect(screen.getByTestId('comments-input').props.value).toBe('text me 614 555 0100');
  });

  it('tells you a held comment is waiting for review', async () => {
    const api = fakeApi({
      create: jest.fn(async ({ body }) => ({
        status: 'held' as const,
        reason: 'term',
        comment: comment('h1', { body, status: 'held', is_own: true, created_at: at(0) }),
      })),
    });
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.changeText(screen.getByTestId('comments-input'), 'hmm');
    fireEvent.press(screen.getByTestId('comments-send'));
    await waitFor(() => expect(useToastStore.getState().current?.message).toBe(copy.heldToast));
    expect(screen.getByText(copy.held)).toBeTruthy();
  });

  it('deletes your own comment after a confirm', async () => {
    const api = fakeApi();
    openComments(api);
    await screen.findByTestId('comment-c2');
    fireEvent(screen.getByTestId('comment-c2-bubble'), 'longPress');
    fireEvent.press(await screen.findByRole('button', { name: copy.delete }));
    const dialog = await screen.findByTestId('comments-delete');
    fireEvent.press(within(dialog).getByRole('button', { name: copy.delete }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('c2'));
    await waitFor(() => expect(screen.queryByTestId('comment-c2')).toBeNull());
  });

  it('reports someone else and does not offer delete', async () => {
    const api = fakeApi();
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent(screen.getByTestId('comment-c1-bubble'), 'longPress');
    expect(await screen.findByRole('button', { name: copy.report })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.delete })).toBeNull();
  });

  it('lets the post author turn comments off', async () => {
    let enabled = true;
    const api = fakeApi({
      list: jest.fn(async () =>
        page([comment('c1')], { is_owner: true, comments_enabled: enabled, can_comment: enabled }),
      ),
      setEnabled: jest.fn(async (_id, on) => (enabled = on)),
    });
    openComments(api);
    await screen.findByTestId('comment-c1');
    fireEvent.press(screen.getByTestId('comments-post-options'));
    fireEvent.press(await screen.findByRole('button', { name: copy.turnOff }));
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith('l1', false));
    expect(await screen.findByTestId('comments-closed')).toBeTruthy();
    expect(screen.queryByTestId('comments-input')).toBeNull();
  });

  it('shows a read-only note when comments are off', async () => {
    const api = fakeApi({
      list: jest.fn(async () => page([], { comments_enabled: false, can_comment: false })),
    });
    openComments(api);
    expect(await screen.findByText(copy.offNote)).toBeTruthy();
    expect(screen.queryByTestId('comments-empty')).toBeNull();
    expect(screen.queryByTestId('comments-input')).toBeNull();
    expect(screen.queryByTestId('comments-post-options')).toBeNull();
  });

  it('says the post is gone', async () => {
    const api = fakeApi({
      list: jest.fn(async () => {
        throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
      }),
    });
    openComments(api);
    expect(await screen.findByTestId('comments-gone')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe('T-UNIT-COMMENTS-06 Feed like and comment', () => {
  function item(id: string, over: Partial<CampusItem> = {}): CampusItem {
    return {
      id,
      kind: 'sale',
      status: 'active',
      title: `Item ${id}`,
      description: null,
      price_cents: 2500,
      condition: 'good',
      category_id: 3,
      open_to_offers: true,
      meet_spot_ids: [],
      meet_note: null,
      availability: [],
      save_count: 0,
      view_count: 0,
      offer_count: 0,
      bumped_at: at(-30),
      created_at: at(-30),
      expires_at: null,
      is_own: false,
      saved: false,
      watching: false,
      seller: {
        id: 's1',
        display_name: 'Chris A.',
        avatar_path: null,
        year: null,
        created_at: null,
      },
      photos: [],
      wanted_max_cents: null,
      wanted_ref: null,
      place: null,
      like_count: 1,
      comment_count: 2,
      comments_enabled: true,
      liked: false,
      ...over,
    };
  }
  const feedPage = (items: CampusItem[]): CampusPage => ({
    items,
    next_cursor: null,
    day_one: false,
    active_listings: 40,
    founding: { limit: 50, left: 0, mine: false },
  });

  const openFeed = (likes: Pick<CommentsApi, 'likePost'>) => {
    const api: CampusApi = {
      feed: jest.fn(async () =>
        feedPage([item('p1'), item('w1', { kind: 'wanted', wanted_max_cents: 4000 })]),
      ),
    };
    return renderAt(
      {
        feed: () => (
          <CampusFeedScreen
            api={api}
            likes={likes}
            now={() => NOW}
            mediaBase={() => 'http://m'}
            loadMe={async () => ({ id: 'me' }) as never}
          />
        ),
        'listing/[id]/comments': () => <Stub id="screen-comments" />,
        'listing/[id]': () => <Stub id="screen-listing" />,
      },
      '/feed',
    );
  };

  it('likes a post at once and keeps the server count', async () => {
    const likes = {
      likePost: jest.fn(async (_id: string, liked: boolean) => ({ liked, like_count: 7 })),
    };
    openFeed(likes);
    fireEvent.press(await screen.findByTestId('campus-item-p1-like'));
    await waitFor(() =>
      expect(screen.getByTestId('campus-item-p1-like').props.accessibilityState).toMatchObject({
        selected: true,
      }),
    );
    await waitFor(() => expect(likes.likePost).toHaveBeenCalledWith('p1', true));
    expect(await screen.findByText(copy.likeCount.replace('{n}', '7'))).toBeTruthy();
  });

  it('opens the comments from a post and from a Wanted card', async () => {
    openFeed({ likePost: jest.fn() });
    fireEvent.press(await screen.findByTestId('campus-item-p1-comment'));
    expect(await screen.findByTestId('screen-comments')).toBeTruthy();
  });

  it('has Like and Comment on Wanted cards', async () => {
    openFeed({ likePost: jest.fn() });
    expect(await screen.findByTestId('campus-item-w1-social-like')).toBeTruthy();
    fireEvent.press(screen.getByTestId('campus-item-w1-social-comment'));
    expect(await screen.findByTestId('screen-comments')).toBeTruthy();
  });
});
