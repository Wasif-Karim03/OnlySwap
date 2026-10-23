// delete-account core (P4-DEL-01, API §5). No imports, so it runs under Deno
// (the Edge Function) and under Node's test runner (T-FN-05) unchanged.
//
// R2 is required (IR-03): without it the request fails before anything is
// prepared, so no manifest is confirmed for media that was never handled.
//
// Flow: verify the caller's JWT → private.prepare_account_deletion (closes
// chats, keeps a banned hash, queues the goodbye email unless underage,
// returns R2 prefixes and archived chat keys) → delete R2 prefixes (wired in
// P5-MEDIA-04), purging each prefix's public URLs from the edge cache right
// after it (LR-02, non-fatal) → chat archives (B-03) → confirm the media
// manifest (0246; the 15-minute sweep repeats it) → auth.admin.deleteUser
// (cascades and set-nulls remove the rest).

export type EvidenceItem = { report_id: string; key: string };
/** `missing`: the source was gone and no private copy exists (IR-02). */
export type EvidenceMove = { report_id: string; from: string; to: string; missing?: true };

export type Prepared = {
  email: string | null;
  r2_prefixes: string[];
  evidence?: EvidenceItem[];
  /** Private-bucket keys of the person's archived chats (B-03). */
  archives?: string[];
};

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
  /**
   * R2 cleanup (P5-MEDIA-04); returns the keys it removed, when it knows them.
   * A failure may carry the keys removed before it as `error.deleted` (IR-05).
   */
  deleteR2Prefix?: (prefix: string) => Promise<string[] | void>;
  /** Purges the public URLs of removed keys from the edge cache (LR-02). */
  purge?: (keys: string[]) => Promise<unknown>;
  /** private.confirm_media_deletion: the manifest's sweep may start (0246). */
  confirmMedia?: (userId: string) => Promise<void>;
  /** Deletes one archived chat from the private bucket (DATA_MODEL §5, B-03). */
  deleteArchive?: (key: string) => Promise<void>;
  /** Copies a media key into the private bucket (BE-02); false when the photo is already gone. */
  copyToPrivate?: (fromKey: string, toKey: string) => Promise<boolean | void>;
  /** True when the private copy already exists (another deletion made it, IR-02). */
  privateExists?: (toKey: string) => Promise<boolean>;
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

/** Keys a failed prefix delete had already removed (`error.deleted`, IR-05). */
function deletedBeforeFailure(error: unknown): string[] {
  const deleted = (error as { deleted?: unknown } | null)?.deleted;
  return Array.isArray(deleted) ? deleted.filter((k): k is string => typeof k === 'string') : [];
}

/** Evidence copy (BE-02): one move per item; a gone source is kept when its private copy exists. */
async function copyEvidence(
  items: EvidenceItem[],
  copy: NonNullable<DeleteDeps['copyToPrivate']>,
  privateExists: NonNullable<DeleteDeps['privateExists']>,
): Promise<EvidenceMove[]> {
  const moves: EvidenceMove[] = [];
  for (const item of items) {
    const to = evidenceKey(item);
    const move = { report_id: item.report_id, from: item.key, to };
    if ((await copy(item.key, to)) !== false || (await privateExists(to))) moves.push(move);
    else moves.push({ ...move, missing: true });
  }
  return moves;
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

  const { deleteR2Prefix, copyToPrivate, privateExists, recordMoves, deleteArchive } = deps;
  if (!deleteR2Prefix || !copyToPrivate || !privateExists || !recordMoves || !deleteArchive) {
    deps.log?.('delete_account.r2_not_configured');
    return fail(500, 'UNKNOWN');
  }

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

  // Purged right after their prefix (or the part of it deleted before a
  // failure), so a later failure cannot lose them; the 24 h edge TTL is the
  // backstop when a purge fails.
  let purged = 0;
  const purge = async (keys: string[] | void) => {
    if (!deps.purge || !Array.isArray(keys) || !keys.length) return;
    try {
      await deps.purge(keys);
      purged += keys.length;
    } catch {
      deps.log?.('delete_account.purge_failed');
    }
  };

  // Evidence first (BE-02): if a copy fails, nothing has been deleted yet and
  // the person can try again.
  try {
    const items = prepared.evidence ?? [];
    if (items.length) await recordMoves(await copyEvidence(items, copyToPrivate, privateExists));
    for (const prefix of prepared.r2_prefixes) {
      let keys: string[] | void;
      try {
        keys = await deleteR2Prefix(prefix);
      } catch (error) {
        await purge(deletedBeforeFailure(error));
        throw error;
      }
      await purge(keys);
    }
    for (const key of prepared.archives ?? []) await deleteArchive(key);
  } catch (error) {
    // Only the R2 method and status (e.g. "r2 GET 403"); never keys or ids.
    const detail = error instanceof Error ? error.message.slice(0, 80) : 'unknown';
    deps.log?.('delete_account.media_failed', { detail });
    return fail(500, 'UNKNOWN');
  }

  // Only after the evidence copy and every prefix and archive delete
  // succeeded. The manifest stays unconfirmed (and the account in place)
  // when this fails, so the person can retry.
  if (deps.confirmMedia) {
    try {
      await deps.confirmMedia(userId);
    } catch {
      deps.log?.('delete_account.confirm_failed');
      return fail(500, 'UNKNOWN');
    }
  }

  try {
    await deps.deleteUser(userId);
  } catch {
    deps.log?.('delete_account.auth_delete_failed');
    return fail(500, 'UNKNOWN');
  }
  deps.log?.('delete_account.done', {
    underage,
    prefixes: prepared.r2_prefixes.length,
    purged,
  });
  return { status: 200, body: { ok: true } };
}
