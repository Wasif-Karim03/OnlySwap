// send-push and push-receipts core (P9-PUSH-03, P9-FIX-01; API §5, BE-03).
// No imports besides internal.ts, so the Edge Functions (Deno) and Node tests
// run the same code.
//
// send-push: claim due notifications (the database locks them with `for update
// skip locked`, so two runs never send the same row), send them to Expo in
// batches of 100, and record one ticket per device. push-receipts: look up
// tickets after 15 minutes and disable tokens Apple/Google no longer accept.
import { isServiceCaller, type InternalResponse } from './internal.ts';

export const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts';
export const BATCH = 100;

export type ClaimedPush = {
  id: number;
  type: string;
  grp: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  time_sensitive: boolean;
  badge: number;
  tokens: { id: string; token: string; platform: 'ios' | 'android' }[];
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  badge: number;
  priority: 'high' | 'default';
  channelId: string;
  interruptionLevel?: 'time-sensitive' | 'active';
};

export type Ticket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type TicketResult = {
  token_id: string;
  ticket_id?: string;
  status: 'ok' | 'error';
  error?: string;
};

/** Android channels match the notification groups created by lib/push.ts. */
export function toMessages(p: ClaimedPush): { message: ExpoMessage; tokenId: string }[] {
  return p.tokens.map((t) => ({
    tokenId: t.id,
    message: {
      to: t.token,
      title: p.title,
      body: p.body,
      data: { ...p.data, type: p.type, notification_id: p.id },
      sound: 'default',
      badge: p.badge,
      priority: p.time_sensitive ? 'high' : 'default',
      channelId: p.grp,
      ...(t.platform === 'ios'
        ? { interruptionLevel: p.time_sensitive ? 'time-sensitive' : 'active' }
        : {}),
    },
  }));
}

export function chunk<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function ticketResult(tokenId: string, t: Ticket | undefined): TicketResult {
  if (!t) return { token_id: tokenId, status: 'error', error: 'NoTicket' };
  if (t.status === 'ok') return { token_id: tokenId, ticket_id: t.id, status: 'ok' };
  return { token_id: tokenId, status: 'error', error: t.details?.error ?? t.message ?? 'Error' };
}

export type SendDeps = {
  keys: (string | undefined)[];
  claim: (limit: number) => Promise<ClaimedPush[]>;
  finish: (results: { id: number; tickets: TicketResult[] }[]) => Promise<void>;
  /** POST a batch to Expo; returns the tickets in the same order. */
  send: (messages: ExpoMessage[]) => Promise<Ticket[]>;
  log?: (event: string, counts: Record<string, number>) => void;
};

export async function handleSendPush(
  req: { method: string; authorization: string | null },
  deps: SendDeps,
  limit = 500,
): Promise<InternalResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, deps.keys))
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };

  const claimed = await deps.claim(limit);
  const flat = claimed.flatMap((p) => toMessages(p).map((m) => ({ ...m, notificationId: p.id })));
  const byNotification = new Map<number, TicketResult[]>(claimed.map((p) => [p.id, []]));
  let sent = 0;
  let failed = 0;
  for (const batch of chunk(flat)) {
    let tickets: Ticket[] = [];
    try {
      tickets = await deps.send(batch.map((b) => b.message));
    } catch {
      tickets = [];
    }
    batch.forEach((b, i) => {
      const r = ticketResult(b.tokenId, tickets[i]);
      if (r.status === 'ok') sent += 1;
      else failed += 1;
      byNotification.get(b.notificationId)!.push(r);
    });
  }
  await deps.finish([...byNotification.entries()].map(([id, tickets]) => ({ id, tickets })));
  deps.log?.('send-push', { claimed: claimed.length, sent, failed });
  return { status: 200, body: { ok: true, claimed: claimed.length, sent, failed } };
}

// ---------------------------------------------------------------------------

export type PendingReceipt = { id: number; ticket_id: string; token_id: string | null };
export type Receipt =
  { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

export type ReceiptDeps = {
  keys: (string | undefined)[];
  pending: () => Promise<PendingReceipt[]>;
  finish: (results: { id: number; status: 'ok' | 'error'; error?: string }[]) => Promise<void>;
  /** POST ticket ids to Expo (≤1000); returns a map ticket id → receipt. */
  receipts: (ids: string[]) => Promise<Record<string, Receipt>>;
  log?: (event: string, counts: Record<string, number>) => void;
};

export async function handlePushReceipts(
  req: { method: string; authorization: string | null },
  deps: ReceiptDeps,
): Promise<InternalResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, deps.keys))
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  const pending = await deps.pending();
  const results: { id: number; status: 'ok' | 'error'; error?: string }[] = [];
  for (const batch of chunk(pending, 1000)) {
    const map = await deps.receipts(batch.map((p) => p.ticket_id));
    for (const p of batch) {
      const r = map[p.ticket_id];
      if (!r) continue; // not ready yet: try again next run
      results.push(
        r.status === 'ok'
          ? { id: p.id, status: 'ok' }
          : { id: p.id, status: 'error', error: r.details?.error ?? r.message ?? 'Error' },
      );
    }
  }
  await deps.finish(results);
  const disabled = results.filter((r) => r.error === 'DeviceNotRegistered').length;
  deps.log?.('push-receipts', { checked: results.length, disabled });
  return { status: 200, body: { ok: true, checked: results.length, disabled } };
}
