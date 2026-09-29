import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { ReportSheet } from '@/components/ReportSheet';
import { SkeletonList } from '@/components/Skeleton';
import { Toggle } from '@/components/Toggle';
import { useToastStore } from '@/components/Toast';
import { fill } from '@/lib/format';
import { chat as copy, profileView } from '@/strings/en';

import { profileApi, type ProfileApi } from '../profiles/api';
import { chatApi, type ChatApi, type ChatInfo } from './api';
import { chatKey } from './ChatScreen';

/** E04 Chat details (P8-CHAT-05; X17): mute, view listing and profile, report, block, hide. */
export function ChatDetailsScreen({
  id,
  api = chatApi,
  people = profileApi,
}: {
  id: string;
  api?: ChatApi;
  people?: Pick<ProfileApi, 'block'>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const info = useQuery({ queryKey: chatKey(id), queryFn: () => api.chat(id) });
  const [reporting, setReporting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  if (info.isPending) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} title={copy.detailsTitle} />
        <SkeletonList rows={4} />
      </View>
    );
  }
  if (info.isError || !info.data) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} title={copy.detailsTitle} />
        <ErrorState error={info.error} onRetry={() => info.refetch()} />
      </View>
    );
  }
  const c: ChatInfo = info.data;
  const name = c.other?.display_name ?? copy.deletedUser;
  const setMuted = async (muted: boolean) => {
    qc.setQueryData<ChatInfo>(chatKey(id), (old) => (old ? { ...old, muted } : old));
    try {
      await api.mute(id, muted);
    } catch {
      void info.refetch();
    }
  };

  return (
    <View style={styles.root} testID="screen-chat-details">
      <NavBar onLeading={leave} title={copy.detailsTitle} />
      <ScrollView contentContainerStyle={styles.body}>
        <Toggle label={copy.mute} value={c.muted} onChange={(v) => void setMuted(v)} />
        <GroupedList>
          {c.listing_id ? (
            <ListRow
              label={copy.viewListing}
              icon="tag"
              onPress={() =>
                router.push({ pathname: '/listing/[id]', params: { id: c.listing_id! } })
              }
            />
          ) : null}
          {c.other ? (
            <ListRow
              label={copy.viewProfile}
              icon="user"
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.other!.id } })}
            />
          ) : null}
        </GroupedList>
        <GroupedList>
          {c.other ? (
            <>
              <ListRow
                label={fill(copy.report, { name })}
                icon="flag"
                onPress={() => setReporting(true)}
              />
              {!c.i_blocked ? (
                <ListRow
                  label={fill(copy.block, { name })}
                  icon="ban"
                  destructive
                  onPress={() => setBlocking(true)}
                />
              ) : null}
            </>
          ) : null}
          <ListRow
            label={copy.hide}
            icon="eye"
            onPress={async () => {
              await api.hide(id);
              void qc.invalidateQueries({ queryKey: ['inbox'] });
              useToastStore.getState().show('info', copy.hideDone);
              router.replace('/inbox');
            }}
          />
        </GroupedList>
      </ScrollView>
      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        target="chat"
        name={name}
        onSubmit={async ({ reason, details, block }) => {
          await api.report(id, reason, details);
          if (block && c.other) {
            await people.block(c.other.id);
            await qc.invalidateQueries({ queryKey: chatKey(id) });
          }
        }}
      />
      <ConfirmDialog
        visible={blocking}
        title={fill(profileView.blockTitle, { name })}
        message={profileView.blockBody}
        confirmLabel={profileView.blockConfirm}
        destructive
        onConfirm={async () => {
          if (c.other) await people.block(c.other.id);
          setBlocking(false);
          await qc.invalidateQueries({ queryKey: chatKey(id) });
        }}
        onCancel={() => setBlocking(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.xl },
}));
