# GOALS.md — Goal states and quality gates (every step, every session)

Nothing is pushed until the session's **goal state** is met and **every gate** below is green with evidence. "It compiles" is not done. "Done" means the goal state is proven.

## 1. The step loop (every task)

For each task ID in a session, in order:

1. **Goal.** Write the task's goal state at the top of the work log. It is the task's "done when" from TASKS.md, made specific and checkable (`/goal <TASK-ID>`).
2. **Spec check.** Read the linked rows in DESIGN_SYSTEM, API, DATA_MODEL and TESTING. Any gap or conflict gets logged under "Open" in DECISIONS_LOG, and the task stops there. No guessing.
3. **Tests first** where possible: pgTAP for SQL; Jest for logic; the E2E test ID noted for UI.
4. **Implement** the smallest change that meets the goal.
5. **Local gates** (§2), run by Claude in the sandbox. They must all be green.
6. **Self-review** the diff against:
   - the spec rows
   - CLAUDE.md rules (tokens only, strings only in en.ts, no em dashes/emoji, a11y props, RLS/RPC rules)
   - DESIGN_SYSTEM §8 banned patterns
   - no secrets
   - no dead code
   - no TODOs without a task ID
7. **Tick** the task in TASKS.md only when its goal is proven. Commit with `type(scope): TASK-ID message`.
8. If a gate fails, fix it and re-run **all** gates, not just the failing one.

## 2. Gates

| Gate | Who runs it | Command / check | Required for |
|---|---|---|---|
| G1 Format + lint | Claude (sandbox) | `pnpm lint` (eslint + prettier + a11y plugin) → 0 errors, 0 warnings | every session |
| G2 Types | Claude (sandbox) | `pnpm typecheck` → 0 errors (TS strict) | every session |
| G3 Unit tests | Claude (sandbox) | `pnpm test` → all green; new code covered by its T-UNIT IDs | every session with logic |
| G4 Contract | Claude (sandbox) | RPC contract check (from S8) | sessions touching RPCs |
| G5 Security scan | Claude (sandbox) | gitleaks + bundle secret scan + `pnpm audit --audit-level high` (from S2) | every session |
| G6 Expo health | Claude (sandbox) | `npx expo-doctor` + `npx expo config --type prebuild` sanity (from S1) | sessions touching the mobile app |
| G7 DB | **You (Mac)** | `supabase start && supabase db reset && supabase test db` | sessions touching SQL |
| G8 Devices | **You (Simulator)** | install + the listed device checks on the iOS Simulator; Android is covered by CI and Play closed testers (DEC 42) | sessions touching the app UI |
| G9 E2E | **You (Mac)** | Maestro / Playwright flows listed | sessions that finish a user flow |
| G10 CI | GitHub | PR checks green (from S2) | every PR |
| G11 Review | Claude + you | PR description contains the goal, the checklist with evidence, and screenshots for UI | every PR |

**Push rule:** Claude commits locally and hands you the push commands **only after G1–G6 are green**. You merge the PR **only after G7–G11 are green** for that session. If a Mac or device gate fails, paste the output and Claude fixes it on the same branch before merge.

**Honest limits:** Claude's sandbox is Linux without Xcode, simulators, Docker or phones. G7–G9 can only be proven on your Mac and devices. Each session ends with one script (`scripts/verify/sNN.sh`, added from S1) that runs every Mac-side check and prints PASS or FAIL per goal, so you run one command and paste one result.

## 3. Global definition of done (every session)

- [ ] Goal state met and demonstrated (evidence in the PR)
- [ ] All session tasks ticked, each with its "done when" proven
- [ ] G1–G6 green in the sandbox; G7–G10 green where required
- [ ] No spec drift: behavior matches DESIGN_SYSTEM/API/DATA_MODEL; any deviation is logged and approved in DECISIONS_LOG first
- [ ] Every new screen: loading, empty, error, offline and permission-denied states; a11y labels; 200% text; reduce motion
- [ ] Every new RPC/table: RLS, pgTAP, contract updated, error codes from API §0
- [ ] No secrets; `.env.example` updated if new env vars were added
- [ ] Docs updated if needed (and only via a DECISIONS_LOG row when it changes the spec)
- [ ] PR uses the template and includes the `/goal` block for the session

## 4. Session goal states

The **Goal** is the one sentence that must be true at the end. **Checks** are the task-level "done when" items (TASKS.md). **Gates** are what must be green before merge.


### S1 · Scaffold

**Goal:** the pnpm monorepo and an Expo SDK 57 app with the locked config (bundle id, entitlements, blocked permissions, minSdk 26, portrait, 4-tab shell: Discover, Sell, Inbox, Profile) launch on the iOS Simulator, the Android build is green, and `expo-doctor` is clean.

**Checks:**

- [x] `P1-SETUP-01`: `pnpm i` succeeds
- [x] `P1-SETUP-02`: runs on the iOS simulator; Android bundle and prebuild pass in CI
- [x] `P1-SETUP-03`: `npx expo-doctor` passes
- [x] `P1-SETUP-04`: `expo prebuild` output has exactly the expected Info.plist keys, entitlements and merged manifest permissions (T-STORE check)
- [x] `P1-SETUP-05`: `eas build -p ios --profile development` succeeds
- [x] `P1-SETUP-06`: the app launches on the iOS Simulator and the Android EAS build succeeds

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S2 · Env + CI

**Goal:** CI green, local Supabase up.

**Checks:**

- [x] `P1-ENV-01`: a missing env var crashes dev with a clear message
- [x] `P1-ENV-02`: a commit containing a fake key is blocked
- [x] `P1-CI-01`: green on a PR
- [x] `P1-CI-02`: CI fails on a planted high-severity dep and on a planted secret
- [x] `P1-DB-01`: local Studio opens

**Gates:** G1, G2, G3, G5, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)

### S3 · Libs + spikes

**Goal:** email from a function, age signal logged, Nitro modules OK, Sentry test crash.

**Checks:**

- [x] `P1-LIB-01`: unit tests pass (T-UNIT-LIB-*)
- [ ] `P1-LIB-02`: a test crash shows symbolicated in Sentry
- [ ] `P1-SPIKE-01`: a test email arrives from a staging function
- [x] `P1-SPIKE-03`: logged result on devices
- [x] `P1-SPIKE-04`: a demo screen uses all three on iOS + Android

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S4 · Tokens + type

**Goal:** light/dark switching, contrast test green.

**Checks:**

- [x] `P2-TOK-01`: generated files committed; values match DESIGN_SYSTEM tables
- [x] `P2-TOK-02`: all required pairs pass
- [x] `P2-TOK-03`: switching mode is instant with no flash
- [x] `P2-FONT-01`: every type row renders at 100% and 200%
- [x] `P2-MOT-01`: reduce motion swaps to fades

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S5 · Components 1

**Goal:** kit page.

**Checks:**

- [x] `P2-CMP-01`: kitchen-sink row matches H3
- [x] `P2-CMP-02`: states match H3
- [x] `P2-CMP-03`: a11y roles set
- [x] `P2-CMP-04`: works with keyboard open
- [ ] `P2-CMP-05`: offline toggle shows the banner
- [x] `P2-CMP-06`: matches F10 styling

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S6 · Components 2

**Goal:** full kit + states gallery.

**Checks:**

- [ ] `P2-CMP-07`: a 4-photo carousel works
- [ ] `P2-CMP-08`: matches X3/X36
- [ ] `P2-CMP-09`: N1 look on Android
- [ ] `P2-CMP-10`: every OS status handled
- [ ] `P2-CMP-11`: —
- [ ] `P2-KIT-01`: visual pass against H3 in 8 skins
- [ ] `P2-KIT-02`: every X frame is reachable

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S7 · Schema

**Goal:** `db reset` works.

**Checks:**

- [ ] `P3-DB-01`: `db reset` succeeds
- [ ] `P3-DB-02`: `db reset` ok
- [ ] `P3-DB-03`: —
- [ ] `P3-DB-04`: —
- [ ] `P3-DB-06`: —
- [ ] `P3-DB-11`: re-running the migration is a no-op

**Gates:** G1, G2, G3, G5, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)

### S8 · Helpers + tests harness

**Goal:** helper tests green; integrity suite tracked; contract snapshot.

**Checks:**

- [ ] `P3-DB-07`: pgTAP helper tests pass
- [ ] `P3-DB-10`: pgTAP helper tests
- [ ] `P3-TEST-01`: `supabase test db` runs in CI
- [ ] `P3-TEST-02`: pgTAP time-travel tests work
- [ ] `P3-DB-12`: tests exist and are tracked in CI (marked todo until their phase)
- [ ] `P1-CI-03`: changing a signature without `_v2` fails CI

**Gates:** G1, G2, G3, G5, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)

### S9 · RLS + views + safety RPCs

**Goal:** RLS matrix + T-SEC-19 green.

**Checks:**

- [ ] `P3-DB-08`: T-INT-RLS-* and T-SEC-19 pass
- [ ] `P3-DB-09`: —
- [ ] `P3-SAFE-01`: pgTAP
- [ ] `P3-TYPES-01`: CI fails on drift

**Gates:** G1, G2, G3, G5, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)

### S10 · Auth platform

**Goal:** a real .edu inbox gets a code from staging.

**Checks:**

- [ ] `P3-AUTH-01`: signups from unknown domains are rejected; JWT has the claims
- [ ] `P3-AUTH-02`: a new user gets a profile row
- [ ] `P3-AUTH-03`: a real .edu inbox receives the code
- [ ] `P3-SEED-01`: `db reset` gives a usable app

**Gates:** G1, G2, G3, G5, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)

### S11 · Auth client

**Goal:** launch → welcome on devices.

**Checks:**

- [ ] `P4-AUTH-01`: pgTAP green
- [ ] `P4-AUTH-02`: unit tests green
- [ ] `P4-DEL-01`: T-INT-DEL-01 shows no rows left except retained reports
- [ ] `P4-AUTH-03`: cold start under 700 ms to first route on a mid Android device
- [ ] `P4-AUTH-04`: matches A2

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S12 · Sign-in screens

**Goal:** sign in with age check on devices.

**Checks:**

- [ ] `P4-AUTH-05`: all A3/A4/A5 states reachable
- [ ] `P4-AUTH-06`: wrong/expired/locked states tested
- [ ] `P4-AUTH-07`: the minor path deletes the auth user and blocks retry (T-INT-AUTH-04, E2E-02)

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S13 · Media pipeline

**Goal:** photos to R2, EXIF stripped.

**Checks:**

- [ ] `P5-MEDIA-01`: GET of a public key → 200 + immutable header; unknown prefix → 404
- [ ] `P5-MEDIA-02`: presigned PUT works; wrong owner → 403; oversize body → 403 (T-SEC-18)
- [ ] `P5-MEDIA-03`: T-UNIT-MEDIA-01..05 pass; output has no GPS EXIF
- [ ] `P5-MEDIA-04`: T-INT-DEL-03 passes; no other user objects remain

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S14 · Onboarding rest

**Goal:** full onboarding incl. avatar + rules gate.

**Checks:**

- [x] `P4-AUTH-08`: the profile row is updated
- [x] `P4-AUTH-09`: can't continue unchecked
- [x] `P4-AUTH-10`: the OS prompt fires only on the button
- [x] `P4-AUTH-11`: a duplicate email is a silent success; IP limited
- [x] `P4-AUTH-17`: T-UNIT-AUTH-06, E2E-22

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S15 · Account safety + reviewer

**Goal:** re-verify, reviewer login, sign-out-everywhere.

**Checks:**

- [x] `P4-AUTH-14`: forcing `verified_until` into the past shows X9; a new code restores it
- [ ] `P4-AUTH-15`: a reviewer logs in with a password on staging
- [x] `P4-AUTH-18`: T-INT-AUTH-05/06
- [x] `P4-AUTH-19`: T-INT-AUTH-07

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S16 · Sell 1

**Goal:** draft + details with errors.

**Checks:**

- [x] `P5-SELL-01`: pgTAP incl. banned words, limits, T-INT-LIST-04 pass
- [x] `P5-SELL-02`: a draft survives an app kill
- [x] `P5-SELL-03`: all errors show at once

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S17 · Sell 2

**Goal:** post + share card.

**Checks:**

- [x] `P5-SELL-04`: spots saved on the listing
- [x] `P5-SELL-05`: `share_image_path` is set and the OG image loads
- [ ] `P5-SELL-07`: orphan drafts older than 24 h are removed on staging

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S18 · Feed backend + deck

**Goal:** deck at 60 fps on fixtures.

**Checks:**

- [x] `P6-FEED-01`: pgTAP: excludes own, blocked, swiped
- [ ] `P6-FEED-02`: 60 fps on a mid Android device (Perf-02)

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S19 · Discover + listing

**Goal:** swipe → listing → report.

**Checks:**

- [ ] `P6-FEED-03`: all B1–B4 and X24 states
- [ ] `P6-LIST-01`: all B5–B7 and X13 states
- [ ] `P6-LIST-02`: report row created
- [ ] `P6-LIST-03`: pinch and swipe-down close

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S20 · Search

**Goal:** search + filters.

**Checks:**

- [ ] `P6-SRCH-01`: "mini frig" finds "Mini fridge"
- [ ] `P6-SRCH-02`: B14/B15 states
- [ ] `P6-SRCH-03`: —
- [ ] `P6-SRCH-04`: filters applied round trip

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S21 · Saved + profiles

**Goal:** saved items/searches, seller profile.

**Checks:**

- [ ] `P6-SAVE-01`: —
- [ ] `P6-USER-01`: B20–B22

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S22 · Offers backend

**Goal:** offer state machine green.

**Checks:**

- [ ] `P7-OFF-01`: state machine (DATA_MODEL §4.2) pgTAP green incl. T-INT-OFF-RACE and T-INT-OFF-RACE-02
- [ ] `P7-OFF-06`: —

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S23 · Offers UI

**Goal:** offer loop on two devices.

**Checks:**

- [ ] `P7-OFF-02`: —
- [ ] `P7-OFF-03`: a new offer appears without refresh while the screen is focused
- [ ] `P7-OFF-04`: every state reachable via fixtures
- [ ] `P7-OFF-05`: —
- [ ] `P7-OFF-07`: E2E free-item step passes

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S24 · Chat core

**Goal:** realtime between two devices.

**Checks:**

- [ ] `P8-CHAT-01`: T-INT-RT-01: a non-participant can't subscribe
- [ ] `P8-CHAT-02`: T-UNIT-CHAT-*

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S25 · Chat UI

**Goal:** chat with scam hint.

**Checks:**

- [ ] `P8-CHAT-03`: —
- [ ] `P8-CHAT-05`: —
- [ ] `P8-CHAT-06`: T-UNIT-CHAT-04

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S26 · Meetups

**Goal:** plan → meetup day.

**Checks:**

- [ ] `P8-MEET-01`: T-INT-MEET-01/02/03 and T-INT-TZ-01 pass
- [ ] `P8-MEET-04`: —
- [ ] `P8-MEET-02`: works end to end on both OSes (E2E-08)
- [ ] `P8-MEET-03`: every state reachable via fixtures

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S27 · Deals

**Goal:** full swap incl. deletions (E2E-21).

**Checks:**

- [ ] `P8-DEAL-01`: the double-blind reveal is correct at 7 days
- [ ] `P8-DEAL-02`: —
- [ ] `P8-DEAL-03`: shown only when conditions hold
- [ ] `P8-DEAL-04`: T-INT-SOLD-01, T-INT-DEL-02, E2E-21 green

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S28 · Push

**Goal:** pushes on both OSes, no double sends.

**Checks:**

- [ ] `P9-PUSH-01`: `eas credentials` shows both
- [ ] `P9-PUSH-02`: a test push opens the right screen on both OSes
- [ ] `P9-PUSH-03`: T-INT-PUSH-* pass; a bad token gets disabled
- [ ] `P9-FIX-01`: T-FN-07 passes

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[YOU] Console:** the store/console steps in the tasks are done; screenshots of the final state

### S29 · Notifications + email + cron

**Goal:** all 21 types fire; demo bot runs.

**Checks:**

- [ ] `P9-PUSH-04`: each type fires once in `scripts/fire-all-notifications.ts` on staging (T-INT-NOTIF-DEDUPE green)
- [ ] `P9-NOTIF-01`: —
- [ ] `P9-NOTIF-02`: toggling `tips` off stops stale nudges (test)
- [ ] `P9-MAIL-01`: snapshot tests of rendered templates
- [ ] `P9-MAIL-02`: 500 queued emails drain over 2 days on staging (simulated clock)
- [ ] `P9-CRON-01`: `select * from cron.job` lists all of them; each tested with pgTAP time travel (`set local` now override via `private.now()` wrapper)
- [ ] `P4-AUTH-16`: a reviewer completes a swap alone on staging

**Gates:** G1, G2, G3, G5, G6, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"

### S30 · Safety screens

**Goal:** report/block/appeal/delete.

**Checks:**

- [ ] `P11-SAFE-02`: —
- [ ] `P11-SAFE-03`: —
- [ ] `P11-SAFE-04`: —
- [ ] `P11-SAFE-05`: —
- [ ] `P11-ACC-01`: end-to-end delete works

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S31 · Profile + settings

**Goal:** all F screens.

**Checks:**

- [ ] `P11-SET-01`: —
- [ ] `P11-SET-02`: —

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S32 · Site foundation + deep links

**Goal:** gates + universal links.

**Checks:**

- [ ] `P13-WEB-01`: AASA validator passes; Android App Links verified
- [ ] `P11-STATE-01`: toggling `app_config` values shows X11/X12
- [ ] `P11-STATE-02`: tapping `https://…/l/{id}` in Notes opens the app on both OSes

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S33 · A11y + beta start

**Goal:** **Play closed test starts (14-day clock)**.

**Checks:**

- [ ] `P11-A11Y-01`: T-QA-A11Y checklist passes
- [ ] `P11-BETA-01`: 12+ testers opted in on the Play Console

**Gates:** G1, G2, G3, G5, G6, G10, G11

- **[DEV] Devices:** run on the iOS Simulator per the session commands (iPhone-only checks go to TestFlight testers, Android checks to Play closed testers; DEC 41, 42); confirm each check in "Device checks" with a screenshot or "OK"
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator
- **[YOU] Console:** the store/console steps in the tasks are done; screenshots of the final state

### S34 · Admin 1

**Goal:** admin login with MFA; RPCs.

**Checks:**

- [ ] `P12-ADM-01`: a preview URL loads
- [ ] `P12-ADM-02`: a non-admin is blocked; AAL1 is prompted for MFA
- [ ] `P12-ADM-03`: T-INT-ADMIN-01/02 pass

**Gates:** G1, G2, G3, G5, G4, G10, G11

- **[MAC] DB:** `supabase start && supabase db reset && supabase test db` all green (paste the summary line)
- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green

### S35 · Admin 2

**Goal:** reports, users.

**Checks:**

- [ ] `P12-ADM-04`: —
- [ ] `P12-ADM-05`: —
- [ ] `P12-ADM-06`: —

**Gates:** G1, G2, G3, G5, G10, G11

- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green

### S36 · Admin 3

**Goal:** listings, chats, campus, config, audit.

**Checks:**

- [ ] `P12-ADM-07`: every action logged
- [ ] `P12-ADM-08`: flipping `rules_version` triggers the app gate (E2E-22)

**Gates:** G1, G2, G3, G5, G10, G11

- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green

### S37 · Site pages

**Goal:** landing, legal, help, delete, 404, headers.

**Checks:**

- [ ] `P13-WEB-02`: Lighthouse ≥ 90 performance and accessibility
- [ ] `P13-WEB-03`: all URLs live
- [ ] `P13-WEB-04`: the form emails you
- [ ] `P13-WEB-05`: deletes a test account
- [ ] `P13-WEB-08`: unknown paths show the 404
- [ ] `P13-WEB-09`: E2E-W08 passes; Lighthouse ≥ 90

**Gates:** G1, G2, G3, G5, G10, G11

- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green

### S38 · Share pages

**Goal:** `/l` and `/m` live.

**Checks:**

- [ ] `P13-WEB-06`: the iMessage preview shows the card and an expired meetup token shows expiry

**Gates:** G1, G2, G3, G5, G10, G11

- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green

### S39 · Monitoring + ops

**Goal:** alerts, backups, usage report.

**Checks:**

- [ ] `P14-MON-01`: a test error alerts email
- [ ] `P14-MON-02`: T-DATA-01 passes
- [ ] `P14-MON-03`: alert email on downtime
- [ ] `P14-BAK-01`: file present each morning
- [ ] `P14-BAK-02`: restored row counts match
- [ ] `P14-KEEP-01`: staging never pauses
- [ ] `P14-OPS-01`: keystore in the password manager
- [ ] `P14-OPS-03`: first report received

**Gates:** G1, G2, G3, G5, G10, G11

- **[YOU] Console:** the store/console steps in the tasks are done; screenshots of the final state

### S40 · E2E

**Goal:** all E2E green.

**Checks:**

- [ ] `P14-E2E-00`: Maestro reads the codes
- [ ] `P14-E2E-01`: all green
- [ ] `P14-E2E-02`: green

**Gates:** G1, G2, G3, G5, G10, G11

- **[MAC] Web:** `pnpm --filter admin build && pnpm --filter site build` succeed; preview URL loads; Playwright suite for the session green
- **[MAC] E2E:** the Maestro flows listed for this session pass on iOS simulator and Android emulator

### S41 · Hardening + legal

**Goal:** security, perf, legal done.

**Checks:**

- [ ] `P14-SEC-01`: all T-SEC pass
- [ ] `P14-PERF-01`: targets met
- [ ] `P14-LEGAL-01`: pages live; bundled copy matches

**Gates:** G1, G2, G3, G5, G10, G11


### S42 · Beta

**Goal:** TestFlight external, spots verified.

**Checks:**

- [ ] `P15-BETA-01`: external testers can install
- [ ] `P15-BETA-02`: 14 consecutive days with 12+ testers
- [ ] `P15-BETA-03`: 30+ live listings before public launch
- [ ] `P15-BETA-04`: crash-free sessions > 99% in Sentry for 7 days
- [ ] `P15-BETA-05`: spots verified in admin

**Gates:** G1, G2, G3, G5, G10, G11

- **[YOU] Console:** the store/console steps in the tasks are done; screenshots of the final state

### S43 · Store

**Goal:** live.

**Checks:**

- [ ] `P16-STORE-01`: files meet the spec (testing.md §7)
- [ ] `P16-STORE-02`: all sections green
- [ ] `P16-STORE-03`: Policy status shows no issues
- [ ] `P16-STORE-04`: builds processed
- [ ] `P16-STORE-05`: approved
- [ ] `P16-STORE-06`: approved
- [ ] `P16-STORE-07`: 100% live

**Gates:** G1, G2, G3, G5, G10, G11

- **[YOU] Console:** the store/console steps in the tasks are done; screenshots of the final state

### S44 · Post-launch ops

**Goal:** routines set.

**Checks:**

- [ ] `P17-OPS-01`: —
- [ ] `P17-OPS-02`: —
- [ ] `P17-FEAT-04`: —

**Gates:** G1, G2, G3, G5, G10, G11

- **[YOU] Console:** the store/console steps in the tasks are done; screenshots of the final state

### P0 · Accounts (you, in parallel)

**Goal:** every account exists and is verified. Q2 (domain) and Q4 (name) are decided before S33.

**Checks:** P0-ACC-01 … P0-ACC-17 in TASKS.md.

**Evidence:** the tick in TASKS.md plus a line in DECISIONS_LOG for Q2 and Q4.
