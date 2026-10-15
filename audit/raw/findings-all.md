
### A Security

Detail, evidence and commands: [`notes/A-security.md`](notes/A-security.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| A-01 | FAIL | High | Quad author de-anonymised by any moderator, bypassing owner-only + fresh TOTP + audit reveal | For `target_type in (quad_post, quad_reply)` store/return no target user to moderators: null `target_user_id` in the admin RPC output and column-level revoke / owner-only view for reports; resolve the author only inside `admin_reveal_quad_author` | M |
| A-02 | FAIL | High | `quad.reveal` audit row stores `author_id` in `meta`; `audit_log` is readable by every moderator | Keep author id out of meta (store case_ref + target id only) or restrict audit rows `action like 'quad.%'` to owner | S |
| A-03 | FAIL | High | Age gate retry: after `confirm_age('os_signal', false)` (minor), the same account calls `confirm_age('os_signal', true)` and becomes adult | In `confirm_age`, refuse when an `age_blocks` row exists for the hash (return adult:false/BLOCKED) and set the profile to a blocked state | S |
| A-04 | RISK | Medium | Age gate trusts the client: `os_signal` `is_adult=true` and any typed `birth_date` are accepted with no server evidence | Accept as self-attestation (Apple/Google norm) but state it in Terms, log method (already `age_method`), consider reporting-based removal; do not claim verification | S (doc) |
| A-05 | FAIL | Medium | Moderator RLS is not campus-scoped: `is_admin('moderator')` lets any moderator `select` listings, profiles (email_hash, status_reason, strikes), offers, saves, swipes, blocks, ratings, saved_searches of ALL campuses via PostgREST | Add `a.campus_id is null or a.campus_id = row campus` to `private.is_admin` callers (scoped helper) | M |
| A-06 | RISK | Medium | Turnstile skipped when the request has no `Origin` header (`if (req.origin)`) on waitlist-request and support-request; attacker omits the header | Require the token unless a signed app attestation header is present; or always require Turnstile and let the app use a separate path | S |
| A-07 | RISK | Low | `clientIp` takes the first `x-forwarded-for` entry when `cf-connecting-ip` is missing, which a client can spoof (local/`functions serve`; hosted sits behind Cloudflare so likely fine) | Prefer the last trusted hop or only `cf-connecting-ip` | S |
| A-08 | RISK | Low | `realtime.send()` is executable by the `authenticated` DB role (could inject broadcasts into `chat:{id}`/`user:{id}`); not reachable through the Data API (exposed schemas are public + graphql_public) and clients have no INSERT policy | `revoke execute on function realtime.send from authenticated, anon` if the platform allows | S |
| A-09 | RISK | Low | OTP guessing: only an IP-based limit (30 verifications / 5 min) plus a client-side lockout; 6 digits, 10 min. No per-account verify throttle in this repo | Verify the hosted project has the per-user OTP attempt limit; add Turnstile/captcha on sign-in | S |
| A-10 | RISK | Low | `delete-account` and `export-data` need only a valid access token (up to 1 h old) and the typed word DELETE; no recent re-auth | Require a fresh OTP (session age < 5 min) for deletion | S |
| A-11 | RISK | Low | Quad auto-hide at 3 open reports does not check reporter account age (SECURITY says >=7 days), so 3 new accounts can hide any post | Count only reporters older than 7 days, as the spec says | S |
| A-12 | RISK | Low | `hide_quad_author` hides every post and reply by that author, which lets the hider link posts across threads despite per-thread aliases | Hide per post/thread, or accept and document | S |
| A-13 | RISK | Low | Upload server never inspects bytes: EXIF stripping (WebP re-encode, `lib/media.ts`) is client-side only, type/size are signed but content is not validated; 60 URL requests/h x 16 files per user | Optional: server/Worker check of magic bytes; storage quota per user | M |
| A-14 | RISK | Low | Media Worker: `workers_dev = true` keeps an un-fronted public URL; signed chat URLs are bearer links valid up to 3 h; per-isolate rate limit only | Disable workers.dev once the domain exists; shorten TTL | S |
| A-15 | RISK | Low | Web app CSP allows `connect-src https://*.workers.dev` and `img-src https:` (exfil channels); local `allowBackup="true"` in the generated Android manifest | Pin exact worker host; set `allowBackup=false` | S |
| A-16 | RISK | Low | Sign-up hook returns distinct codes `AGE_BLOCKED` / `BANNED` for an email, an oracle for whether a school address was flagged | Return `SCHOOL_UNKNOWN` for all rejections | S |
| A-17 | RISK | Low | `test-inbox` (verify_jwt=false) mints login codes for `e2e+*@e2e.onlyswap.test`; guarded by APP_ENV, E2E_SECRET (>=16) and 404 on prod | Confirm never deployed to prod and that the e2e domain is not in prod `campus_domains` | S |
| A-18 | RISK | Low | Dependencies: osv/pnpm audit show 3 high + 3 moderate (braces, http-cache-semantics, node-forge; all marked ignored in pnpm config, dev tooling) | Bump via overrides when patched | S |
| A-19 | NOT TESTED | Low | `graphql_public` is in `[api] schemas` (config.toml:13) while SECURITY says pg_graphql is dropped; extension is absent locally | Remove from `schemas`, confirm on hosted | S |

### B Privacy and store compliance

Detail, evidence and commands: [`notes/B-privacy-compliance.md`](notes/B-privacy-compliance.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| B-09 | FAIL | High | 18+ gate enforcement | See A-03 | S |
| B-01 | FAIL | Medium | `track_events` is a second analytics pipeline that ignores the analytics opt-out (F12). It stores per user id: cards shown, listing views with time on page and source, search text (up to 80 chars), app opens, device type, app version. SECURITY section 6 promises behaviour-only PostHog with an opt-out and no content | Either honour `analytics_opt_in` in the client and the RPC, or state it plainly in the Privacy policy and the store forms (search history, product interaction, linked to identity) and drop search text | M |
| B-02 | FAIL | Medium | Data export omits `activity_events` (and `account_deletions`) although they are user-linked | Add it to the export | S |
| B-03 | FAIL | Medium | Closed-chat archives `archive/chats/{chat}.json` (private R2) are not removed on account deletion; DATA_MODEL section 5 says archives are deleted on account deletion. `prepare_account_deletion` only returns prefixes `c/{campus}/u/{uid}/`, `c/.../l/{id}/`, `share/{id}.jpg` | Delete archives for chats the user took part in (or anonymise the JSON) in `deleteAccount` | M |
| B-04 | RISK | Low | Deletion leaves the user's chat message bodies in the other person's chat (sender nulled, system "This account was deleted"); reports kept 180 d; banned hash kept. Documented, so only the Privacy policy wording needs to match | Make the policy say message text stays visible to the other party | S |
| B-05 | RISK | Low | `account_deleted` email is queued inside `prepare_account_deletion`, before R2 cleanup and the Auth delete; if those fail the user got a goodbye email but the account exists | Queue the email after `deleteUser` succeeds | S |
| B-06 | RISK | Low | Sentry: `beforeSend` scrubs user/request/extra/breadcrumbs, but 5% performance transactions (`tracesSampleRate 0.05`) bypass `beforeSend` (no `beforeSendTransaction`), and exception messages and route names with ids are not scrubbed | Add `beforeSendTransaction` (strip ids from names) or set traces to 0 | S |
| B-07 | RISK | Low | Apple privacy manifest: app config declares UserDefaults CA92.1 and FileTimestamp C617.1 only; generated prebuild also has SystemBootTime 35F9.1; DiskSpace not declared. Tracking false, no tracking domains | Run Xcode "Generate Privacy Report" on the archive; add missing reasons to `privacyManifests` | S |
| B-08 | RISK | Low | PostHog identity hash is `sha256("onlyswap:"+user_id)` without a secret; anyone holding a user id can compute it | Acceptable (ids are not public); note only | - |
| B-10 | ? | - | PostHog: exactly the 18 events of PRD 5.4 (`EVENT_NAMES`), values pass a strict regex and numeric cap, `personProfiles identified_only`, replay off, geoip off, lifecycle events off, opt-out stored first and honoured | `lib/analytics.ts` |  |
| B-11 | ? | - | Sentry `sendDefaultPii:false`, no screenshots/view hierarchy, http breadcrumbs dropped, opt-out drops events, DSN only via `EXPO_PUBLIC_SENTRY_DSN` | `lib/sentry.ts` |  |
| B-12 | ? | - | Permissions: iOS camera and photos strings only, no location, no microphone, no Face ID, no ATT, `NSAllowsArbitraryLoads=false`; dev-only network keys stripped from release; Android blocks location, READ_MEDIA_*, storage, contacts, record audio, AD_ID, exact alarms, foreground service (35 `tools:node="remove"` entries); photos use the system picker | `app.config.ts:24-60,178-230`, `plugins/withReleaseHardening.js`, generated manifest |  |
| B-13 | ? | - | Account deletion in app (Settings) and on web (`apps/site/src/pages/delete.astro`, email code then the same `delete-account` function); typed confirmation; 3/day limit; R2 prefixes for avatar, listings, share cards deleted; open-report evidence moved to the private bucket first; Auth user delete cascades profile data; underage mode only for accounts with an `age_blocks` row | `deleteAccount.ts`, `prepare_account_deletion` |  |
| B-14 | ? | - | Data export: `export-data` (JWT, rate limited, JSON to private bucket, presigned GET with expiry, row in `data_exports`) covers profile, settings, listings, offers, chats, messages, swipes, saves, ratings, Quad posts/votes, push token ending only | `export_user_data` (gap: B-02) |  |
| B-15 | ? | - | UGC safety (Apple 1.2): `create_report` for listing, user, chat, message, Quad post, Quad reply with 15 reasons and evidence snapshot, rate limit 20/day; `block_user`/`unblock_user` (instantly closes chat access); Quad hide author and keyword mute; banned-word `check_text` on listings and Quad (PII patterns blocked); admin moderation with reasons, audit log, appeals; priority-1 reasons for threats, self-harm, minors | RPC list, `create_report`, `quad.test.sql` |  |
| B-16 | ? | - | Push token handling: registered by RPC, platform and version validated, disabled on sign-out, only `token_ending` exported | `lib/push.ts`, `register_push_token` |  |

### C Memory and resources

Detail, evidence and commands: [`notes/C-memory.md`](notes/C-memory.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| C-03 | FAIL | High | Server data cached across accounts | On `SIGNED_OUT` (the `onAuthStateChange` in telemetry/sessionExpiry) call `queryClient.clear()` and clear the chat `stores` Map, swipe queue and activity buffer | S |
| C-04 | RISK | Medium | Chat store cache | Key the Map by `(userId, chatId)` or hold `me` in a ref the store reads; clear on sign-out; LRU cap ~20 | S |
| C-08 | RISK | Medium | List configs | Move Inbox to FlashList with `getItemType` (offer vs chat vs header); add `getItemType` to feeds | M |
| C-05 | RISK | Low | Chat list growth | Cap in-memory page count, set `windowSize` 7-9, extract `MessageRow` | M |
| C-10 | RISK | Low | Infinite queries without `maxPages` | `maxPages: 10` (needs `getPreviousPageParam`) | S |
| C-12 | RISK | Low | Tabs stay mounted | `freezeOnBlur: true` on tab screens (react-native-screens) | S |
| C-13 | NOT TESTED | - | Long-session soak (30+ min) | See "Run it" below | - |
| C-14 | NOT TESTED | - | Android/iOS memory sampling, Hermes heap | - | - |

### D Rendering performance

Detail, evidence and commands: [`notes/D-rendering.md`](notes/D-rendering.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| D-01 | RISK | Medium | Bundle size, Android release (Hermes) | Lazy-load Spanish strings; drop `@expo/ui` / `expo-symbols` if the custom Icon set covers it; check unused supabase sub-clients (storage-js is bundled, are Storage calls used? Media is R2); Sentry `@sentry/browser` + `feedback` come from the RN SDK, add a Metro alias or tree-shake config to drop feedback widget | M |
| D-03 | RISK | Medium | Startup work | Defer `startTelemetry` PostHog init and `startWidgetSync` to after first route (`InteractionManager.runAfterInteractions`); measure with `expo-router` `unstable_settings` / Hermes sampling profiler; lower backstop to 1.5 s | M |
| D-05 | RISK | Medium | Per-instance accessibility/motion hooks | One module-level Zustand store (or context) for reduce motion and screen reader, fed by one listener; keep per-instance only the shared value | S |
| D-02 | RISK | Low | Large asset | Identify the package (likely a vector-icons font via expo-router/@expo/ui) and exclude if unused | S |
| D-06 | RISK | Low | `Text` subscribes to window size | Read `fontScale` from a single store/context and pass key from parent | S |
| D-07 | RISK | Low | Gesture rebuilt per render | `useMemo` the gesture or confirm compiler output | S |
| D-08 | RISK | Low | Heavy renders | See C-05, C-08 | M |
| D-10 | RISK | Low | Dev code in release | `require` the dev screen inside the `__DEV__` branch | S |
| D-11 | NOT TESTED | - | Measured FPS / TTI / JS block | Android: Perfetto + `adb shell dumpsys gfxinfo app.onlyswap framestats` over the soak flow; iOS: Instruments Time Profiler + Hitches template; JS: Flipper/RN DevTools profiler for tasks > 100 ms; TTI: `adb shell am start -W app.onlyswap/.MainActivity` x 10 cold | - |

### E Backend scalability

Detail, evidence and commands: [`notes/E-scalability.md`](notes/E-scalability.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| E-01 | FAIL | Critical | `search_listings` and `search_suggest` scan every campus listing. Predicate `private.text_matches(l,q)` is an opaque function (ts match OR word_similarity>=0.5), so the GIN indexes on `search` and `title` are never used. ~35 us/row x ~10.7k rows = 200 to 350 ms per call. `search_listings` also uses OFFSET paging. Typeahead (`search_suggest`, 600/h limit) fires per keystroke. | Rewrite as UNION of two indexable branches (`search @@ tsq` on GIN, `title %> q` on gin_trgm_ops), keyset paging, min 2 to 3 chars and client debounce, cap suggest to 5 rows. | M |
| E-03 | FAIL | Critical | `activity_events` retention (90 d) vs 500 MB DB cap. 343 B/row incl. 5 indexes; ~64 events per DAU per day (deck_shown per card, swiped_left per swipe, listing_viewed, saved, app_open). | Drop `deck_shown` and `swiped_left` events (derivable from swipes) or sample them; cut retention to 14 to 30 d; drop 3 of 5 indexes; aggregate to daily counters. | S |
| E-23 | FAIL | Critical | Search/quad drag the whole DB down: at peak 250 VUs with search+quad, 39% 5xx and DB CPU 1302%; without them 0.05% errors at ~1 core. | Same fix as E-01 and E-02. | M |
| E-02 | FAIL | High | `get_quad_feed` seq-scans all campus posts and computes `quad_hot` / `quad_hidden_for` per row, OFFSET paging. 144 ms (hot), 79 ms (new) at 3k posts; grows linearly with posts. | Store a materialised hot score (updated on vote/reply or by cron), index `(campus_id, hot_score desc, id)`, keyset paging. Filter hidden via anti-join on an indexed table. | M |
| E-04 | FAIL | High | Other retention vs 500 MB: swipes (only `dir='left'` pruned at 30 d, rights kept forever), notifications 60 d, messages kept 90 d after chat closes, offers and listings grow forever. | Move to Pro ($25/mo, 8 GB) before 1k DAU, or shorten retention and archive chats to R2. Owner decision (rule 2: $0). | M |
| E-05 | FAIL | High | `make_offer` deadlocks on concurrent first offers for one listing. It takes `select ... from listings for share`, then `update listings set offer_count = offer_count + 1`; two sessions each hold SHARE then both want UPDATE. | `for key share` or `for no key update` on the listing select, or drop `offer_count` from the hot path (count async / derive). Add pgTAP concurrency test. | S |
| E-07 | RISK | High | Media Worker sets `Cache-Control: immutable` but never uses the Cache API, so every image GET runs the Worker plus an R2 GET (Class B). On workers.dev the cap is 100k requests/day. | Add `caches.default` match/put in the Worker, serve through a custom domain with Cloudflare cache (planned Q2), or give R2 a public custom domain. | S |
| E-08 | RISK | High | Gmail SMTP (Plan A) caps at 500 recipients/day (24 h suspension if exceeded). Launch day ~2,600 OTP emails. | Switch to Resend (Plan B, free 100/day or 3k/mo, check) or another provider before launch; stagger campus launches; raise Supabase custom SMTP rate limit. | S |
| E-09 | RISK | High | Realtime: each chat message calls `realtime.send` 3 times (chat topic plus two inbox topics) from `messages_ai`. Concurrent sockets and messages/month exceed free caps at 5k DAU. | Send inbox broadcast only (drop chat topic when peer not in chat), or poll inbox. Unsubscribe when app backgrounded (already focus-scoped). Pro tier lifts cap. | M |
| E-20 | FAIL | High | Egress: JSON responses are large (get_feed 17 KB, get_campus_feed 19 KB, get_inbox 19 KB, search 26 KB). ~244 KB per session raw. | Trim columns (feed cards need ~6 fields), smaller page for inbox, `Accept-Encoding: gzip` verified, cache `get_campus_feed` client-side longer. Pro plan has 250 GB. | M |
| E-06 | RISK | Medium | PostgREST pool is 10 connections, local `[db.pooler]` disabled. Under saturation requests queue then fail with PGRST003. Hosted Nano/Micro: 60 direct and 200 pooler client connections (Supabase docs); default pool size not confirmed. | Keep every RPC under ~50 ms (E-01/E-02 first). Do not use session-mode pooling for the app. Check Dashboard pool size on staging. | S |
| E-10 | RISK | Medium | `get_inbox` and `my_listings` are unbounded (all offers in window plus all chats, `chat_summary` per chat). | Add limit + keyset cursor; return counts only for the tab badge. | M |
| E-11 | FAIL | Medium | `cron.job_run_details` is never pruned. ~4,800 rows/day (~1.7 MB/day, ~600 MB/yr) from per-minute jobs. | Add a daily `delete from cron.job_run_details where end_time < now() - interval '3 days'` job (or `cron.log_run = off` for frequent jobs). | S |
| E-21 | NOT TESTED | Medium | OTP burst: 1043 sends in 70 s, p50 29 / p95 77 ms, 2 x 429. Local limits not enforced, so hosted behaviour unknown. | Test against staging only with owner approval; verify SMTP rate limit in Dashboard. | S |
| E-22 | NOT TESTED | Medium | R2 upload path (`upload-url` Edge Function plus 2 R2 PUTs per photo). | Test on staging. Maths: 2,000 photos/day, 300 per peak hour, Class A ~120k/mo (fine vs 1M). | S |
| E-12 | RISK | Low | Every RPC does a `private.hit()` upsert into `rate_counters` and `require_active` writes `activity_days`: a write per read. `rate_counters` is 2.7 MB for 76 rows (bloat). | Skip `hit()` on read RPCs; tune autovacuum on `rate_counters`; write `activity_days` once per day via cached check. | S |
| E-13 | RISK | Low | `get_campus_feed` runs `count(*)` over active listings plus a profiles count on every call. 5.1 ms at 10.7k listings, linear. | Read counts from `refresh_stats` (cron already exists, 425 ms / 10 min). | S |
| E-14 | RISK | Low | RLS: 21 policies use bare `auth.uid()` (not `(select auth.uid())`) and `private.is_admin()` per row. | Wrap in `(select auth.uid())` the next time those policies are touched. | S |
| E-15 | RISK | Low | Unindexed FKs: `messages.sender_id` (ON DELETE SET NULL) and `listings.hold_offer_id`. Account deletion seq-scans `messages` (~20 ms at 200k, linear). | Add partial indexes `where sender_id is not null`; or batch deletion in `delete-account`. | S |

### F Reliability

Detail, evidence and commands: [`notes/F-reliability.md`](notes/F-reliability.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| F-08 | FAIL | High | Error boundaries | export ErrorBoundary from app/_layout.tsx (Expo Router) with a retry screen + Sentry capture; a render crash otherwise white-screens/closes. Note open "Android grey screen after posting" (NOTES.md) may be exactly this | S |
| F-10 | RISK | Medium | Sentry admin + site | admin console errors invisible; add free browser SDK or accept (owner only user) | S |
| F-12 | RISK | Medium | EAS Update strategy | write 3-line rollback (eas update:republish / rollout-percentage) in runbook; note NOTES.md: fingerprint changed by 630885b so existing builds miss OTA | XS |
| F-17 | RISK | Medium | Crons liveness | add cron-last-run check to health fn | S |
| F-06 | RISK | Low | Optimistic updates with rollback | audit remaining write paths for pending/error state | S |
| F-16 | RISK | Low | Env separation | confirm distinct refs/keys at prod creation | XS |

### F Reliability (DB races)

Detail, evidence and commands: [`notes/E-scalability.md`](notes/E-scalability.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| FR-02 | FAIL | High | Concurrent first offers on one listing. | See E-05. | S |
| FR-05 | RISK | Low | `create_listing` double submit with same reserved id. | Catch `unique_violation` and return the existing row (same pattern as send_message). Client retry already recovers. | S |

### G Abuse, trust and safety

Detail, evidence and commands: [`notes/G-abuse.md`](notes/G-abuse.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| G-02 | FAIL | High | Ban evasion via plus alias | normalise local-part (strip +tag, for gmail-like hosts dots) before hashing in hook + admin ban + age_blocks; also rejects extra accounts. Most .edu are M365/Google which accept +tags | S |
| G-01 | RISK | Medium | OTP request limits | max_frequency 1s allows mail-bomb of a victim's .edu and burns shared Gmail SMTP quota (~500/day Plan A); set 60s and verify hosted config matches (config.toml is local) | XS |
| G-06 | RISK | Medium | Links in chat | phishing/off-platform payment scam links in chat; add banned_words regex for payment apps/short links, or review on first links from new accounts | S |
| G-07 | RISK | Medium | News link_url | route news with link from accounts <7d to review, or check_text scope; confirm moderation status in create_news | S |
| G-11 | RISK | Medium | Admin capacity | no on-call alert if queue stale beyond emails; add second moderator before opening Quad (OWNER_TODO 22) | - |
| G-03 | RISK | Low | Device bans | accept for R1.0; rely on 18+ edu mail | - |
| G-08 | RISK | Low | Price sanity | cap price server-side (e.g. <= 5000) | XS |
| G-10 | RISK | Low | record_view / relist_listing unlimited | view-count inflation, relist bumping; add hit | XS |

### H Code quality and tests

Detail, evidence and commands: [`notes/H-code-quality.md`](notes/H-code-quality.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| H-07 | RISK | Medium | Unit tests | Set `testTimeout: 20000` in jest.config.js or per-test; check CI runner contention | S |
| H-10 | RISK | Medium | Critical paths lacking tests | Add contract-style tests that assert each api.ts calls the right RPC name/params (mock supabase), a realtime test with the real `supabaseRealtime` against a fake client, and a sign-out test | M |
| H-05 | RISK | Low | knip | Delete ShellScreen, trim exports, add knip config with entry `app.config.ts`, `.maestro/**` | S |
| H-08 | RISK | Low | Coverage | Add `coverageThreshold` (e.g. lines 80, functions 70) | S |
| H-11 | RISK | Low | CI gates (.github/workflows/ci.yml) | Add bundle-size budget step (`expo export` + check .hbc size < 8 MB) and coverage threshold | S |
| H-12 | ? | - | Housekeeping from this audit | - |  |

### I Accessibility

Detail, evidence and commands: [`notes/I-accessibility.md`](notes/I-accessibility.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| I-05 | FAIL | High | Contrast, light | Darken ink3 text to about #6F6F68 (5.1:1 on white, 4.55 on bg2) for text, keep the light grey for icons/dividers; use a darker red text token (e.g. #C8321C, 5.3:1 on white, 4.6 on redBg); nudge green to #12703F (5.4:1) | S |
| I-04 | FAIL | Medium | 44 pt targets | Add `hitSlop` of 4 pt top/bottom (or `minHeight: size.hit` with a visually smaller pill) to Button S and Chip; add a Jest test that asserts `minHeight >= hit` or hitSlop | S |
| I-06 | FAIL | Medium | Contrast, dark | Lighten dark ink3 to about #9A9A93 (5.05:1 on card, 6.1 on bg2) | S |
| I-09 | RISK | Medium | Small screens (iPhone SE 320-375 pt wide) | Verify on the SE-sized simulator; wrap OTP cells or size by width; icon-only tab labels at font scale > 1.4 | S |
| I-07 | RISK | Low | Accent usage | Make the focused/active input border `ink` (check Input.tsx) | S |
| I-10 | RISK | Low | Tappable double-tap guard | Disable guard for `Stepper`/toggles (prop exists: `guard={false}`) | S |
| I-11 | NOT TESTED | - | Device checks (VoiceOver/TalkBack walk, focus order, 200% type, Switch Control) | Manual run per docs/TESTING.md a11y section | - |

### J Launch operations

Detail, evidence and commands: [`notes/J-launch-ops.md`](notes/J-launch-ops.md)

| ID | Result | Severity | Finding | Recommended fix | Effort |
|---|---|---|---|---|---|
| J-02 | FAIL | High | Incident runbook | write incident.md (kill switch via app_config maintenance, rollback OTA, restore, comms, postmortem) before launch | S |
| J-05 | RISK | High | Store assets/metadata | blocking owner decisions 19-21 before submission (UGC app: Apple 1.2 needs report/block/24h review, present) | M |
| J-06 | RISK | High | Admin MFA off on staging | launch toggle `update private.admin_settings set mfa_required=true;` is one manual SQL line on prod, easy to forget; add to docs/RELEASE.md launch checklist and a pre-launch assertion/verify script; note prod default is also false (0211:14 inserts false) | XS |
| J-07 | RISK | High | Prod environment | - | L |
| J-08 | RISK | High | Phone builds | resolve before any release (likely related to F-08) | M |
| J-01 | RISK | Medium | Monitoring | all are manual owner setup (OWNER_TODO 14), email-only, nothing pages at 2 a.m.; add phone push for UptimeRobot, no Sentry alert rules in repo | S |
| J-04 | RISK | Medium | Store review demo account | run on prod and test login from clean install before submission | XS |
