# CLAUDE.md — Read this first, every session

## Project

OnlySwap is a campus-only marketplace for verified 18+ students:
1. swipe
2. offer
3. chat after the seller accepts
4. meet at a public campus spot and pay in person

It's built by a solo founder with Claude Code. **Spec status: LOCKED** (2026-09-25 pre-build review). Don't change scope, stack or contracts without a new row in `docs/DECISIONS_LOG.md` approved by the owner.

## Source of truth (read before coding)

When docs conflict, the order is: this file → the docs below → `design/OS_FInal Design.html`. **The docs override the board** (see DESIGN_SYSTEM §9 deltas).

| Doc | Use it for |
|---|---|
| `docs/PRD.md` | features (F01–F41), release scope (R1.0 / R1.1 / R2), flows, metrics, traceability |
| `docs/DESIGN_SYSTEM.md` | tokens, components, motion, banned patterns, screen-by-screen spec |
| `docs/ARCHITECTURE.md` | system diagram, data flow, boundaries, ADRs, free-tier budget, environments |
| `docs/DATA_MODEL.md` | schema, RLS matrix, state machines, retention, storage, migrations |
| `docs/API.md` | every RPC, Edge Function, cron job, notification type, error code |
| `docs/SECURITY.md` | threat model, abuse cases, secrets |
| `docs/TESTING.md` | test IDs and what each must cover |
| `docs/RELEASE.md` | environments, CI/CD, signing, store submission, ops |
| `docs/TASKS.md` | the checklist + **build order (sessions S1–S44)** |
| `docs/DECISIONS_LOG.md` | why things are the way they are |
| `docs/REVIEW.md` | the pre-build review (findings, open questions) |

`docs/archive/` is history only. Never build from it.

## Stack (pin with `npx expo install`, don't bump majors)

| Area | Choice |
|---|---|
| App | Expo SDK 57 (React Native 0.86, React 19.2), TypeScript strict, Expo Router, New Architecture |
| UI and state | Reanimated (SDK pin), Gesture Handler (SDK pin), react-native-keyboard-controller, react-native-safe-area-context, Unistyles 3, TanStack Query 5, Zustand 5, MMKV 4, expo-image, FlashList 2 |
| Backend | Supabase (Postgres + RLS + RPC, Auth email OTP + hooks + TOTP, Realtime Broadcast, Edge Functions (Deno), pg_cron, pg_net) |
| Media and web | Cloudflare R2 + Worker `workers/media`; Pages: `apps/site` (Astro), `apps/admin` (Vite + React) |
| Services | Expo Push (APNs + FCM v1); email via `_shared/mailer.ts` (Gmail SMTP Plan A / Resend Plan B); Sentry; PostHog |
| Builds | EAS Build/Submit/Update (free); CI on GitHub Actions (Linux only) |
| Platforms | iOS 16.4+, Android 8.0+ (minSdk 26), target SDK 36; iPhone + Android phones only (no tablets) |

## Repo layout

```
apps/mobile      Expo app (app/ routes; src/components, src/features/<f>/{api.ts,components,logic.ts}, src/lib, src/strings/en.ts)
apps/admin       Vite + React admin (Cloudflare Pages)
apps/site        Astro public site + Pages Functions (/l, /m)
workers/media    R2 image Worker
supabase/        migrations/, migrations_staging/, functions/ (+_shared), tests/ (pgTAP), seed.sql, config.toml
packages/tokens  tokens.json → dist/unistyles.ts + dist/tokens.css
packages/shared  generated db.ts, rpc-contract.json, domain types, zod schemas
scripts/         seed-review.ts, usage-report.ts, rpc-contract.ts, fire-all-notifications.ts, export-store-assets.ts
docs/            specs (above)
design/          design board + sources
```

## Rules you must always follow

1. **Scope:** only do the task IDs you're asked for, in the build order. When a task's "done when" passes, tick it in `docs/TASKS.md`. Don't build R1.1 or R2 items.
2. **$0:** no paid services, plans, add-ons or trials. Only the Apple ($99/yr) and Google ($25 once) fees are allowed. If something would cost money, stop and ask.
3. **Server owns the rules:**
   - Business logic lives in SQL `security definer` RPCs with `set search_path`.
   - RLS is on every table; direct table writes from clients are never granted.
   - Every write RPC calls `private.require_active()`.
   - Admin RPCs are `public.admin_*` with `private.require_admin()`, and each writes one `audit_log` row.
4. **API compatibility:** RPCs are additive-only. Breaking change → `name_v2`. Update `rpc-contract.json`.
5. **Idempotency:**
   - `create_listing` uses the reserved id.
   - `send_message` uses `client_id`.
   - Notifications use `dedupe_key`.
   - Outbox workers claim rows with `for update skip locked`.
6. **Never hard-delete deal data.** Listings are soft-deleted; chats keep snapshots; FKs into deals are `set null`; report evidence is retained.
7. **Secrets:** only `EXPO_PUBLIC_*` in the app. The service key lives only in Edge secrets, Vault and GitHub secrets. No secrets in git.
8. **Copy:**
   - All user-facing text lives in `apps/mobile/src/strings/en.ts` (site: `apps/site/src/content/`).
   - Voice: plain student tone, **no em dashes**, no exclamation stacks, **no emoji**, verbs on buttons.
   - Say "Meetup spot" or "Police-designated" (only when official), never "safe-exchange zone".
9. **Design:**
   - Use tokens only (no raw hex, sizes or spacing) and system fonts.
   - The accent is a fill only, never text on light backgrounds.
   - Follow DESIGN_SYSTEM §8 (banned patterns) and §5 (motion + haptics budget).
   - Every screen implements loading, empty, error, offline and permission-denied states.
10. **Accessibility:**
    - labels and roles on every control
    - 44 pt targets
    - Dynamic Type to 200% (overlays capped 1.4×)
    - reduce motion
    - screen-reader actions for the swipe deck
11. **Compliance (build plan §19, SECURITY):**
    - 18+ age check.
    - No anonymous chat.
    - Promotional push is opt-in (`tips` pref).
    - EXIF is stripped from every photo.
    - No location permission in R1.0.
    - No university names or marks in store assets.
    - Deletion is in the app and on the web.
12. **Privacy in telemetry:**
    - PostHog: only the 18 events in PRD §5.4; no PII or content; `identified_only` with a hashed id; respect the opt-out.
    - Sentry: `sendDefaultPii: false`.
13. **Tests:** every RPC, policy and trigger gets pgTAP; every lib function gets Jest; UI flows follow TESTING E2E IDs. A task isn't done until its tests pass.
14. **Git:**
    - one branch per session: `feat/sNN-short-name`
    - small commits: `type(scope): message`, conventional style
    - never commit to `main` directly once it's protected
    - never force-push

## Naming

| Thing | Convention |
|---|---|
| SQL tables | `snake_case` plural |
| RPCs | `verb_noun` |
| Admin RPCs | `admin_verb_noun` |
| Private helpers | `private.*` |
| Migrations | `NNNN_description.sql` |
| TS files | `camelCase.ts` |
| Components | `PascalCase.tsx` |
| Hooks | `useThing` |
| Zustand stores | `useXStore` |
| Query keys | `['entity', id]` |
| Routes | kebab/segment names per DESIGN_SYSTEM §10 |
| Test IDs in names | `describe('T-UNIT-FEED-01 …')` / pgTAP file `rls_listings.test.sql` |
| Error codes | `UPPER_SNAKE` (API §0) |

## Commands

```bash
pnpm i                                   # install
pnpm --filter mobile start               # Metro (dev client)
npx expo run:ios --device                # local iOS build to your iPhone (Mac + Xcode 26.4+)
npx expo run:android                     # local Android build (USB debugging)
eas build --profile development -p ios   # cloud dev client (counts toward 15/mo)
supabase start && supabase db reset      # local DB with seed (Docker)
supabase test db                         # pgTAP
pnpm test                                # Jest (all packages)
pnpm lint && pnpm typecheck
maestro test apps/mobile/.maestro        # E2E (simulator/emulator)
pnpm --filter admin dev | pnpm --filter site dev
supabase functions serve                 # Edge Functions locally
wrangler dev -c workers/media/wrangler.toml
```

## Session protocol (Claude Code)

1. Read this file + the task rows for the session (`docs/TASKS.md` build order).
2. Read the linked specs (DESIGN_SYSTEM screen rows, API contracts, DATA_MODEL tables).
3. Create the branch → implement → write tests → run `pnpm lint && pnpm typecheck && pnpm test` (+ `supabase test db` if SQL changed).
4. Tick the tasks, and list any spec gap you found under "Open" in `docs/DECISIONS_LOG.md` instead of guessing.
5. Summarize what's runnable and the exact commands the owner should run on devices.

## Environment notes for the owner's Mac

Claude's sandbox can't run Xcode, simulators or Docker. Device builds, `supabase start` and Maestro run on the Mac.
