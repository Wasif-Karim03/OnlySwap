// delete-account core (P4-DEL-01, API §5). No imports, so it runs under Deno
// (the Edge Function) and under Node's test runner (T-FN-05) unchanged.
//
// Flow: verify the caller's JWT → private.prepare_account_deletion (closes
// chats, keeps a banned hash, queues the goodbye email unless underage,
// returns R2 prefixes) → delete R2 prefixes (wired in P5-MEDIA-04) →
// auth.admin.deleteUser (cascades and set-nulls remove the rest).

export type EvidenceItem = { report_id: string; key: string };
export type EvidenceMove = { report_id: string; from: string; to: string };

export type Prepared = { email: string | null; r2_prefixes: string[]; evidence?: EvidenceItem[] };

/** Where a reported photo is kept: onlyswap-private/evidence/{report}/{file}. */
export function evidenceKey(item: EvidenceItem): string {
  const file = item.key.slice(item.key.lastIndexOf('/') + 1);
  return `evidence/${item.report_id}/${file}`;
}

export type DeleteDeps = {
  /** Resolves the user id from a bearer token, or null when it isn't valid. */
  userIdFromToken: (token: string) => Promise<string | null>;
  prepare: (userId: string, underage: boolean) => Promise<Prepared>;
  deleteUser: (userId: string) => Promise<void>;
  /** R2 cleanup (P5-MEDIA-04). */
  deleteR2Prefix?: (prefix: string) => Promise<void>;
  /** Copies a media key into the private bucket (BE-02); false when the photo is already gone. */
  copyToPrivate?: (fromKey: string, toKey: string) => Promise<boolean | void>;
  /** Points the reports at the private copies (private.record_evidence_moves). */
  recordMoves?: (moves: EvidenceMove[]) => Promise<void>;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type DeleteRequest = { method: string; authorization: string | null; body: unknown };
export type DeleteResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string): DeleteResponse => ({ status, body: { error: code } });

const STATUS_BY_CODE: Record<string, number> = {
  NOT_AUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

/** Error code from a Postgres P0001 message such as `RATE_LIMITED:delete_account:<time>`. */
export function serverCode(error: unknown): string | null {
  const message =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  const head = message.split(':')[0] ?? '';
  return /^[A-Z_]+$/.test(head) ? message : null;
}

export async function handleDeleteAccount(
  req: DeleteRequest,
  deps: DeleteDeps,
): Promise<DeleteResponse> {
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');

  const token = /^Bearer\s+(.+)$/i.exec(req.authorization ?? '')?.[1]?.trim();
  if (!token) return fail(401, 'NOT_AUTHENTICATED');
  const userId = await deps.userIdFromToken(token);
  if (!userId) return fail(401, 'NOT_AUTHENTICATED');

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
    string,
    unknown
  >;
  const underage = body.mode === 'underage';
  // A normal deletion needs the typed confirmation (F16); underage mode is
  // checked on the server against age_blocks instead.
  if (!underage && body.confirm !== 'DELETE') return fail(400, 'INVALID:confirm');

  let prepared: Prepared;
  try {
    prepared = await deps.prepare(userId, underage);
  } catch (error) {
    const code = serverCode(error);
    if (code) {
      const status = STATUS_BY_CODE[code.split(':')[0] ?? ''] ?? 400;
      return fail(status, code);
    }
    deps.log?.('delete_account.prepare_failed');
    return fail(500, 'UNKNOWN');
  }

  // Evidence first (BE-02): if a copy fails, nothing has been deleted yet and
  // the person can try again.
  try {
    const items = prepared.evidence ?? [];
    if (items.length && deps.copyToPrivate && deps.recordMoves) {
      const moves: EvidenceMove[] = [];
      for (const item of items) {
        const to = evidenceKey(item);
        const copied = await deps.copyToPrivate(item.key, to);
        if (copied !== false) moves.push({ report_id: item.report_id, from: item.key, to });
      }
      if (moves.length) await deps.recordMoves(moves);
    }
    if (deps.deleteR2Prefix) {
      for (const prefix of prepared.r2_prefixes) await deps.deleteR2Prefix(prefix);
    }
  } catch {
    deps.log?.('delete_account.media_failed');
    return fail(500, 'UNKNOWN');
  }

  try {
    await deps.deleteUser(userId);
  } catch {
    deps.log?.('delete_account.auth_delete_failed');
    return fail(500, 'UNKNOWN');
  }
  deps.log?.('delete_account.done', { underage, prefixes: prepared.r2_prefixes.length });
  return { status: 200, body: { ok: true } };
}
