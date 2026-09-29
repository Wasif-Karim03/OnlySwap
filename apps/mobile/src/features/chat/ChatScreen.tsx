import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { MessageBubble } from '@/components/MessageBubble';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import type { RealtimeSource } from '@/lib/realtime';
import { chat as copy } from '@/strings/en';

import { useSession } from '../auth/useSession';
import { meetupsApi, type MeetupsApi } from '../meetups/api';
import { MeetupCard } from '../meetups/MeetupCard';
import { money } from '../offers/logic';
import { mediaUrl } from '../sell/logic';
import { chatApi, type ChatApi } from './api';
import { scamHint, type ChatItem } from './logic';
import { useChat, type ChatState } from './useChat';

export const chatKey = (id: string) => ['chat', id] as const;

/**
 * E03 Chat (P8-CHAT-03): bubbles, system rows, deal bar, first-message
 * safety tip, pending/failed, scam hints, blocked (X18) and closed read-only.
 */
export function ChatScreen({
  id,
  me: meProp,
  api = chatApi,
  meetups = meetupsApi,
  realtime,
  store,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  extraActions,
}: {
  id: string;
  me?: string | null;
  api?: ChatApi;
  meetups?: MeetupsApi;
  realtime?: RealtimeSource;
  store?: StoreApi<ChatState>;
  mediaBase?: () => string;
  /** Deal-bar buttons added by meetups and deals (S26, S27). */
  extraActions?: (info: { role: 'buyer' | 'seller'; listingId: string | null }) => ReactNode;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const session = useSession();
  const me =
    meProp !== undefined ? meProp : session.status === 'signedIn' ? session.session.user.id : null;
  const info = useQuery({ queryKey: chatKey(id), queryFn: () => api.chat(id) });
  const state = useChat(id, { me, api, realtime, store });
  const [text, setText] = useState('');
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));
  const data = useMemo(() => [...state.items].reverse(), [state.items]);
  const meetupQ = useQuery({ queryKey: ['chat-meetup', id], queryFn: () => meetups.forChat(id) });
  // Every meetup change posts a `meetup` row; refetch the card when one arrives.
  const meetupRows = state.items.filter((m) => m.kind === 'meetup').length;
  const refetchMeetup = meetupQ.refetch;
  useEffect(() => {
    if (meetupRows > 0) void refetchMeetup();
  }, [meetupRows, refetchMeetup]);

  if (info.isPending || (state.loading && state.items.length === 0)) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} />
        <SkeletonList rows={6} />
      </View>
    );
  }
  if (info.isError || !info.data) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} />
        <ErrorState error={info.error} onRetry={() => info.refetch()} />
      </View>
    );
  }
  const c = info.data;
  const name = c.other_deleted ? copy.deletedUser : (c.other?.display_name ?? copy.deletedUser);
  const readOnly = c.status === 'closed' || c.blocked || c.other_deleted;
  const base = mediaBase();

  const send = () => {
    const body = text;
    setText('');
    void state.send(body);
  };

  const renderItem = ({ item }: { item: ChatItem }) => {
    if (item.kind === 'system' || item.kind === 'meetup') {
      return (
        <MessageBubble kind="system" body={item.body ?? ''} testID={`msg-${String(item.id)}`} />
      );
    }
    const mine = item.mine === true;
    const hint = mine ? null : scamHint(item.body);
    return (
      <MessageBubble
        kind={mine ? 'mine' : 'theirs'}
        body={item.body ?? ''}
        state={item.state}
        author={name}
        scamHint={hint ? copy.scamHint[hint] : null}
        onRetry={item.state === 'failed' ? () => void state.retry(item.client_id!) : undefined}
        testID={`msg-${item.id ?? item.client_id}`}
      />
    );
  };

  return (
    <View style={styles.root} testID="screen-chat">
      <NavBar
        title={name}
        onLeading={leave}
        trailing={
          <IconButton
            icon="more"
            accessibilityLabel={copy.details}
            onPress={() => router.push({ pathname: '/chat/[id]/details', params: { id } })}
            testID="chat-details"
          />
        }
      />
      <View style={styles.deal} testID="chat-deal-bar">
        <View style={styles.thumb}>
          <Photo
            source={c.listing_thumb_path ? mediaUrl(base, c.listing_thumb_path) : null}
            rounded="thumb"
          />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {c.listing_title}
          </Text>
          <Text variant="meta" tone="ink2">
            {fill(copy.agreed, { amount: money(c.agreed_cents) })}
          </Text>
        </View>
        {!readOnly && !meetupQ.data ? (
          <Button
            label={copy.planMeetup}
            size="S"
            variant="dark"
            onPress={() => router.push({ pathname: '/chat/[id]/meetup', params: { id } })}
            testID="chat-plan-meetup"
          />
        ) : null}
        {!readOnly &&
        meetupQ.data &&
        (meetupQ.data.status === 'confirmed' || meetupQ.data.status === 'completed') &&
        !(c.role === 'seller' ? c.seller_outcome : c.buyer_outcome) ? (
          <Button
            label={copy.didItSell}
            size="S"
            variant="dark"
            onPress={() => router.push({ pathname: '/chat/[id]/deal', params: { id } })}
            testID="chat-did-it-sell"
          />
        ) : null}
        {!readOnly && extraActions ? extraActions({ role: c.role, listingId: c.listing_id }) : null}
      </View>
      {meetupQ.data ? (
        <MeetupCard
          meetup={meetupQ.data}
          chatId={id}
          otherName={name}
          api={meetups}
          onChanged={() => void meetupQ.refetch()}
        />
      ) : null}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <FlatList
          inverted
          data={data}
          keyExtractor={(m) => String(m.id ?? m.client_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={() => void state.loadOlder()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            c.my_first_message && !readOnly ? (
              <View style={styles.tip} testID="chat-safety-tip">
                <Text variant="bodyStrong">{copy.safetyTitle}</Text>
                <Text variant="meta" tone="ink2">
                  {copy.safetyBody}
                </Text>
              </View>
            ) : null
          }
          testID="chat-list"
        />
        {readOnly ? (
          <View style={styles.readOnly} testID="chat-read-only">
            <Banner
              kind="info"
              message={
                c.status === 'closed'
                  ? copy.closed
                  : c.i_blocked
                    ? fill(copy.youBlocked, { name })
                    : copy.blocked
              }
            />
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={copy.composerPlaceholder}
              placeholderTextColor={theme.colors.ink3}
              accessibilityLabel={copy.composerLabel}
              multiline
              maxLength={1000}
              style={styles.input}
              testID="chat-input"
            />
            <IconButton
              icon="send"
              accessibilityLabel={copy.send}
              disabled={!text.trim()}
              onPress={send}
              filled
              testID="chat-send"
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  deal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.screen,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  thumb: { width: theme.size.hit, height: theme.size.hit },
  list: { paddingVertical: theme.space.md, gap: theme.space.sm },
  tip: {
    margin: theme.space.screen,
    padding: theme.space.lg,
    gap: theme.space.xs,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  readOnly: {
    padding: theme.space.screen,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
    borderTopWidth: 1,
    borderColor: theme.colors.line,
  },
  input: {
    flex: 1,
    minHeight: theme.size.hit,
    maxHeight: theme.size.hit * 3,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
    color: theme.colors.ink,
    fontSize: theme.type.body.fontSize,
  },
}));
