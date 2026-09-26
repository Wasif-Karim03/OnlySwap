# TESTING.md — Test plan (LOCKED)

This is the full test plan. Tests tagged **[R1.1]** run once that release starts.

The review added the tests in §8. Every accepted review finding maps to at least one test (REVIEW.md §8).

**CI gates on every PR:**
- lint (incl. `eslint-plugin-react-native-a11y`)
- typecheck
- Jest
- pgTAP (when `supabase/**` changes)
- contract test
- bundle secret scan
- `pnpm audit --audit-level high`
- gitleaks

All tools are free.

| Level | Tool | Location | Runs |
|---|---|---|---|
| Unit | Jest (`jest-expo`) + React Native Testing Library | `apps/mobile/src/**/__tests__/*.test.ts(x)` | every PR |
| DB / RLS / RPC | pgTAP via `supabase test db` | `supabase/tests/*.test.sql` | every PR |
| Integration | Jest against local Supabase (Docker), with the service key only in test | `apps/mobile/test/integration` | every PR |
| Edge Functions | Deno test | `supabase/functions/**/*_test.ts` | every PR |
| E2E mobile | Maestro CLI | `apps/mobile/.maestro/*.yaml` | before every release, on a local simulator/emulator |
| E2E web and admin | Playwright + @axe-core/playwright | `apps/admin/e2e`, `apps/mobile/e2e-web` | before every release |

Fixtures for pgTAP and integration tests live in `supabase/tests/fixtures.sql`:

- campuses `osu` (live) and `umich` (waitlist)
- users **A** (osu seller), **B** (osu buyer), **C** (osu third party), **D** (umich)
- **MOD** (moderator, aal2), **OWN** (owner, aal2), **NOMFA** (owner at aal1)
- anon

Helpers `tests.authenticate_as(uid, aal)` and `tests.clear_authentication()` come from `supabase-test-helpers` (free, installable with `dbdev` or by copying the SQL).

---

## 1. Unit tests (per module)

| ID | Module | Cases |
|---|---|---|
| T-UNIT-LIB-01 | `lib/errors.toAppError` | P0001 parse with and without retryAt; network error → ERR_OFFLINE; 401 → SESSION_EXPIRED; unknown |
| T-UNIT-LIB-02 | `lib/errors.errorCopy` | every code in `ErrorCode` has copy (snapshot); RATE_LIMITED time formatted in campus TZ |
| T-UNIT-LIB-03 | `lib/rpc` | retries once after a token refresh on 401; no args in the breadcrumb |
| T-UNIT-LIB-04 | `lib/format` | formatPrice 0 → Free, 4000 → $40, 123456 → $1,234.56; formatRelative for minutes, hours, yesterday, dates, future |
| T-UNIT-LIB-05 | `lib/version.compareVersions` | equal, greater, lesser, build metadata ignored |
| T-UNIT-LIB-06 | `lib/deeplinks.parse` | `/l/{uuid}`, `/q/{uuid}`, `/i/{code}`, scheme and https forms, garbage → null, other-campus flag |
| T-UNIT-LIB-07 | `lib/analytics.track` | no-op when opted out; strips non-allowlisted props; no email/name props allowed |
| T-UNIT-LIB-08 | `lib/storage` | typed get/set; migration from v1 keys |
| T-UNIT-AUTH-01 | `auth/logic.validateName` | unicode letters, hyphen, apostrophe; digits rejected; length bounds |
| T-UNIT-AUTH-02 | `auth/api.lookupSchool` | personal domains short-circuit; lowercase; trims spaces |
| T-UNIT-AUTH-03 | `auth/useAppGate` | every gate combination (maintenance, version, session, statuses, age, rules) → expected route |
| T-UNIT-AUTH-04 | `auth/age.requestAgeSignal` | adult, minor, unknown, timeout → unknown; never calls track |
| T-UNIT-AUTH-05 | Verify code attempt counter | 5 wrong → 5-min lockout; resend resets the timer only |
| T-UNIT-MEDIA-01 | `processPhoto` size | output long edge 1080/400; full under 2 MB (re-encode path) |
| T-UNIT-MEDIA-02 | `processPhoto` formats | HEIC/PNG/JPEG inputs → WebP |
| T-UNIT-MEDIA-03 | EXIF strip | fixture JPEG with GPS → output has no EXIF GPS tags (`exifr` in node test) |
| T-UNIT-MEDIA-04 | `uploadPhotos` | 3 retries with backoff; 403 re-requests the URL once; progress callback totals 100% |
| T-UNIT-MEDIA-05 | blurhash | produced for the thumbnail, 4×3 components |
| T-UNIT-SELL-01 | `useDraft` | autosave debounce; restore after reload; schema version mismatch discards |
| T-UNIT-SELL-02 | Sell validation | all D3 errors at once; price bounds; free toggle forces 0 |
| T-UNIT-FEED-01 | `useSwipe` batching | flush at 10, on blur, on background; offline queue cap 200; undo within 5 s removes the pending item |
| T-UNIT-FEED-02 | `SwipeDeck` gesture math | threshold 35% width / velocity 800; rotation clamp ±12°; programmatic swipe |
| T-UNIT-FEED-03 | SwipeDeck a11y | screen reader on → list mode with 4 actions |
| T-UNIT-OFF-01 | Offer sheet logic | quick amounts (ask, −10%, −20% rounded to $1); low-offer warning under 50% |
| T-UNIT-OFF-02 | Offer status → UI state map | every status × role pair → expected component (E3–E8) |
| T-UNIT-CHAT-01 | `useChat` merge | dedupe by id and client_id; order by id; reconnect fetches since last id |
| T-UNIT-CHAT-02 | Send queue | offline messages sent in order on reconnect; failure marks retry |
| T-UNIT-CHAT-03 **[R1.1]** | Photo blur rule | blurred when the sender has no prior revealed photo in the chat; reveal is local |
| T-UNIT-MEET-01 | Directions deep link | builds `maps://?daddr=lat,lng` (iOS) / `geo:` + `google.navigation` intent (Android) / web fallback |
| T-UNIT-MEET-02 | Meetup state derivation | before, T−30, here/late, cancelled, rescheduled, no-show window (≥ +20 min) |
| T-UNIT-DEAL-01 | `maybeAskForReview` | ≥3 swaps and 14 d and 120 d since last; never after fell-through/no-show |
| T-UNIT-QUAD-01 **[R1.1]** | Vote optimistic | toggle same vote removes; debounce last-wins |
| T-UNIT-QUAD-02 **[R1.1]** | Poll builder | 2–4 options, 1–40 chars each |
| T-UNIT-NOTIF-01 | `handleNotificationResponse` | each notification type's data.url → correct route |
| T-UNIT-NOTIF-02 | Android channels | created with the correct importance per group |
| T-UNIT-TOK-01 | Token contrast | all body text pairs ≥ 4.5:1, large text ≥ 3:1, in light and dark, for every accent option |
| T-UNIT-CMP-* | Components | Button loading keeps width and blocks double tap; Input error announces; Sheet closes on Android back; PermissionPrimer state machine |
| T-FN-01 | `_shared/expoPush` | chunks of 100; backoff on 429; DeviceNotRegistered handling |
| T-FN-02 | `send-push` rules | prefs off → skipped; quiet hours skip non-urgent (campus TZ); time-sensitive bypass; cap 6; message preview off → generic body |
| T-FN-03 | `_shared/mailer` + templates | each template renders subject, text and html; snapshot; no em dashes in copy (Voice rule) |
| T-FN-04 | `upload-url` | size and type validation; key format; owner check via `can_upload` mock |
| T-FN-05 | `delete-account` | calls R2 deletePrefix for all prefixes; underage mode skips the email |
| T-FN-06 | `waitlist-request` / `support-request` | Turnstile required on web; IP rate limit; duplicate silent |

## 2. Integration tests: API + DB + access rules (pgTAP)

### 2.1 RLS matrix: "user A cannot see or edit user B's data" for every table

For every table, `supabase/tests/rls_<table>.test.sql` asserts all of the following:

- A's own rows are visible or not per spec.
- B's private rows are **not selectable** by A: `is_empty`.
- Direct insert, update and delete by A on B's rows **fail** (`throws_ok` or 0 rows affected).
- D (other campus) sees nothing campus-scoped.
- anon sees nothing (except the public RPCs).
- Admin reads need aal2: NOMFA gets 0 rows.

| Table | A select own | A select B's | A write B's | D (other campus) | anon | Special |
|---|---|---|---|---|---|---|
| profiles | ✓ | only `public_profiles` columns | ✗ | ✗ | ✗ | A can't update `status`, `strike_count` or `campus_id` directly |
| campus_domains | ✗ | ✗ | ✗ | ✗ | ✗ | only through `lookup_school` |
| listings | ✓ (all statuses) | active/hold/sold only | ✗ | ✗ | ✗ | blocked seller's listings hidden both ways |
| listing_photos | ✓ | if listing visible | ✗ | ✗ | ✗ | |
| swipes / saves / watches | ✓ | ✗ | ✗ | ✗ | ✗ | |
| saved_searches | ✓ | ✗ | ✗ | ✗ | ✗ | max 20 |
| offers | ✓ as buyer/seller | ✗ (C can't see A–B offer) | ✗ | ✗ | ✗ | |
| chats / messages | participants | ✗ (C) | ✗ | ✗ | ✗ | direct insert into messages denied; only `send_message` |
| meetups / noshow_reports | participants / reporter | ✗ | ✗ | ✗ | ✗ | |
| ratings | own given | only via `ratings_visible` after both rated or 7 d | ✗ | ✗ | ✗ | |
| blocks | own | ✗ | ✗ | ✗ | ✗ | |
| quad_posts / quad_replies | ✗ direct (even own) | ✗ | ✗ | ✗ | ✗ | `author_id` never returned by any RPC (T-INT-QUAD-ANON) |
| quad_votes / quad_mutes | own | ✗ | ✗ | ✗ | ✗ | |
| quad_hides | ✗ direct | ✗ | ✗ | ✗ | ✗ | `get_my_quad_hides` returns no author ids |
| reports | own via `my_reports` (no target_user_id) | ✗ | ✗ | ✗ | ✗ | |
| strikes / appeals | own | ✗ | ✗ | ✗ | ✗ | |
| notifications / notification_prefs / push_tokens | own | ✗ | ✗ | ✗ | ✗ | |
| announcements | own campus pinned | — | ✗ | ✗ | ✗ | |
| data_exports | own | ✗ | ✗ | ✗ | ✗ | |
| banned_words / rate_counters / email_outbox / age_blocks / banned_hashes / waitlist_requests / review_accounts / support_requests / activity_days / daily_counters / listing_reservations / common_first_names / listing_price_changes / push_tickets | ✗ | ✗ | ✗ | ✗ | ✗ | service role only |
| audit_log | ✗ (users) | ✗ | ✗ | ✗ | ✗ | admin aal2 select; update/delete throws even for service role |
| admins / app_config | ✗ / public keys only | ✗ | ✗ | ✗ | public keys only | |
| realtime.messages | `chat:{mine}`, `user:{me}` | ✗ `chat:{A-B}` for C | — | ✗ | ✗ | T-INT-RT-01 |

### 2.2 RPC behavior tests

| ID | Cases |
|---|---|
| T-INT-AUTH-01 | hook rejects an unknown domain, a blocked domain, an age-blocked hash, a banned hash, and a review-domain email not in `review_accounts`; allows student and review-listed emails |
| T-INT-AUTH-02 | access-token hook claims are correct for each status and admin role |
| T-INT-AUTH-03 | profile auto-created with the campus and waitlist status when the campus isn't live; invite link recorded |
| T-INT-AUTH-04 | `confirm_age`: 17 years 364 days → false + age_block; 18 → true; DOB not stored anywhere (`select` from all columns) |
| T-INT-UNLOCK-01 **[R1.1]** | 500th member → campus live, notifications queued for all, emails queued |
| T-INT-LIST-01 | `create_listing`: photo path must match campus/listing; banned word block; review → held_review; limits (20/day, 3 in first 24 h, food 3/day, wanted 5/day) |
| T-INT-LIST-02 | price change ≥5% queues price_drop to savers only; <5% doesn't |
| T-INT-LIST-03 | sold/removed auto-declines pending offers and closes other chats |
| T-INT-FEED-01 | `get_feed` excludes own, swiped (30 d), hidden, blocked-both-ways, other campus; exhaustion counter increments |
| T-INT-SRCH-01 | FTS finds stemmed words; trigram finds typos; suggestions include saved searches |
| T-INT-OFF-01 | full offer state machine: allowed transitions only; round ≤ 4; expiry cron |
| T-INT-OFF-RACE | two concurrent `accept_offer` on different offers of one listing → exactly one succeeds (`FOR UPDATE`) |
| T-INT-OFF-02 | offers rate limit 10/h; new-account 5/day; paused after 2 confirmed no-shows |
| T-INT-CHAT-01 | send_message idempotent on client_id; blocked → error; closed chat → error; chat photos flag off → error |
| T-INT-RT-01 | Realtime: C can't receive `chat:{A-B}` (connect with C's JWT, expect no messages); A and B receive |
| T-INT-MEET-01 | time windows for propose/checkin/no-show; share token expiry; `get_meetup_share` returns no price/phone/email |
| T-INT-DEAL-01 | ratings reveal only when both sides have rated, or after 7 d; deleted rater anonymized |
| T-INT-QUAD-ANON **[R1.1]** | for every quad RPC, the JSON response has no `author_id` / `user_id` field, including for own posts |
| T-INT-QUAD-01 **[R1.1]** | PII blocked (phone, email, room, URL, @handle); names-student → held; score ≤ −5 → hidden + report; hot_rank ordering |
| T-INT-QUAD-02 **[R1.1]** | `hide_quad_author` hides all of that author's posts and replies for the user only |
| T-INT-SAFE-01 | 3 reports in 24 h auto-hide; priority-1 reasons queue an owner email; duplicate report error |
| T-INT-SAFE-02 | appeal one per subject; decision restores content and clears the strike |
| T-INT-ADMIN-01 | moderator: suspend ≤7 d ok, ban denied, reveal denied, set_config denied; owner aal1 denied everything |
| T-INT-ADMIN-02 | every admin RPC writes exactly one audit_log row with actor, action and reason |
| T-INT-ADMIN-03 | `reveal_quad_author` requires case_ref; 6th in a day → RATE_LIMITED; receipt email queued |
| T-INT-ADMIN-04 | `read_reported_chat` works only with a report on that chat |
| T-INT-ANN-01 | announcement limit 1 per 7 days per campus; news type gated by the `tips` pref at send |
| T-INT-PUSH-01 | notification rows for each catalog event (script) have the correct type/group/time_sensitive |
| T-INT-DEL-01 | after `delete-account`: no rows referencing the uid except reports (reporter null) and anonymized ratings; auth user gone; R2 prefix empty (staging) |
| T-INT-EXPORT-01 **[R1.1]** | export JSON contains every data category in the privacy policy |
| T-INT-CRON-01 | each cron job's function tested with `private.now()` time travel |

## 3. End-to-end scenarios (Maestro, both platforms)

Each is a YAML flow in `.maestro/`, run against staging with seeded data. Steps are listed as actions → expected result.

1. **E2E-01 Sign up (happy path)**
   - Launch → Welcome → Continue → type `e2e+{n}@osu.edu`.
   - School row shows "The Ohio State University" → Send code.
   - Read the code from the staging test inbox. Test-only: a Mailpit instance locally, or on staging an allowlisted catch-all domain `e2e.onlyswap.test` in `campus_domains` for the OSU test campus, with the code fetched through the `test-inbox` function that exists only on staging.
   - Enter the code → age signal unknown → Birthday 2000-01-01 → Profile: name "Test", year Junior → Rules check → Agree → Notifications "Not now" → Discover visible.
2. **E2E-02 Underage**: sign up → Birthday under 18 → Not eligible → Close → sign up again with the same email → blocked message.
3. **E2E-03 Unknown school**: type `x@unknown.edu` → School not found card → Join the waitlist → toast.
4. **E2E-04 Reviewer login**: `appreview@review.onlyswap.test` → password field → Sign in → Discover shows Demo University listings.
5. **E2E-05 Swipe and offer**
   - Swipe left twice → Undo → the card returns.
   - Swipe right → offer sheet → choose −10% → Send → "Offer sent".
   - Inbox → Offers you made shows pending.
6. **E2E-06 Seller accepts, chat opens**
   - (Device B, or the reviewer bot on demo) incoming offer → Accept → chat opens with the system row.
   - Send "hi" → appears on A within 3 s (realtime).
7. **E2E-07 Counter flow**: seller counters → buyer sees Counter received → Accept counter → chat.
8. **E2E-08 Plan and complete a meetup**
   - Calendar → spot list (police-designated first) → pick a spot → Directions opens Maps (then back) → time +1 h → Suggest.
   - Other side Accept → I'm here (both) → +2 h push "Did it sell?" (triggered through the staging time-travel RPC) → Yes → Mark sold with buyer → Rate thumbs up → reveal after the other rates.
9. **E2E-09 No-show**: meetup started 25 min ago with the other side not here → Report a no-show → confirmation.
10. **E2E-10 Sell a listing**: Sell → 3 photos from the fixture album → details → error state (price 4500) → fix → spot → Post → Posted → Share sheet opens → listing appears in Discover for another user.
11. **E2E-11 Search and saved search**: Search "mini frig" → suggestion "mini fridge" → Results → Save search → Saved › Searches shows it with alerts on → a new matching listing creates a notification.
12. **E2E-12 Quad [R1.1]**: first visit → agree → New post "best study spot?" → appears in New → vote from another user → reply shows "Anon 1" → Post with a phone number → blocked sheet → Post naming "rate jake r" → held sheet.
13. **E2E-13 Report and block**: in chat → More → Report "harassment" with Also block on → Report sent → composer replaced by the blocked state → the other user can't message.
14. **E2E-14 Notification settings**: Settings › Notifications → Selling tips is off by default → turn on → toggle message previews.
15. **E2E-15 Delete account**: Settings → Delete account → type DELETE → Welcome → signing in again creates a fresh profile (no old listings).
16. **E2E-16 Data export [R1.1]** (R1.0: the row opens an email to support): Download your data → "We'll email a link" → the staging inbox has the link → the JSON downloads.
17. **E2E-17 Offline**: airplane mode → banner shows → swipes still work → Send offer disabled → back online → swipes flushed (verify through the admin view).
18. **E2E-18 Deep links**: `xcrun simctl openurl` / `adb shell am start` with `{SITE}/l/{id}` → listing opens; another campus id → X30; signed out → X31 then the listing after login.
19. **E2E-19 Suspension**: admin suspends the user (Playwright step) → app shows the paused gate → Appeal submitted → admin overturns → app active.
20. **E2E-20 Maintenance and update gates**: set `maintenance=true` → X12; set `min_version` higher → X11.

**Web and admin (Playwright):**

- **E2E-W01** Landing loads and passes axe.
- **E2E-W02** `/l/{id}` has correct OG meta and a blurred wall.
- **E2E-W03** `/m/{token}` shows status, and an expired one shows the expired message.
- **E2E-W04** `/delete` deletes a test user.
- **E2E-W05** `/help` form sends (Turnstile test keys).
- **E2E-W06** Legal pages return 200.
- **E2E-W07** The AASA and assetlinks JSON are valid.
- **E2E-A01** Admin login requires TOTP.
- **E2E-A02** A moderator resolves a report; the ban button is disabled.
- **E2E-A03** Owner reveal requires a case ref and shows up in the audit log.
- **E2E-A04** A campus safe-spot edit shows up in the app.
- **E2E-A05** The announcement limit is enforced.
- **E2E-A06 [R1.1]** Setting the `quad_enabled` flag hides the tab (verify via the API).

## 4. Manual QA checklist (per screen group, both OSes)

**Device matrix** (free: your own phones plus simulators/emulators):
- iPhone SE (3rd gen) simulator for the small phone
- iPhone 17 Pro Max simulator for the large one
- your physical iPhone
- a Pixel 5 emulator (API 36) for small Android
- a Pixel 9 Pro XL emulator
- your physical Android phone if you have one; otherwise borrow a tester's during the closed test

**Run every screen group against:**
- [ ] Light skin and Night skin, plus one bright accent (Butter) and Cobalt
- [ ] Font scale at the smallest and at 200% (iOS AX5 / Android 2.0): nothing truncated or overlapping
- [ ] VoiceOver / TalkBack: every control is labelled, focus order is logical, sheets trap focus
- [ ] Reduce motion on: no springs, the deck is in list mode
- [ ] Slow network (Network Link Conditioner "3G" / emulator throttle): skeletons show, no double submits
- [ ] Offline: banner shows, cached content, writes are blocked with copy
- [ ] Permissions denied (camera, photos, notifications): primer → Settings variant; the app still works
- [ ] Rotation locked to portrait on phones
- [ ] Keyboard: never covers the input or primary button; "Done" / "Next" order correct
- [ ] Android back gesture/button: closes sheets first, then navigates back; never exits from a mid-flow step without confirm
- [ ] Interrupted flows: backgrounding during upload, incoming call during OTP, killing the app mid-draft

**Screen group checks:**
- **A:** code autofill on iOS from Mail; resend timer; wrong/expired code; native date picker accessible; Updated-rules gate; (R1.1: waitlist count updates).
- **B:** the swipe feels smooth, there are no stuck cards after a fast swipe, and undo works; the listing carousel works; owner and hold states; report sheet.
- **C [R1.1]:** free food countdown hits zero and removes the post; the Wanted prefill goes to sell.
- **D:** 8 photos reordered; HEIC from the iPhone camera; draft restored after a kill; all D3 errors; share card looks right.
- **E:** offers in all states; chat realtime between two devices; scam hint; spot list + Directions to Maps; no-show timing; ratings reveal.
- **F:** every settings row navigates; theme and icon switching; delete and export.
- **Q:** votes, polls, aliases consistent within a thread; blocked and held sheets; hide person; muted keywords.
- **X:** each state screen reachable through the `/dev/states` gallery route (dev builds only).
- **Push:** each notification type (fire-all script) shows the right title and body, preview hidden by default, tap opens the right screen, grouped per Android channel, quiet hours respected.

## 5. Security tests

| ID | Attack | Method | Expected |
|---|---|---|---|
| T-SEC-01 | Direct table writes bypassing RPCs | `curl` PostgREST `PATCH /listings?id=eq.X` with A's JWT on B's listing, and on own `status` | 0 rows / 401 / 403 |
| T-SEC-02 | JWT claim tampering | edit the payload `campus_id` → signature invalid | 401 |
| T-SEC-03 | Admin without MFA | call `admin.*` with an aal1 owner token | `NOT_ADMIN` |
| T-SEC-04 **[R1.1]** | Quad de-anonymization | call every quad RPC plus PostgREST on `quad_posts`/`quad_replies`/`quad_hides`; check responses for author ids; timing and alias correlation across threads (aliases per thread only) | no author data; aliases differ per thread |
| T-SEC-05 | SQL injection | search `q` with `'); drop table listings;--`, tsquery syntax abuse, filters JSON with extra keys | parameterized; `websearch_to_tsquery` safe; unknown keys rejected |
| T-SEC-06 | Auth bypass on the review path | password sign-up to a random `@osu.edu` through the API | email confirmation still required; the hook doesn't allow review domain signups outside the allowlist |
| T-SEC-07 | OTP brute force | 20 wrong codes quickly | Supabase lockout + IP limit (30 per 5 min) |
| T-SEC-08 | Upload abuse | presign for another user's listing; 50 MB file; SVG with a script; `image/webp` header with an HTML body; path traversal key `../` | 403; 400; type rejected; the Worker serves `Content-Type` from key extension only + `X-Content-Type-Options: nosniff`; key built server-side |
| T-SEC-09 **[R1.1]** | Chat photo leakage | fetch a chat photo URL without a sig or with an expired sig | 403 |
| T-SEC-10 | Spam and rate limits | script 11 offers/h, 21 listings/day, 11 quad posts/h, 61 msgs/min, 21 reports/day | 11th etc. → RATE_LIMITED |
| T-SEC-11 | Enumeration | `lookup_school` 100/min from one IP; `get_meetup_share` random tokens; `get_invite` random codes | IP-limited; 22-char tokens make guessing infeasible |
| T-SEC-12 | Secrets in the bundle | `npx expo export` then grep the bundle for `service_role`, `R2_SECRET`, `SMTP_PASS` | none present |
| T-SEC-13 | Deleted user remnants | T-INT-DEL-01 + R2 list + PostHog person deletion via API | nothing left except the documented retention |
| T-SEC-14 | Webhook and function auth | call `send-push`, `send-email`, `delete-account` (internal mode), `revoke-sessions` and `admin-change-email` without the service key | 401 |
| T-SEC-15 | XSS on web pages | listing title `<script>` rendered on `/l/[id]` and the web app | escaped |
| T-SEC-16 | Realtime channel snooping | subscribe to `chat:{random}` and `user:{B}` as A | no messages |
| T-SEC-17 | Rate-limit bypass using multiple accounts | several accounts need several verified .edu emails; the new-account caps make abuse costly | documented residual risk |

## 6. Performance checks

| ID | Metric | Target | How |
|---|---|---|---|
| Perf-01 | Cold start to first interactive frame | < 2.0 s on a mid Android (Pixel 5 emulator at release build), < 1.2 s on the iPhone | Sentry app start measurement + stopwatch on a release build |
| Perf-02 | Swipe deck frame rate | ≥ 58 fps sustained over 50 swipes | Android GPU profiler / Perf Monitor; Reanimated worklets only |
| Perf-03 | List scroll (Inbox, Results, Quad) | no blank cells at fling speed | FlashList `estimatedItemSize` tuned |
| Perf-04 | Image load | next card image already cached (prefetch 3); thumbnails under 150 ms on 4G | expo-image cache logs |
| Perf-05 | Upload | 3 photos processed + uploaded < 8 s on 4G | stopwatch |
| Perf-06 | RPC latency | `get_feed` p95 < 300 ms, `search_listings` p95 < 400 ms at 10k listings seed | `explain analyze` + pgbench-like script `scripts/load/feed.ts` |
| Perf-07 | JS bundle | < 6 MB Hermes bytecode | `npx expo export --dump-sourcemap` + source-map-explorer |
| Perf-08 | Free-tier budget: DB size | < 250 MB at 10k-user seed simulation | `select pg_database_size()` |
| Perf-09 | Free-tier budget: Realtime | peak concurrent < 150 in the beta week | Supabase realtime report |
| Perf-10 | Free-tier budget: Worker requests | < 60k/day | Cloudflare analytics |
| Perf-11 | Free-tier budget: Edge Function invocations | < 250k/month | Supabase usage |
| Perf-12 | Free-tier budget: PostHog events | < 500k/month | PostHog billing page |
| Perf-13 | Free-tier budget: EAS builds | ≤ 10/month of 30 | expo.dev usage |
| Perf-14 | Free-tier budget: email | < 300/day | `email_outbox` counts |

## 7. Store-readiness checks (common rejection causes)

**Apple:**
- [ ] The demo login works from a fresh install on a device outside your network (use cellular) and doesn't expire.
- [ ] No placeholder text, "lorem", test data or "beta" wording anywhere.
- [ ] Every link works: privacy, terms, support, delete, child safety.
- [ ] Account deletion is reachable in 3 taps from the profile.
- [ ] UGC: report on every post, listing, message and profile; block works; rules shown before posting; contact info is in the app.
- [ ] No anonymous chat anywhere; Quad disclosure shown.
- [ ] Push is not required (the app works with notifications denied); promotional push is opt-in.
- [ ] Permission strings are specific (camera, photos, notifications only); no location permission in R1.0.
- [ ] Age rating 18+ override; age check works; underage is blocked.
- [ ] Privacy label matches the SDKs (Sentry, PostHog, Expo Notifications).
- [ ] The privacy manifest is present and the required-reason APIs are declared.
- [ ] `ITSAppUsesNonExemptEncryption=NO`.
- [ ] Screenshots: fictional school, no Android mentions, 6.9" size, accurate claims.
- [ ] No hidden or dormant features (widgets are not in the binary).
- [ ] App name, subtitle and keywords have no trademarks or competitor names.
- [ ] No IAP needed (physical goods); nothing suggests a digital purchase.
- [ ] iPad: `supportsTablet=false`, so no iPad screenshots are needed.
- [ ] Minimum functionality: the reviewer sees content (Demo University) and can complete a swap end to end.

**Google Play:**
- [ ] Target API 36; `compileSdk` 36.
- [ ] The merged manifest has none of the blocked permissions (`aapt dump permissions` on the AAB via `bundletool`).
- [ ] Data safety matches plan §19 exactly; "data deleted on request" = yes, with the URL.
- [ ] Target audience 18+ only; Restrict minor access on; not "appeals to children".
- [ ] Content rating questionnaire done.
- [ ] Declarations: Ads no; App access credentials; Financial none; Health none; Government no; News no; Advertising ID not used.
- [ ] Child safety standards URL + contact filled in.
- [ ] Store listing: title ≤ 30 characters, no keyword stuffing, screenshots ≥ 1080 px, feature graphic 1024×500 with no alpha.
- [ ] UGC: terms accepted before posting (onboarding checkbox), reporting and blocking in the app.
- [ ] Photo Picker used; no READ_MEDIA declaration needed.
- [ ] Closed testing: 12+ testers for 14 consecutive days before applying for production.
- [ ] Pre-launch report (free, in the Play Console) shows no crashes or accessibility errors.


## 8. Tests added in the pre-build review

| ID | Type | Covers | Cases |
|---|---|---|---|
| T-INT-DEL-02 | pgTAP | BE-01 | seller deletes the listing mid-chat → chat survives with snapshot, read-only, system message; seller deletes their account → buyer's chat shows "Deleted user", snapshot intact |
| T-INT-DEL-03 | integration | BE-02 | open report on a message/photo → reported user deletes the account → evidence JSON still present; photo moved to `onlyswap-private/evidence/`, not deleted |
| T-FN-07 | Deno | BE-03 | two concurrent `send-push` invocations over the same 300 due rows → each notification sent exactly once; stuck `sending` reset after 10 min |
| T-INT-NOTIF-DEDUPE | pgTAP | BE-04 | trigger fired twice for the same offer round → one notification |
| T-INT-LIST-04 | pgTAP | BE-05 | `create_listing` called twice with the same reserved id → one row, the same row returned; an unreserved id → `FORBIDDEN` |
| T-INT-MEET-02 | pgTAP | BE-06 | second `propose_meetup` cancels the first; the partial unique index holds under concurrency |
| T-INT-MEET-03 | pgTAP | BE-07 | no-show rejected when the reporter didn't check in, when the other checked in, and before +20 min; auto-confirm after 24 h; 2 confirmed → offers paused |
| T-INT-SAFE-03 | pgTAP | BE-09 | 3 reports from accounts younger than 7 days → no auto-hide; 3 from aged distinct accounts → held + still open |
| T-INT-OFF-RACE-02 | pgTAP (2 sessions) | BE-10 | `make_offer` concurrent with `mark_sold` → offer rejected `LISTING_UNAVAILABLE` or auto-declined, never pending on a sold listing |
| T-INT-SOLD-01 | pgTAP | BE-11 | `mark_sold` closes other chats with a system message and notifies those buyers |
| T-INT-TZ-01 | pgTAP | BE-12 | DST boundary: meetup reminders fire 30 min before local time on the transition days; quiet hours in the campus TZ |
| T-UNIT-AUTH-06 | Jest | PM-04 | gate routes to Updated rules when `rules_version` changes |
| T-INT-AUTH-05 | integration | PM-03 | "Sign out of all devices" invalidates refresh tokens on a second session |
| T-INT-AUTH-06 | integration | ARC-01, SEC-03 | suspended user: write RPCs fail immediately (`NOT_ACTIVE`) even with an unexpired JWT; refresh fails after `revoke-sessions` |
| T-INT-AUTH-07 | integration | PM-03 | `admin_change_email` → user confirms the new address with a code → campus re-resolved |
| T-CONTRACT-01 | CI | ARC-02 | RPC signatures and return shapes compared to `rpc-contract.json`; removed or changed signatures fail unless a `_v2` exists |
| T-SEC-18 | integration | SEC-02 | presigned PUT with a larger body than the signed content-length → 403 from R2 |
| T-SEC-19 | pgTAP | SEC-09 | every table in `public` has RLS enabled; `anon` has no table privileges; `pg_graphql` absent |
| T-UNIT-CHAT-04 | Jest | SEC-06 | scam hint shown for URLs, phone numbers, "venmo first", "zelle", "gift card", "cash app"; not shown for plain messages; never for own messages |
| T-UNIT-MEDIA-06 | Jest | MOB-06 | share-card capture failure → share proceeds without an image |
| T-REL-01 | manual | MOB-09 | OTA update published for the same fingerprint applies on next cold start; a native-change update is not offered to old binaries |
| T-QA-KB | manual + Maestro step | MOB-01 | chat composer, offer sheet, sell form, OTP: keyboard never covers the input or primary button (iOS + Android gesture/3-button nav) |
| T-QA-EDGE | manual | MOB-03 | edge-to-edge: no content under the status or gesture bar; Android back closes sheets first |
| E2E-21 | Maestro | BE-01 | A and B in chat → A deletes the listing → B sees the read-only chat + snapshot; A deletes the account → B sees "Deleted user" |
| E2E-22 | Maestro | PM-04 | owner bumps `rules_version` via admin → the app shows Updated rules → accept → continues |
| E2E-23 | Maestro | PM-03 | Settings → Sign out of all devices → the second device is signed out on next request |
| E2E-W08 | Playwright | WEB-02/03 | `_headers` present (CSP, XFO, nosniff); `robots.txt` disallows `/m/ /l/ /i/ /delete`; sitemap lists the public pages; admin sends `X-Robots-Tag: noindex` |
| T-A11Y-LINT | CI | UX | `eslint-plugin-react-native-a11y` has no errors |
| T-DATA-01 | integration | DATA-02/03 | PostHog capture payloads never contain email, name, message text, price or listing title; opt-out stops capture |
| T-DATA-02 | pgTAP | DATA-01 | `admin_metrics_*` views match the metric definitions in PRD §5 on fixture data |

## 9. Removed or retagged in the review

- **E2E-08** no longer includes a location primer (DEC-2).
- **Location permission tests** are removed from R1.0 manual QA (the permission doesn't exist).
- **Chat photo tests** (T-UNIT-CHAT-03, T-SEC-09) and **Quad tests** are tagged R1.1.
- **Web app E2E** (browse/inbox/sell) moves to R2. E2E-W01..W07 stay (site pages).
- **Alternate icon QA** is removed (R2).
