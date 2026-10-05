import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Linking, Modal, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { track } from '@/lib/analytics';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { MessageBubble } from '@/components/MessageBubble';
import { NavBar } from '@/components/NavBar';
import { PermissionPrimerView } from '@/components/PermissionPrimer';
import { Photo } from '@/components/Photo';
import { ReportSheet } from '@/components/ReportSheet';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { ZoomableImage } from '@/components/ZoomableImage';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { osPermissions, primerStep, type OsApi } from '@/lib/permissions';
import type { RealtimeSource } from '@/lib/realtime';
import { chat as copy } from '@/strings';

import { authApi, type AuthApi } from '../auth/api';
import { useSession } from '../auth/useSession';
import { meetupsApi, type MeetupsApi } from '../meetups/api';
import { MeetupCard } from '../meetups/MeetupCard';
import { money } from '../offers/logic';
import { profileApi, type ProfileApi } from '../profiles/api';
import { mediaUrl } from '../sell/logic';
import { chatApi, type ChatApi } from './api';
import { bubbleAspect, chatPhotoUrl, newContactFromItems, scamHint, type ChatItem } from './logic';
import { useChat, type ChatState } from './useChat';

export const chatKey = (id: string) => ['chat', id] as const;

type PhotoSource = 'camera' | 'library';
type Primer = { kind: 'camera' | 'photos'; step: 'primer' | 'settings'; busy: boolean };

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
  config = authApi,
  people = profileApi,
  pick = (source) => pickPhotos(source, 1),
  cameraOs = osPermissions.camera,
  photosOs = osPermissions.photos,
  openSettings = () => Linking.openSettings(),
  now = () => new Date(),
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
  /** Remote flags: chat_photos_enabled gates the photo button (R11-PHOTO-GATE). */
  config?: Pick<AuthApi, 'getAppConfig'>;
  people?: Pick<ProfileApi, 'block'>;
  pick?: (source: PhotoSource) => Promise<PickedPhoto[]>;
  cameraOs?: OsApi;
  photosOs?: OsApi;
  openSettings?: () => Promise<unknown>;
  now?: () => Date;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const session = useSession();
  const me =
    meProp !== undefined ? meProp : session.status === 'signedIn' ? session.session.user.id : null;
  const info = useQuery({ queryKey: chatKey(id), queryFn: () => api.chat(id) });
  const state = useChat(id, { me, api, realtime, store });
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const appConfig = useQuery({ queryKey: ['app_config'], queryFn: () => config.getAppConfig() });
  const [photoSheet, setPhotoSheet] = useState(false);
  const [primer, setPrimer] = useState<Primer | null>(null);
  const [photoError, setPhotoError] = useState(false);
  // Photos the person chose to see (keyed by message id); new-contact photos start blurred.
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set());
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [viewer, setViewer] = useState<{ uri: string; label: string } | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));
  const data = useMemo(() => [...state.items].reverse(), [state.items]);
  const meetupQ = useQuery({ queryKey: ['chat-meetup', id], queryFn: () => meetups.forChat(id) });
  // Every meetup change posts a `meetup` row; refetch the card when one arrives.
  useEffect(() => track('chat_opened'), []);
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
  const photosOn = appConfig.data?.chatPhotosEnabled === true && c.status === 'open' && !readOnly;
  const newContact = newContactFromItems(state.items, now(), c.created_at);

  const pickAndSend = async (source: PhotoSource) => {
    let picked: PickedPhoto | undefined;
    try {
      picked = (await pick(source))[0];
    } catch {
      setPhotoError(true);
      return;
    }
    if (!picked) return;
    const caption = text;
    setText('');
    void state.sendPhoto({ uri: picked.uri, width: picked.width, height: picked.height }, caption);
  };

  const choose = async (source: PhotoSource) => {
    setPhotoSheet(false);
    setPhotoError(false);
    const kind = source === 'camera' ? 'camera' : 'photos';
    const os = source === 'camera' ? cameraOs : photosOs;
    let step;
    try {
      step = primerStep(await os.get());
    } catch {
      step = 'primer' as const;
    }
    if (step === 'granted') return pickAndSend(source);
    setPrimer({ kind, step, busy: false });
  };

  const continuePrimer = async () => {
    if (!primer) return;
    const source: PhotoSource = primer.kind === 'camera' ? 'camera' : 'library';
    const os = primer.kind === 'camera' ? cameraOs : photosOs;
    setPrimer({ ...primer, busy: true });
    let step;
    try {
      step = primerStep(await os.request());
    } catch {
      step = 'settings' as const;
    }
    if (step === 'granted') {
      setPrimer(null);
      return pickAndSend(source);
    }
    setPrimer({ kind: primer.kind, step: 'settings', busy: false });
  };

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
    const key = item.client_id ?? String(item.id);
    let photo;
    if (item.kind === 'photo') {
      const sentId = item.state === 'sent' ? item.id : null;
      const uri =
        item.local?.uri ?? (item.state === 'sent' ? chatPhotoUrl(base, item.photo_url) : null);
      const aspect =
        aspects[key] ?? (item.local ? bubbleAspect(item.local.width, item.local.height) : 1);
      const blurred = !mine && newContact && sentId !== null && !revealed.has(sentId);
      const label = mine ? copy.yourPhoto : fill(copy.photoFrom, { name });
      photo = {
        source: uri,
        aspect,
        blurred,
        progress:
          item.state === 'pending' && !item.photo_path && item.progress !== undefined
            ? item.progress
            : null,
        onReveal:
          sentId !== null ? () => setRevealed((prev) => new Set(prev).add(sentId)) : undefined,
        onOpen: uri ? () => setViewer({ uri, label }) : undefined,
        onLoad: ({ width, height }: { width: number; height: number }) => {
          const next = bubbleAspect(width, height);
          setAspects((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
        },
        // A signed URL lasts 1 to 2 hours: refetch the message for a fresh one.
        onError:
          sentId !== null && !item.local ? () => void state.refreshMessage(sentId) : undefined,
      };
    }
    const sentId = item.state === 'sent' ? item.id : null;
    return (
      <MessageBubble
        kind={mine ? 'mine' : 'theirs'}
        body={item.body ?? ''}
        state={item.state}
        author={name}
        scamHint={hint ? copy.scamHint[hint] : null}
        onRetry={item.state === 'failed' ? () => void state.retry(item.client_id!) : undefined}
        photo={photo}
        onLongPress={!mine && sentId !== null ? () => setReportId(sentId) : undefined}
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
            {photosOn ? (
              <IconButton
                icon="image"
                accessibilityLabel={copy.addPhoto}
                onPress={() => setPhotoSheet(true)}
                testID="chat-photo"
              />
            ) : null}
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
        {photoError ? (
          <View style={styles.readOnly}>
            <Banner kind="error" message={copy.photoFailed} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
      <Sheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title={copy.photoSheetTitle}
        testID="chat-photo-sheet"
      >
        <Text variant="meta" tone="ink2">
          {copy.photoCaptionHint}
        </Text>
        <Button
          label={copy.photoLibrary}
          variant="secondary"
          onPress={() => void choose('library')}
          testID="chat-photo-library"
        />
        <Button
          label={copy.photoCamera}
          variant="secondary"
          onPress={() => void choose('camera')}
          testID="chat-photo-camera"
        />
      </Sheet>
      {primer ? (
        <View style={styles.primer}>
          <PermissionPrimerView
            testID={`chat-primer-${primer.kind}`}
            kind={primer.kind}
            step={primer.step}
            busy={primer.busy}
            onContinue={() => void continuePrimer()}
            onOpenSettings={() => void openSettings()}
            onAlternative={() => {
              setPrimer(null);
              void choose(primer.kind === 'camera' ? 'library' : 'camera');
            }}
            onClose={() => setPrimer(null)}
          />
        </View>
      ) : null}
      <Modal
        visible={viewer !== null}
        animationType="fade"
        onRequestClose={() => setViewer(null)}
        supportedOrientations={['portrait']}
      >
        <GestureHandlerRootView style={styles.flex}>
          <StatusBar style="light" />
          <View style={styles.viewer} testID="chat-photo-viewer">
            <NavBar tone="onPhoto" leading="close" onLeading={() => setViewer(null)} />
            {viewer ? (
              <ZoomableImage
                source={viewer.uri}
                accessibilityLabel={viewer.label}
                onDismiss={() => setViewer(null)}
              />
            ) : null}
          </View>
        </GestureHandlerRootView>
      </Modal>
      <ReportSheet
        visible={reportId !== null}
        onClose={() => setReportId(null)}
        target="message"
        name={name}
        onSubmit={async ({ reason, details, block }) => {
          if (reportId === null) return;
          await api.reportMessage(reportId, reason, details);
          track('report_submitted', { target_type: 'message' });
          if (block && c.other) {
            await people.block(c.other.id);
            await qc.invalidateQueries({ queryKey: chatKey(id) });
          }
        }}
        testID="chat-report-message"
      />
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
  primer: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.bg },
  viewer: { flex: 1, backgroundColor: theme.colors.photoBg },
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
