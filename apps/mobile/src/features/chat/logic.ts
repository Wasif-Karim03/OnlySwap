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
  /** Photo messages (P8-CHAT-04): the full image key. */
  photo_path?: string | null;
  /** Signed relative path ("key?exp=..&sig=..", valid 1 to 2 hours); null for text. */
  photo_url?: string | null;
};

/** A photo picked on this phone, shown while it uploads and sends. */
export type LocalPhoto = { uri: string; width: number; height: number };

/** A message on screen: sent (from the server) or still local. */
export type ChatItem =
  /** `local`: my own photo picked on this phone, kept so it doesn't reload once sent. */
  | (Message & { state: 'sent'; local?: LocalPhoto })
  | {
      state: 'pending' | 'failed';
      id: null;
      client_id: string;
      /** The text, or the photo caption ('' for none). */
      body: string;
      kind: 'text' | 'photo';
      created_at: string;
      mine: true;
      sender_id: null;
      meta: null;
      chat_id: string;
      /** Photo only: the picked file, the uploaded key once done, upload progress 0..1. */
      local?: LocalPhoto;
      photo_path?: string | null;
      progress?: number;
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
  const localPhotos = new Map<string, LocalPhoto>();
  for (const m of current) {
    if (m.state === 'sent') byId.set(m.id, m);
    if (m.local && m.client_id) localPhotos.set(m.client_id, m.local);
  }
  for (const m of incoming) {
    const local = m.client_id ? localPhotos.get(m.client_id) : undefined;
    byId.set(m.id, {
      ...m,
      mine: m.mine ?? (me !== null && m.sender_id === me),
      state: 'sent',
      ...(local ? { local } : {}),
    });
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

// ---------------------------------------------------------------------------
// Photos in chat (P8-CHAT-04, R11-PHOTO-GATE)

/** Fewer messages than this from the other person and their photos start blurred. */
export const NEW_CONTACT_MESSAGES = 10;
/** A chat younger than this counts as a new contact. */
export const NEW_CONTACT_MS = 24 * 60 * 60 * 1000;

/**
 * Is the other person still a "new contact"? True when they have sent fewer
 * than 10 messages in this chat or the chat is under 24 hours old. An unknown
 * start counts as new (blurred is the safe side).
 */
export function isNewContact(input: {
  otherMessages: number;
  chatStartedAt: string | null | undefined;
  now: Date;
}): boolean {
  if (input.otherMessages < NEW_CONTACT_MESSAGES) return true;
  const started = input.chatStartedAt ? Date.parse(input.chatStartedAt) : NaN;
  if (!Number.isFinite(started)) return true;
  return input.now.getTime() - started < NEW_CONTACT_MS;
}

/**
 * The new-contact rule over what's loaded. Only loaded messages are counted
 * and the oldest loaded one stands in for the chat's start when the server
 * doesn't send it, so both undercount: a long chat may stay blurred until
 * older pages load, never the other way round.
 */
export function newContactFromItems(
  items: ChatItem[],
  now: Date,
  chatCreatedAt?: string | null,
): boolean {
  let otherMessages = 0;
  let oldest: string | null = null;
  for (const m of items) {
    if (m.state !== 'sent') continue;
    if (oldest === null && m.created_at) oldest = m.created_at;
    if (!m.mine && m.sender_id !== null && (m.kind === 'text' || m.kind === 'photo')) {
      otherMessages += 1;
    }
  }
  return isNewContact({ otherMessages, chatStartedAt: chatCreatedAt ?? oldest, now });
}

/**
 * Chat photo URL: the media base plus the signed relative path, query string
 * kept (the Worker checks `exp` and `sig`). Null when there is no photo yet.
 */
export function chatPhotoUrl(base: string, signedPath: string | null | undefined): string | null {
  if (!signedPath) return null;
  return `${base.replace(/\/+$/, '')}/${signedPath.replace(/^\/+/, '')}`;
}

/** Keeps very tall or very wide photos to a bubble-friendly shape (width / height). */
export function bubbleAspect(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height || width <= 0 || height <= 0) return 1;
  return Math.min(Math.max(width / height, 0.6), 1.8);
}
