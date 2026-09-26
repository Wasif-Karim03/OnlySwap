# SECURITY.md — Threat model and mitigations (LOCKED)

**Method:** STRIDE per component, plus abuse cases specific to a campus marketplace.

**Assets, most sensitive first:**
1. User identity (school email, and in R1.1 the link between Quad author and account)
2. Messages
3. Meetup times and places
4. Admin powers
5. Photos
6. Availability of the free-tier service

## 1. Trust boundaries

- **Device ↔ Supabase:** a JWT on every call. The anon key is public by design.
- **Device ↔ R2:** presigned PUT only (signed size and type); reads go through the media Worker.
- **Edge Functions / cron ↔ Supabase:** the service role. It's stored only in function secrets, Vault and GitHub secrets.
- **Admin SPA ↔ Supabase:** a user JWT at AAL2 plus `admins` rows.
- **Public web (`/l`, `/m`, `/i`):** anon RPCs that return minimal fields.

## 2. Threats and mitigations

| # | Threat (STRIDE) | Scenario | Mitigation | Test |
|---|---|---|---|---|
| T1 | Spoofing | Non-student signs up | domain allowlist in the `before_user_created` hook; OTP to the school inbox; blocked alumni/forwarding domains; yearly re-verify | T-INT-AUTH-01 |
| T2 | Spoofing | Password sign-up bypassing OTP | password path allowed only for exact `review_accounts` emails; "Confirm email" on | T-SEC-06 |
| T3 | Spoofing | OTP brute force | Supabase OTP limits (30 per 5 min per IP), 6 digits, 10-min expiry, client lockout after 5 | T-SEC-07 |
| T4 | Spoofing | Minor evades the age gate | OS age signal first; date fallback; `age_blocks` hash stops retries with the same email; Terms 18+ | T-INT-AUTH-04, E2E-02 |
| T5 | Tampering | Direct table writes via PostgREST | no table write grants; RPC-only writes; RLS on every table; `pg_graphql` off | T-SEC-01, T-SEC-19 |
| T6 | Tampering | JWT claim edits | signature verification by Supabase; writes read live state | T-SEC-02 |
| T7 | Tampering | Upload of oversized, HTML or SVG files, or path traversal | server-built keys; signed content-length and content-type; Worker serves type by extension + `nosniff` | T-SEC-08, T-SEC-18 |
| T8 | Repudiation | Admin denies an action | append-only `audit_log` (trigger blocks update/delete), actor from JWT, reason required | T-INT-ADMIN-02 |
| T9 | Information disclosure | User A reads B's offers, chats or saves | RLS matrix (DATA_MODEL §3), per-table tests | T-INT-RLS-* |
| T10 | Information disclosure | Cross-campus listing access | campus claim in RLS; X30 on deep links; photo keys are unguessable UUIDs. Residual: a leaked photo URL is viewable | T-INT-FEED-01 |
| T11 | Information disclosure | Realtime channel snooping | private channels + `realtime.messages` policies | T-INT-RT-01, T-SEC-16 |
| T12 | Information disclosure | Quad author de-anonymization (R1.1) | no select on quad tables; RPCs never return author ids; aliases per thread; opens only at ≥300 active users; reveal = owner + re-MFA + case ref + audit + receipt | T-INT-QUAD-ANON, T-SEC-04 |
| T13 | Information disclosure | Secrets in the app bundle | only `EXPO_PUBLIC_*` bundled; bundle scan in CI | T-SEC-12 |
| T14 | Information disclosure | Location leakage via photos | EXIF stripped by re-encode | T-UNIT-MEDIA-03 |
| T15 | Information disclosure | Meetup share link | 22-char token, expires start + 24 h, first names + spot only, `noindex`, disclosed at share time | T-INT-MEET-01 |
| T16 | Information disclosure | Email enumeration | `lookup_school` reveals only supported domains (public); uniform OTP and waitlist responses | T-SEC-11 |
| T17 | Denial of service | Media Worker quota exhaustion (100k/day) | long cache + client disk cache; per-IP limit; the domain (Q2) moves serving to the cache/WAF | Perf-10 |
| T18 | Denial of service | Spam writes fill the DB (500 MB) | per-action rate limits; new-account limits; pruning; alert at 350 MB | T-SEC-10 |
| T19 | Denial of service | Gmail sender lockout | drip ≤400/day; codes only when needed; Plan B Resend | Perf-14 |
| T20 | Elevation of privilege | Moderator bans or reveals | `require_admin(min)` role checks | T-INT-ADMIN-01 |
| T21 | Elevation of privilege | Admin takeover | TOTP on 2 devices; separate admin email; AAL2 on every admin RPC; 8 h session; receipts to a second address; admin `noindex` | T-SEC-03 |
| T22 | Elevation of privilege | Suspended user keeps acting | writes check live status; `revoke-sessions` global sign-out | T-INT-AUTH-06 |

## 3. Abuse cases (marketplace-specific)

| Abuse | Mitigation |
|---|---|
| Fake payment screenshots / "pay first" scams | Cash in person copy everywhere; client-side scam hint on incoming messages with payment-app words, URLs or phone numbers (SEC-06); report reason `scam`; safety center |
| Stolen goods | report reason `stolen` → priority review; Terms; cooperation with campus police |
| Prohibited items | banned list + `check_text` on title/description (block/review); category not allowed for weapons etc.; reports |
| Harassment in chat | chat only after the seller accepts; block kills the chat instantly; report with evidence snapshot |
| Meetup danger | public/police-designated spots; share-with-a-friend; "I'm here"; 911 shortcut; no-show tracking; no home addresses suggested |
| No-show griefing | reporter must be checked in; auto-confirm after 24 h; appeal |
| Report brigading | auto-hide needs 3 distinct reporters older than 7 days; always reviewed by a person |
| Multi-account abuse | each account needs a distinct school inbox; `banned_hashes` stop re-registration of banned emails |
| Offer spam | 10/h per campus setting; 5/day for new accounts |
| CSAM | Plan B: Cloudflare CSAM Scanning Tool on the custom-domain zone (free) (Q2). Always: fast takedown via admin, preserve evidence, NCMEC CyberTipline report (RELEASE runbook). Chat and Quad photos wait for R1.1 + scanning (DEC-3) |
| Self-harm / threats | report reasons with priority 1 → immediate email to the owner; crisis resources copy; law enforcement cooperation policy |

## 4. Secrets handling

| Secret | Where it lives | Rotation |
|---|---|---|
| Supabase service role | Supabase function secrets, Vault (for pg_net), GitHub Actions secret | after beta; on any suspicion |
| R2 access keys (scoped per bucket) | function secrets, GitHub secret (backups bucket only) | 6 months |
| Gmail app password / Resend key | function secrets, Supabase Auth SMTP settings | monthly (Plan A) |
| Expo access token, FCM JSON, APNs key | EAS (managed), function secrets (Expo token) | yearly |
| `EMAIL_HASH_PEPPER`, `QUAD_ALIAS_SECRET`, backup `age` key | Vault / password manager | never (rotating breaks hashes); stored offline too |
| Turnstile secret | function secrets | yearly |

**Rules:**
- `.env*` files are git-ignored; gitleaks runs pre-commit and in CI.
- EAS secrets use Secret visibility.
- There's no service key in the mobile app or the admin SPA, ever.

## 5. Platform hardening

- **Supabase:**
  - JWT expiry 3600 s with refresh-token rotation and reuse detection on.
  - "Confirm email" on.
  - OTP expiry 600 s, length 6.
  - `pg_graphql` dropped.
  - `anon` has no table grants.
  - Network restrictions aren't available on free; rely on RLS.
- **Web (`_headers`):**
  - `Content-Security-Policy`:
    - site: `default-src 'self'; img-src 'self' https://media.*; connect-src https://*.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com`
    - admin: `connect-src` Supabase + Sentry only
  - `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Content-Type-Options: nosniff`.
  - Admin also sends `X-Robots-Tag: noindex`.
- **Mobile:**
  - The session lives in SecureStore; MMKV is encrypted with a key from SecureStore.
  - No WebViews.
  - Certificate pinning isn't used (it's a maintenance risk on the free tier).
  - Release builds strip logs.
- **Dependencies:** pnpm lockfile, Dependabot, `pnpm audit --audit-level high` in CI, Expo modules pinned by SDK.
- **Backups:** encrypted with `age`; the key is kept offline.

## 6. Privacy commitments (must match the Privacy policy)

- **Tracking:** no ads, no tracking, no ATT prompt.
- **Analytics:** PostHog runs behavior-only (18 events). There's no autocapture, no replay, no IP/GeoIP. The ID is a hashed user id, and the app has an opt-out switch.
- **Crash reports:** Sentry has `sendDefaultPii: false` and no request bodies, with an opt-out switch.
- **Location:** no location permission in R1.0.
- **Messages** are never read by staff unless a report targets them. Every access is audited.
- **Retention** follows DATA_MODEL §5.
- **Deletion:** in-app and web. Account deletion is complete except the documented retention (reports 180 d, hashes, backups 30 d).

## 7. Incident response

- **Runbook:** RELEASE.md §7. Severity, containment flags and notification timelines are defined there.
- **CSAM process:**
  1. Remove the content.
  2. Preserve evidence privately (`onlyswap-private/evidence/`).
  3. Report to the NCMEC CyberTipline.
  4. Ban the account.
  5. Don't view or share the material beyond what's needed.
