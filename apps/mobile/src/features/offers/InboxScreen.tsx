import { motion } from '@onlyswap/tokens';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { useUserChannel, type RealtimeSource } from '@/lib/realtime';
import {
  chat as chatCopy,
  intlLocale,
  notificationsScreen as notifCopy,
  offers as copy,
} from '@/strings';
import { LAYOUT, useLayout } from '@/theme/layout';

import { ChatScreen } from '../chat/ChatScreen';
import { mediaUrl } from '../sell/logic';
import { offersApi, type OffersApi } from './api';
import { DealAvatar } from './DealAvatar';
import {
  expirySpan,
  inboxRows,
  money,
  needsYouCounts,
  offerStatusShort,
  offerTitle,
  shortAgo,
  type InboxRow,
  type InboxSide,
} from './logic';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { a11yState } from '@/lib/a11y';

export const inboxKey = ['inbox'] as const;

const defaultChatPane = (id: string) => <ChatScreen key={id} id={id} pane />;

/**
 * E01 Inbox (P7-OFF-03; DEC 90): Buying and Selling, each with what needs you
 * first (an offer waiting on your answer, a chat with unread messages) and the
 * rest under Earlier. A row is the item photo with the other person's initial
 * on its corner, their name, the item and where the deal stands in plain
 * words. Live while focused. On a wide iPad window it is two panes (board N6):
 * the list on the left and the open chat on the right, the way Messages works.
 */
/** Realtime pings closer together than this become one inbox refetch. */
const PING_DEBOUNCE_MS = 300;
/** Between the time and "Muted" on a row, and before the time left on an offer. */
const META_SEPARATOR = ' · ';

export function InboxScreen({
  api = offersApi,
  realtime,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  chatPane = defaultChatPane,
  now = () => new Date(),
}: {
  api?: OffersApi;
  realtime?: RealtimeSource;
  mediaBase?: () => string;
  /** Right pane on wide windows; tests pass a stub. */
  chatPane?: (id: string) => ReactNode;
  now?: () => Date;
}) {
  const router = useRouter();
  const twoPane = useLayout().wide;
  const [picked, setPicked] = useState<InboxSide | null>(null);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const query = useQuery({ queryKey: inboxKey, queryFn: () => api.inbox() });
  // A burst of pings (several messages in a row) refetches once (E-20).
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pingTimer.current) clearTimeout(pingTimer.current);
    },
    [],
  );
  useUserChannel(
    'inbox',
    () => {
      if (pingTimer.current) clearTimeout(pingTimer.current);
      pingTimer.current = setTimeout(() => {
        pingTimer.current = null;
        void query.refetch();
      }, PING_DEBOUNCE_MS);
    },
    realtime,
  );
  // Also refresh whenever the tab comes back into view, in case a ping was missed.
  const refetchInbox = query.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchInbox();
    }, [refetchInbox]),
  );
  const base = mediaBase();
  const clock = now();
  const counts = query.data ? needsYouCounts(query.data) : { buying: 0, selling: 0 };
  // Open on the side that needs you (Buying when both or neither do), then
  // keep it: a realtime refresh never flips the side under the reader.
  const opening: InboxSide = counts.buying === 0 && counts.selling > 0 ? 'selling' : 'buying';
  const side: InboxSide = picked ?? opening;
  // Settled during render (React's "adjust state on change" pattern), once.
  if (picked === null && query.data !== undefined) setPicked(opening);

  const row = (r: InboxRow) => {
    const other = r.kind === 'offer' ? r.offer.other : r.chat.other;
    const name = other?.display_name ?? copy.deletedUser;
    const avatar = other?.avatar_path ? mediaUrl(base, other.avatar_path) : null;
    const title = r.kind === 'offer' ? offerTitle(r.offer) : r.chat.listing_title;
    const thumb =
      r.kind === 'offer' ? (r.offer.listing?.thumb_path ?? null) : r.chat.listing_thumb_path;
    let status: string;
    if (r.kind === 'offer') status = offerStatusShort(r.offer);
    else {
      const c = r.chat;
      const lastText =
        c.last_message?.body || (c.last_message?.kind === 'photo' ? chatCopy.photoPreview : '');
      status =
        lastText && c.last_message
          ? `${c.last_message.mine ? copy.you : ''}${lastText}`
          : fill(copy.inboxStatus.accepted, { amount: money(c.agreed_cents) });
    }
    const when = shortAgo(r.at, clock, intlLocale);
    // An open offer waiting on me says how long is left (static, from expires_at).
    const span =
      r.kind === 'offer' && r.needsYou ? expirySpan(r.offer.expires_at, clock, 'short') : null;
    const timeLeft = span ? fill(copy.timeLeft, { time: span }) : null;
    const muted = r.kind === 'chat' && r.chat.muted ? copy.muted : null;
    const meta = [when, muted].filter(Boolean).join(META_SEPARATOR);
    const open = twoPane && r.kind === 'chat' && openChat === r.id;
    const label = [name, title, status, timeLeft, when, muted, r.needsYou ? copy.unread : null]
      .filter(Boolean)
      .join(', ');
    return (
      <Tappable
        key={`${r.kind}-${r.id}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...a11yState(twoPane && r.kind === 'chat' ? { selected: open } : undefined)}
        onPress={() =>
          r.kind === 'offer'
            ? router.push({ pathname: '/offer/[id]', params: { id: r.id } })
            : twoPane
              ? setOpenChat(r.id)
              : router.push({ pathname: '/chat/[id]', params: { id: r.id } })
        }
        testID={r.kind === 'offer' ? `inbox-offer-${r.id}` : `inbox-chat-${r.id}`}
      >
        <View style={[styles.row, open ? styles.rowOpen : null]}>
          <View style={styles.media}>
            <View style={styles.thumb}>
              <Photo source={thumb ? mediaUrl(base, thumb) : null} rounded="thumb" />
            </View>
            <View style={styles.badge}>
              <DealAvatar name={name} uri={avatar} size="badge" />
            </View>
          </View>
          <View style={styles.flex}>
            {/* Unread is the dot alone (P3): name and status keep one weight and tone. */}
            <View style={styles.top}>
              <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {name}
              </Text>
              <Text variant="meta" tone="ink3">
                {meta}
              </Text>
            </View>
            <Text variant="meta" tone="ink3" numberOfLines={1}>
              {title}
            </Text>
            {/* Two lines at large text: the status is the only place the amount lives. */}
            <View style={styles.status}>
              <Text variant="meta" tone="ink2" numberOfLines={2} style={styles.shrink}>
                {status}
              </Text>
              {timeLeft ? (
                <Text variant="meta" tone="ink2" testID={`time-left-${r.id}`}>
                  {`${META_SEPARATOR.trim()} ${timeLeft}`}
                </Text>
              ) : null}
            </View>
          </View>
          {r.needsYou ? (
            <View style={styles.dot} testID={`unread-${r.id}`} />
          ) : (
            <View style={styles.dotSpace} />
          )}
        </View>
      </Tappable>
    );
  };

  const section = (title: string, rows: InboxRow[], id: string) =>
    rows.length ? (
      <View style={styles.section} key={id} testID={`inbox-${id}`}>
        <Text variant="label" tone="ink3" accessibilityRole="header">
          {title}
        </Text>
        {rows.map(row)}
      </View>
    ) : null;

  let body;
  if (query.isPending) body = <SkeletonList />;
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else {
    const r = inboxRows(query.data, side);
    if (r.needsYou.length === 0 && r.earlier.length === 0) {
      body =
        side === 'buying' ? (
          <EmptyState
            icon="chat"
            title={copy.emptyBuyingTitle}
            body={copy.emptyBuyingBody}
            action={{ label: copy.startSwiping, onPress: () => router.replace('/discover') }}
            testID="inbox-empty"
          />
        ) : (
          <EmptyState
            icon="tag"
            title={copy.emptySellingTitle}
            body={copy.emptySellingBody}
            action={{ label: copy.sellSomething, onPress: () => router.navigate('/sell') }}
            testID="inbox-empty"
          />
        );
    } else {
      // The list fades in once on load (`fade`, 150 ms; it is also the reduce-motion form).
      body = (
        <Animated.View style={styles.flex} entering={FadeIn.duration(motion.fade.duration)}>
          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
            }
          >
            {section(copy.needsYou, r.needsYou, 'needs-you')}
            {section(copy.earlier, r.earlier, 'earlier')}
          </ScrollView>
        </Animated.View>
      );
    }
  }

  const list = (
    <>
      <NavBar
        variant="large"
        title={copy.inboxTitle}
        trailing={
          <NotificationBell accessibilityLabel={notifCopy.open} testID="inbox-notifications" />
        }
      />
      <View style={styles.tabs}>
        <SegmentedControl<InboxSide>
          label={copy.inboxTitle}
          segments={[
            {
              value: 'buying',
              label: copy.tabBuying,
              badge: counts.buying,
              badgeLabel: fill(copy.needsYouCount, { n: counts.buying }),
            },
            {
              value: 'selling',
              label: copy.tabSelling,
              badge: counts.selling,
              badgeLabel: fill(copy.needsYouCount, { n: counts.selling }),
            },
          ]}
          value={side}
          onChange={setPicked}
        />
      </View>
      {body}
    </>
  );

  if (!twoPane) {
    return (
      <View style={styles.root} testID="screen-inbox">
        {list}
      </View>
    );
  }
  return (
    <View style={[styles.root, styles.panes]} testID="screen-inbox">
      <View style={styles.listPane} testID="inbox-list-pane">
        {list}
      </View>
      <View style={styles.flex} testID="inbox-chat-pane">
        {openChat ? (
          chatPane(openChat)
        ) : (
          <EmptyState
            icon="chat"
            title={copy.paneEmptyTitle}
            body={copy.paneEmptyBody}
            testID="inbox-pane-empty"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  tabs: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.md },
  list: {
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space['2xl'],
    gap: theme.space.lg,
  },
  section: { gap: theme.space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.space.rowMin,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  media: { paddingRight: theme.space.xs, paddingBottom: theme.space.xs },
  thumb: {
    width: theme.size.avatarL * 0.75,
    height: theme.size.avatarL * 0.75,
  },
  // The person's initial on the photo's corner, ringed in the screen color.
  badge: {
    position: 'absolute',
    right: -theme.space.xs,
    bottom: -theme.space.xs,
    borderRadius: theme.radius.avatar,
    borderWidth: 2,
    borderColor: theme.colors.bg,
  },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm },
  status: { flexDirection: 'row', flexWrap: 'wrap', columnGap: theme.space.xs },
  shrink: { flexShrink: 1 },
  flex: { flex: 1 },
  panes: { flexDirection: 'row' },
  listPane: {
    width: LAYOUT.inboxListWidth,
    borderRightWidth: 1,
    borderRightColor: theme.colors.line,
  },
  rowOpen: {
    marginHorizontal: -theme.space.sm,
    paddingHorizontal: theme.space.sm,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.bg2,
  },
  dot: {
    width: theme.space.sm,
    height: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.ink,
  },
  dotSpace: { width: theme.space.sm },
}));
