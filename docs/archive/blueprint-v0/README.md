# OnlySwap Build Blueprint

Source of truth: `OnlySwap-Build-Plan.md` (stack, services, limits, compliance §19) + `OS_FInal Design.html` (212 frames). This blueprint does not re-pick the stack. It turns both into buildable units.

| File | What's in it |
|---|---|
| `README.md` | Index, conventions, gaps/contradictions found in the plan and how they're fixed |
| `screens.md` | Every mobile screen and web page (routes, components, states, actions, data, motion, a11y) |
| `backend.md` | Schema, enums, indexes, RLS per role, RPCs, Edge Functions, cron, storage, realtime, push/email triggers, seed, migrations |
| `functions.md` | Function-level spec for every client lib/hook/component-logic and every server function |
| `tasks.md` | Master checklist `- [ ]` with IDs, dependencies, acceptance, size |
| `testing.md` | Unit, integration (RLS matrix), E2E scenarios, manual QA, security, performance, store readiness |
| `launch.md` | Launch + production checklist, build order, totals, timeline, risks, self-audit map |

Frame references use the design board codes, for example `B1 Swipe`, `E9 Chat`. Section letters: A Sign up, B Buy, C Campus, Q Quad, D Sell, E Offers/Chat/Meetups, F Profile/Settings, X States, N Devices, W Web, T Store, G Admin, H Handoff.

---

## Conventions

- **Repo layout** is plan §15. Mobile routes live in `apps/mobile/app/**` (Expo Router). Features live in `apps/mobile/src/features/<feature>/` with `api.ts` (TanStack Query hooks), `components/`, `logic.ts` (pure, unit-tested).
- **Server logic lives in Postgres** (`supabase/migrations/*.sql`) as `security definer` RPCs named `verb_noun` (`make_offer`).
  - Edge Functions live in `supabase/functions/<name>/index.ts` and share code from `supabase/functions/_shared/`.
  - Cloudflare Workers live in `workers/<name>/src/index.ts`.
- **Errors.** Every RPC raises `P0001` with a machine code in `MESSAGE` (e.g. `RATE_LIMITED:offers:2026-09-25T10:41:00Z`). The client maps codes to copy in `src/lib/errors.ts`, so there's one place for all user-facing error text.
- **IDs and time.** IDs are `uuid` (`gen_random_uuid()`), except high-volume append tables (`messages`, `notifications`, `audit_log`), which use `bigint identity`. All times are `timestamptz`. Money is `integer` cents.
- **Feature flags** live in `app_config`: `quad_enabled`, `chat_photos_enabled`, `widgets_enabled` (post-launch only, and never shipped dormant, per Apple 2.2), `min_version_ios`, `min_version_android`, `maintenance`.
- **Env names:**
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MEDIA_URL`, `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SENTRY_DSN`
  - Server secrets: `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EXPO_ACCESS_TOKEN`, `QUAD_ALIAS_SECRET`, `EMAIL_HASH_PEPPER`, `TURNSTILE_SECRET`

---

## Gaps and contradictions found in the research plan (fixed here)

| # | Issue in plan | Fix adopted in this blueprint |
|---|---|---|
| G1 | Top decisions still called the age check optional, but §19 made it mandatory (Google Jul 2026 anonymous-feature rule; TX/UT/LA laws). | **Age check is required.** OS age signal (`expo-age-range`) first, neutral Birthday screen as fallback (A7), block under 18 (A8). |
| G2 | The "Not eligible" design says "We haven't kept your email", but we must stop the same email retrying with a different birthday. | Store only `sha256(lower(email) + EMAIL_HASH_PEPPER)` in `age_blocks` for 365 days; no email or DOB kept. Copy stays true. |
| G3 | The reviewer password path needs the Email+Password provider, which would let anyone sign up with a password. | Keep "Confirm email" ON. `hook_before_user_created` rejects any domain not in `campus_domains` **and** any address on the review domain not in `review_accounts`. Reviewer users are created only by `scripts/seed-review.ts` (service role). The client shows the password field only for `review_accounts` domains. |
| G4 | The plan says unknown domains get rejected by the hook, while the design offers "Join the waitlist" for unknown schools (A5). | Unknown school → **no auth user**. `POST /functions/v1/waitlist-request` stores a peppered email hash + domain in `waitlist_requests` (rate-limited by IP; Turnstile on web). We email them when their school launches. The email address is stored encrypted, only for that purpose, and deleted after it's sent or after 12 months. |
| G5 | The plan mentions an `events` table for metrics, but the DB is capped at 500 MB. | No raw events in Postgres. Product analytics → PostHog. Admin metrics (G12) are computed from domain tables (listings, offers, chats, meetups, profiles) through `admin_metrics_*` views. |
| G6 | Promotional pushes must be opt-in (Apple 4.5.4), but the plan's catalog had stale-listing nudges and announcements on by default. | New pref `tips` (default **false**) gates `listing_stale`, `announcement` type `news`, and `campus_tip`. Safety announcements and account notices always send. |
| G7 | The share OG image shows a clear photo and price publicly, while "Link while signed out" (X30) blurs listings. | OG card is generated **only when a user taps Share** and never includes the seller name. The `/l/[id]` HTML page shows the blurred sign-in wall (X30). This is explained in the privacy policy. |
| G8 | "Share with a friend" (E12) sends a link, but no web page for the friend exists. The invite link `/i/[code]` also had no landing page. | Added web pages **W-MEET** (`/m/[token]`, no login, expires 24h after meetup) and **W-INVITE** (`/i/[code]`). |
| G9 | The web legal nav lists Terms, Community rules, Banned items, Safety and Cookies, but only Privacy and Child safety were designed. | These reuse the W13 template (`apps/mobile/app/(web)/legal/[slug].tsx`, static export). The "Cookies" page states we use no cookies for tracking, only auth storage. |
| G10 | Admin reveal of a Quad author needs a stronger control (Apple 1.6). The plan allowed "owner + AAL2". | `reveal_quad_author(post_id, case_ref, reason)` requires owner + AAL2 + non-empty `case_ref`. It writes `audit_log`, emails the owner a receipt, and is rate-limited to 5 per day. |
| G11 | Edge Functions block SMTP ports 25/587; port 465 is untested. | Task **P1-SPIKE-01**. Fallback: Cloudflare Worker `workers/mailer` using TCP sockets. Plan B path: Resend HTTPS API (needs the $10.46 domain). |
| G12 | The waitlist unlock sends up to 500 emails at once, which hits the Gmail cap of ~500 a day. | The `campus_open` email queue drains at 400 a day; push goes to everyone immediately. |
| G13 | Photos-in-chat and Quad-in-v1 are undecided. | Both are built behind flags (`chat_photos_enabled`, `quad_enabled`) and default to **on**. They can be turned off per platform without a store build. Building the photo code while it's off isn't a problem because it's a normal, reviewed feature, not a hidden one. |
| G14 | EXIF stripping relies on `expo-image-manipulator`. | Added test T-UNIT-MEDIA-03, which asserts no GPS EXIF tag in the output file. |
| G15 | Realtime Authorization for private Broadcast channels needs RLS on `realtime.messages`. | Policy added in `backend.md` §6. |

Everything else in the research plan stands as written.
