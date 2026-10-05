import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { useUserChannel, type RealtimeSource } from '@/lib/realtime';
import { chat as chatCopy, notificationsScreen as notifCopy, offers as copy } from '@/strings';

import { mediaUrl } from '../sell/logic';
import { offersApi, type OffersApi } from './api';
import { inboxSections, money, offerView, type ChatSummary, type Offer } from './logic';

export const inboxKey = ['inbox'] as const;

type Tab = 'offers' | 'chats';

/** E01 Inbox (P7-OFF-03): offers by whose turn it is, chats with unread, live while focused. */
export function InboxScreen({
  api = offersApi,
  realtime,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  api?: OffersApi;
  realtime?: RealtimeSource;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('offers');
  const query = useQuery({ queryKey: inboxKey, queryFn: () => api.inbox() });
  useUserChannel('inbox', () => void query.refetch(), realtime);
  // Also refresh whenever the tab comes back into view, in case a ping was missed.
  const refetchInbox = query.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchInbox();
    }, [refetchInbox]),
  );
  const base = mediaBase();

  const offerRow = (o: Offer) => {
    const v = offerView(o);
    const name = o.other?.display_name ?? copy.deletedUser;
    return (
      <Tappable
        key={o.id}
        accessibilityRole="button"
        accessibilityLabel={`${o.listing?.title ?? ''}. ${v.line}`}
        onPress={() => router.push({ pathname: '/offer/[id]', params: { id: o.id } })}
        testID={`inbox-offer-${o.id}`}
      >
        <View style={styles.row}>
          <Avatar
            name={name}
            uri={o.other?.avatar_path ? mediaUrl(base, o.other.avatar_path) : null}
          />
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {o.listing?.title ?? ''}
            </Text>
            <Text variant="meta" tone="ink2" numberOfLines={1}>
              {v.line}
            </Text>
          </View>
          <Text variant="label">{money(o.amount_cents)}</Text>
        </View>
      </Tappable>
    );
  };

  const chatRow = (c: ChatSummary) => {
    const name = c.other?.display_name ?? copy.deletedUser;
    const lastText =
      c.last_message?.body || (c.last_message?.kind === 'photo' ? chatCopy.photoPreview : '');
    const last =
      lastText && c.last_message ? `${c.last_message.mine ? copy.you : ''}${lastText}` : '';
    return (
      <Tappable
        key={c.id}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${c.listing_title}${c.unread ? `, ${copy.unread}` : ''}. ${last}`}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
        testID={`inbox-chat-${c.id}`}
      >
        <View style={styles.row}>
          <Avatar
            name={name}
            uri={c.other?.avatar_path ? mediaUrl(base, c.other.avatar_path) : null}
          />
          <View style={styles.flex}>
            <Text variant={c.unread ? 'bodyStrong' : 'body'} numberOfLines={1}>
              {`${name} · ${c.listing_title}`}
            </Text>
            <Text variant="meta" tone={c.unread ? 'ink' : 'ink2'} numberOfLines={1}>
              {last}
            </Text>
          </View>
          {c.unread ? <View style={styles.dot} testID={`unread-${c.id}`} /> : null}
        </View>
      </Tappable>
    );
  };

  const section = (title: string, rows: Offer[], id: string) =>
    rows.length ? (
      <View style={styles.section} key={id} testID={`inbox-${id}`}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {rows.map(offerRow)}
      </View>
    ) : null;

  let body;
  if (query.isPending) body = <SkeletonList />;
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else {
    const inbox = query.data;
    const s = inboxSections(inbox);
    const emptyOffers = !s.mine.length && !s.toYou.length && !s.youMade.length && !s.recent.length;
    if (tab === 'offers' && emptyOffers && inbox.chats.length === 0) {
      body = (
        <EmptyState
          icon="chat"
          title={copy.emptyTitle}
          body={copy.emptyBody}
          action={{ label: copy.startSwiping, onPress: () => router.replace('/discover') }}
          testID="inbox-empty"
        />
      );
    } else if (tab === 'chats' && inbox.chats.length === 0) {
      body = (
        <EmptyState
          icon="chat"
          title={copy.emptyChatsTitle}
          body={copy.emptyChatsBody}
          testID="inbox-chats-empty"
        />
      );
    } else {
      body = (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
          }
        >
          {tab === 'offers'
            ? [
                section(copy.waitingOnYou, s.mine, 'mine'),
                section(copy.toYou, s.toYou, 'to-you'),
                section(copy.youMade, s.youMade, 'you-made'),
                section(copy.recent, s.recent, 'recent'),
              ]
            : inbox.chats.map(chatRow)}
        </ScrollView>
      );
    }
  }

  return (
    <View style={styles.root} testID="screen-inbox">
      <NavBar
        variant="large"
        title={copy.inboxTitle}
        trailing={
          <IconButton
            icon="bell"
            accessibilityLabel={notifCopy.open}
            onPress={() => router.push('/notifications')}
            testID="inbox-notifications"
          />
        }
      />
      <View style={styles.tabs}>
        <SegmentedControl
          label={copy.inboxTitle}
          segments={[
            { value: 'offers', label: copy.tabOffers },
            { value: 'chats', label: copy.tabChats },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {body}
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
    paddingVertical: theme.space.sm,
  },
  flex: { flex: 1 },
  dot: {
    width: theme.space.sm,
    height: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.accent,
  },
}));
