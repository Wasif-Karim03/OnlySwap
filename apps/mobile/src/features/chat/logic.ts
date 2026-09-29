/** A chat message from the server (private.message_json). */
export type Message = {
  id: number;
  chat_id: string;
  sender_id: string | null;
  kind: 'text' | 'system' | 'meetup' | 'photo';
  body: string | null;
  meta: Record<string, unknown> | null;
  client_id: string | null;
  created_at: string;
  mine?: boolean;
};

/** A message on screen: sent (from the server) or still local. */
export type ChatItem =
  | (Message & { state: 'sent' })
  | {
      state: 'pending' | 'failed';
      id: null;
      client_id: string;
      body: string;
      kind: 'text';
      created_at: string;
      mine: true;
      sender_id: null;
      meta: null;
      chat_id: string;
    };

/**
 * Merges server messages into what's shown (T-UNIT-CHAT-01): dedupe by id and
 * by client_id (a sent message replaces its pending copy), server messages in
 * id order, then still-local ones in the order they were written.
 */
export function mergeMessages(
  current: ChatItem[],
  incoming: Message[],
  me: string | null,
): ChatItem[] {
  const byId = new Map<number, ChatItem>();
  const sentClientIds = new Set<string>();
  for (const m of current) if (m.state === 'sent') byId.set(m.id, m);
  for (const m of incoming) {
    byId.set(m.id, { ...m, mine: m.mine ?? (me !== null && m.sender_id === me), state: 'sent' });
  }
  for (const m of byId.values()) if (m.client_id) sentClientIds.add(m.client_id);
  const sent = [...byId.values()].sort((a, b) => (a.id as number) - (b.id as number));
  const local = current.filter((m) => m.state !== 'sent' && !sentClientIds.has(m.client_id!));
  return [...sent, ...local];
}

export function lastSentId(items: ChatItem[]): number | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const m = items[i]!;
    if (m.state === 'sent') return m.id;
  }
  return null;
}

export function firstSentId(items: ChatItem[]): number | null {
  const m = items.find((x) => x.state === 'sent');
  return m && m.state === 'sent' ? m.id : null;
}

// ---------------------------------------------------------------------------
// Scam hint (P8-CHAT-06, T-UNIT-CHAT-04; SEC-06). Client-side only.

const URL_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|link|ly|xyz)\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const PAY_RE =
  /\b(?:venmo|zelle|cash\s?app|cashapp|paypal|apple\s?pay|gift\s?cards?|wire|western\s?union|crypto|bitcoin|deposit|pay\s(?:first|upfront|up front|ahead))\b/i;

/** Should an incoming message show the "never pay before you meet" hint? */
export function scamHint(body: string | null | undefined): 'link' | 'phone' | 'payment' | null {
  if (!body) return null;
  if (PAY_RE.test(body)) return 'payment';
  if (URL_RE.test(body)) return 'link';
  if (PHONE_RE.test(body)) return 'phone';
  return null;
}
