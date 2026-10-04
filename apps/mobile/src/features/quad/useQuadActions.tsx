import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ReportSheet } from '@/components/ReportSheet';
import { ActionSheet } from '@/components/Sheet';
import { useToastStore } from '@/components/Toast';
import { track } from '@/lib/analytics';
import { errorText, toAppError } from '@/lib/errors';
import { quad as copy } from '@/strings/en';

import type { QuadApi, QuadPoll, QuadPost, QuadReply, QuadReportReason } from './api';
import { dropPost, patchPost, patchReply, quadKeys } from './cache';
import { createVoteSender, tapVote, type VoteState } from './logic';

export type OptionsTarget =
  { kind: 'post'; post: QuadPost } | { kind: 'reply'; postId: string; reply: QuadReply };

export type VoteTarget =
  { kind: 'post'; post: QuadPost } | { kind: 'reply'; postId: string; reply: QuadReply };

type Key = string; // "post:<id>" or "reply:<postId>:<replyId>"

function toast(kind: 'info' | 'success' | 'error', message: string) {
  useToastStore.getState().show(kind, message);
}

/**
 * Votes, poll votes and Post options for the feed and the thread. Votes are
 * optimistic and debounced (T-UNIT-QUAD-01); a failure puts the old score
 * back and says so in a toast.
 */
export function useQuadActions({
  api,
  onGone,
  copyText = (t) => Clipboard.setStringAsync(t),
}: {
  api: QuadApi;
  /** The post was hidden or deleted from its own thread: leave it. */
  onGone?: (postId: string) => void;
  copyText?: (text: string) => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<OptionsTarget | null>(null);
  const [reporting, setReporting] = useState<OptionsTarget | null>(null);
  const [deleting, setDeleting] = useState<QuadPost | null>(null);

  const apply = (key: Key, s: VoteState) => {
    const [kind, a, b] = key.split(':') as [string, string, string | undefined];
    if (kind === 'post') patchPost(qc, a, (p) => ({ ...p, score: s.score, my_vote: s.myVote }));
    else if (b) patchReply(qc, a, b, (r) => ({ ...r, score: s.score, my_vote: s.myVote }));
  };

  const [sender] = useState(() =>
    createVoteSender<Key>({
      send: async (key, value) => {
        const [kind, a, b] = key.split(':') as [string, string, string | undefined];
        const res = await api.vote(
          kind === 'post' ? 'post' : 'reply',
          kind === 'post' ? a : b!,
          value,
        );
        return { score: res.score, myVote: res.my_vote };
      },
      onSettled: (key, s) => apply(key, s),
      onError: (key, revertTo, e) => {
        apply(key, revertTo);
        toast('error', toAppError(e).code === 'RATE_LIMITED' ? errorText(e) : copy.voteFailed);
      },
    }),
  );

  const vote = (t: VoteTarget, dir: 1 | -1) => {
    const item = t.kind === 'post' ? t.post : t.reply;
    const key = t.kind === 'post' ? `post:${t.post.id}` : `reply:${t.postId}:${t.reply.id}`;
    const before: VoteState = { score: item.score, myVote: item.my_vote };
    const after = tapVote(before, dir);
    apply(key, after);
    sender.push(key, before, after);
  };

  const votePoll = async (post: QuadPost, optionId: string) => {
    const poll = post.poll;
    if (!poll || poll.my_option) return;
    const optimistic: QuadPoll = {
      options: poll.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
      total: poll.total + 1,
      my_option: optionId,
    };
    patchPost(qc, post.id, (p) => ({ ...p, poll: optimistic }));
    try {
      const fresh = await api.votePoll(post.id, optionId);
      patchPost(qc, post.id, (p) => ({ ...p, poll: fresh }));
    } catch (e) {
      patchPost(qc, post.id, (p) => ({ ...p, poll }));
      toast('error', errorText(e));
    }
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast('error', toAppError(e).code === 'UNKNOWN' ? copy.actionFailed : errorText(e));
    }
  };

  const actions = (() => {
    if (!target) return [];
    const list: { label: string; onPress: () => void; destructive?: boolean }[] = [];
    if (target.kind === 'post') {
      const p = target.post;
      if (p.is_mine) {
        list.push({
          label: p.replies_enabled ? copy.repliesOff : copy.repliesOn,
          onPress: () =>
            void run(async () => {
              await api.setReplies(p.id, !p.replies_enabled);
              patchPost(qc, p.id, (x) => ({ ...x, replies_enabled: !p.replies_enabled }));
              toast('info', p.replies_enabled ? copy.repliesTurnedOff : copy.repliesTurnedOn);
            }),
        });
      } else {
        list.push({
          label: copy.hideAuthor,
          onPress: () =>
            void run(async () => {
              await api.hideAuthor(p.id);
              toast('info', copy.hiddenToast);
              await qc.invalidateQueries({ queryKey: quadKeys.feeds });
              void qc.invalidateQueries({ queryKey: quadKeys.hides });
              onGone?.(p.id);
            }),
        });
      }
      list.push({
        label: copy.copyText,
        onPress: () => void copyText(p.body).then(() => toast('info', copy.copied)),
      });
      if (p.is_mine) {
        list.push({ label: copy.deletePost, destructive: true, onPress: () => setDeleting(p) });
      } else {
        list.push({
          label: copy.reportPost,
          destructive: true,
          onPress: () => setReporting(target),
        });
      }
    } else {
      const r = target.reply;
      list.push({
        label: copy.copyText,
        onPress: () => void copyText(r.body).then(() => toast('info', copy.copied)),
      });
      if (!r.is_mine) {
        list.push({
          label: copy.reportReply,
          destructive: true,
          onPress: () => setReporting(target),
        });
      }
    }
    return list;
  })();

  const reportType = reporting?.kind === 'reply' ? 'quad_reply' : 'quad_post';
  const reportId =
    reporting?.kind === 'reply' ? reporting.reply.id : reporting ? reporting.post.id : '';

  const overlays = (
    <>
      <ActionSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title={target?.kind === 'reply' ? copy.replyOptions : copy.options}
        actions={actions}
      />
      <ReportSheet
        visible={!!reporting}
        onClose={() => setReporting(null)}
        target={reportType}
        onSubmit={async ({ reason, details }) => {
          await api.report(reportType, reportId, reason as QuadReportReason, details);
          track('report_submitted', { target_type: reportType });
        }}
        testID="quad-report"
      />
      <ConfirmDialog
        visible={!!deleting}
        title={copy.deleteTitle}
        message={copy.deleteBody}
        confirmLabel={copy.deletePost}
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api.deletePost(deleting.id);
          const id = deleting.id;
          setDeleting(null);
          dropPost(qc, id);
          void qc.invalidateQueries({ queryKey: quadKeys.mine });
          toast('info', copy.deleted);
          onGone?.(id);
        }}
        testID="quad-delete"
      />
    </>
  );

  return { vote, votePoll, openOptions: setTarget, overlays };
}
