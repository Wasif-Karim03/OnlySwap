// app-store-notifications logic (AR-04, DEC 136). Apple's App Store Server
// Notifications V2 arrive as { signedPayload } (a JWS). We check the x5c
// chain ourselves with WebCrypto (works the same in Deno and Node, no
// node:crypto X509): the root must be Apple Root CA - G3 by SHA-256
// fingerprint, each certificate signs the next, the intermediate and leaf
// carry Apple's marker OIDs, and all three are valid at the payload's
// signedDate. Only RESCIND_CONSENT does anything: it locks every account
// linked to that appTransactionId (private.rescind_consent). Everything else
// (TEST included) is logged and answered 200 so Apple stops retrying.

/** Apple Root CA - G3 (apple.com/certificateauthority), SHA-256 of the DER. */
export const APPLE_ROOT_CA_G3_SHA256 =
  '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179';

const OID = {
  ecdsaSha256: '2a8648ce3d040302',
  ecdsaSha384: '2a8648ce3d040303',
  p256: '2a8648ce3d030107',
  p384: '2b81040022',
  // 1.2.840.113635.100.6.2.1 (Apple intermediate) and .6.11.1 (App Store leaf)
  appleIntermediate: '060a2a864886f76364060201',
  appleLeaf: '060a2a864886f76364060b01',
};

type Tlv = { tag: number; start: number; end: number; offset: number };

function tlv(b: Uint8Array, offset: number): Tlv {
  const tag = b[offset];
  let len = b[offset + 1];
  let start = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error('der: length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[start + i];
    start += n;
  }
  const end = start + len;
  if (tag === undefined || end > b.length) throw new Error('der: truncated');
  return { tag, start, end, offset };
}

function children(b: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = parent.start; at < parent.end;) {
    const t = tlv(b, at);
    out.push(t);
    at = t.end;
  }
  return out;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function parseTime(b: Uint8Array, t: Tlv): number {
  const s = new TextDecoder().decode(b.slice(t.start, t.end));
  const full = t.tag === 0x17 ? (Number(s.slice(0, 2)) >= 50 ? '19' : '20') + s : s;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(full);
  if (!m) throw new Error('der: time');
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

type Cert = {
  der: Uint8Array;
  tbs: Uint8Array;
  sigAlg: string;
  signature: Uint8Array;
  notBefore: number;
  notAfter: number;
  spki: Uint8Array;
  curve: string;
};

function parseCert(der: Uint8Array): Cert {
  const root = tlv(der, 0);
  const [tbsT, algT, sigT] = children(der, root);
  if (!tbsT || !algT || !sigT || sigT.tag !== 0x03) throw new Error('cert: shape');
  const tbsParts = children(der, tbsT);
  const rest = tbsParts[0].tag === 0xa0 ? tbsParts.slice(1) : tbsParts;
  // serial, signature, issuer, validity, subject, subjectPublicKeyInfo
  const validity = children(der, rest[3]);
  const spkiT = rest[5];
  const spkiAlg = children(der, children(der, spkiT)[0]);
  const algOid = children(der, algT)[0];
  return {
    der,
    tbs: der.slice(tbsT.offset, tbsT.end),
    sigAlg: hex(der.slice(algOid.start, algOid.end)),
    signature: der.slice(sigT.start + 1, sigT.end), // skip the unused-bits byte
    notBefore: parseTime(der, validity[0]),
    notAfter: parseTime(der, validity[1]),
    spki: der.slice(spkiT.offset, spkiT.end),
    curve: hex(der.slice(spkiAlg[1].start, spkiAlg[1].end)),
  };
}

/** DER ECDSA-Sig-Value to the raw r||s WebCrypto wants. */
function rawSignature(der: Uint8Array, size: number): Uint8Array {
  const seq = tlv(der, 0);
  const [r, s] = children(der, seq);
  const out = new Uint8Array(size * 2);
  for (const [i, part] of [r, s].entries()) {
    let v = der.slice(part.start, part.end);
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new Error('sig: size');
    out.set(v, i * size + (size - v.length));
  }
  return out;
}

const curveInfo = (oid: string) =>
  oid === OID.p256
    ? { namedCurve: 'P-256', size: 32 }
    : oid === OID.p384
      ? { namedCurve: 'P-384', size: 48 }
      : null;

async function importKey(cert: Cert): Promise<{ key: CryptoKey; size: number }> {
  const c = curveInfo(cert.curve);
  if (!c) throw new Error('cert: curve');
  const key = await crypto.subtle.importKey(
    'spki',
    cert.spki,
    { name: 'ECDSA', namedCurve: c.namedCurve },
    false,
    ['verify'],
  );
  return { key, size: c.size };
}

async function signedBy(child: Cert, issuer: Cert): Promise<boolean> {
  const hash =
    child.sigAlg === OID.ecdsaSha256
      ? 'SHA-256'
      : child.sigAlg === OID.ecdsaSha384
        ? 'SHA-384'
        : null;
  if (!hash) return false;
  const { key, size } = await importKey(issuer);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash },
    key,
    rawSignature(child.signature, size),
    child.tbs,
  );
}

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64uToBytes = (s: string) =>
  b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
const has = (b: Uint8Array, needle: string) => hex(b).includes(needle);
const normFp = (s: string) => s.replace(/[^0-9a-f]/gi, '').toUpperCase();

/**
 * A verifier for Apple-signed JWS strings. Throws on anything wrong; returns
 * the decoded payload otherwise.
 */
export function appleJwsVerifier(rootFingerprints: string[] = [APPLE_ROOT_CA_G3_SHA256]) {
  const pinned = new Set(rootFingerprints.map(normFp));
  return async (jws: string): Promise<Record<string, unknown>> => {
    const parts = typeof jws === 'string' ? jws.split('.') : [];
    if (parts.length !== 3) throw new Error('jws: shape');
    const header = JSON.parse(new TextDecoder().decode(b64uToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64uToBytes(parts[1])));
    if (header?.alg !== 'ES256') throw new Error('jws: alg');
    if (!Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('jws: x5c');
    const [leaf, inter, root] = (header.x5c as string[]).map((c) => parseCert(b64ToBytes(c)));

    const fp = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', root.der))).toUpperCase();
    if (!pinned.has(fp)) throw new Error('jws: root');
    if (!has(inter.der, OID.appleIntermediate)) throw new Error('jws: intermediate oid');
    if (!has(leaf.der, OID.appleLeaf)) throw new Error('jws: leaf oid');
    const when = typeof payload?.signedDate === 'number' ? payload.signedDate : Date.now();
    for (const c of [leaf, inter, root]) {
      if (when < c.notBefore || when > c.notAfter) throw new Error('jws: expired');
    }
    if (!(await signedBy(inter, root)) || !(await signedBy(leaf, inter))) {
      throw new Error('jws: chain');
    }
    const { key, size } = await importKey(leaf);
    if (size !== 32) throw new Error('jws: leaf curve');
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64uToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) throw new Error('jws: signature');
    return payload as Record<string, unknown>;
  };
}

export type AppStoreDeps = {
  verify: (jws: string) => Promise<Record<string, unknown>>;
  bundleId: string;
  /** Locks the accounts linked to the download; returns how many. */
  rescind: (appTransactionId: string) => Promise<number>;
  log: (event: Record<string, unknown>) => void;
};

type Res = { status: number; body: unknown };

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export async function handleAppStoreNotification(
  req: { method: string; body: unknown },
  deps: AppStoreDeps,
): Promise<Res> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD' } };
  const signedPayload = obj(req.body)?.signedPayload;
  if (typeof signedPayload !== 'string') return { status: 400, body: { error: 'INVALID' } };

  let payload: Record<string, unknown>;
  try {
    payload = await deps.verify(signedPayload);
  } catch (e) {
    deps.log({ event: 'appstore_bad_signature', reason: String((e as Error).message) });
    return { status: 400, body: { error: 'SIGNATURE' } };
  }
  const type = String(payload.notificationType ?? '');
  const uuid = String(payload.notificationUUID ?? '');
  const info = obj(payload.appData) ?? obj(payload.data);
  if (info?.bundleId !== deps.bundleId) {
    deps.log({ event: 'appstore_wrong_app', type, uuid });
    return { status: 400, body: { error: 'BUNDLE' } };
  }
  const environment = String(info.environment ?? '');
  if (type !== 'RESCIND_CONSENT') {
    deps.log({ event: 'appstore_ignored', type, uuid, environment });
    return { status: 200, body: { ok: true } };
  }

  const inner = info.signedAppTransactionInfo;
  if (typeof inner !== 'string') return { status: 400, body: { error: 'INVALID' } };
  let tx: Record<string, unknown>;
  try {
    tx = await deps.verify(inner);
  } catch (e) {
    deps.log({ event: 'appstore_bad_signature', reason: String((e as Error).message), uuid });
    return { status: 400, body: { error: 'SIGNATURE' } };
  }
  const id = tx.appTransactionId;
  if (tx.bundleId !== deps.bundleId || typeof id !== 'string' || !id) {
    deps.log({ event: 'appstore_wrong_app', type, uuid });
    return { status: 400, body: { error: 'BUNDLE' } };
  }
  // A database error is a 500 on purpose: Apple retries, and rescind is idempotent.
  const locked = await deps.rescind(id);
  deps.log({ event: 'appstore_rescind_consent', uuid, environment, locked });
  return { status: 200, body: { ok: true } };
}
