# Pre-build review and spec freeze

**Date:** 2026-09-25
**Scope:** everything produced so far:
- design board (`design/OS_FInal Design.html`, 212 frames)
- research
- build plan (`docs/OnlySwap-Build-Plan.md`)
- blueprint v0 (now `docs/archive/blueprint-v0/`)

**Outcome:** the locked spec in `CLAUDE.md` and `docs/*.md`. Where the design board and the locked docs disagree, **the docs win** (see DESIGN_SYSTEM.md §9, "Design deltas").

Every reviewer reviewed independently. Findings are listed by role, then consolidated in §12.

---

## 1. Product Manager

**What's wrong or missing:**

- **PM-01 (Critical): v1 scope doesn't fit a solo developer.** Blueprint v0 has 198 tasks and about 1,140 h, which is 11–12 months at 20 h/week. That's too long before the first real user feedback, and too long to keep a campus interested. The anonymous Quad, chat photos, the in-app map, the student web app, the full admin, widgets and alternate icons all ship in v1 without having earned their place.
  - **Fix:** three releases (PRD §6).
    - **R1.0:** the swap loop plus safety plus what the stores require.
    - **R1.1** (4–8 weeks after launch): Quad, chat photos, in-app map, admin extras.
    - **R2:** web app, widgets, iPad, Spanish, alternate icons, check-ins.
- **PM-02 (High): no success metrics per feature.** The research memo has a north star, but no feature has a target.
  - **Fix:** PRD §5 metrics.
    - North star: **completed swaps per campus per week** (both parties confirm).
    - Every feature gets one leading metric.
- **PM-03 (High): missing recovery flows.**
  - A student who loses access to their school email (graduated, IT reset) is locked out forever. Sessions persist, but a sign-out means the account is gone.
  - There's no "sign out of all devices".
  - There's no path when the school email changes (for example, the university renames domains).
  - **Fix:** a Help → "I can't get into my school email" support request (identity check by the owner, manual email change through an admin RPC), a "Sign out of all devices" row, and domain aliases in `campus_domains`.
- **PM-04 (High): no re-accept flow when Terms or Rules change.** `rules_version` is stored but nothing enforces a new version.
  - **Fix:** gate order includes "rules_version < current", which shows an Updated rules screen (a reuse of A11 with a diff summary).
- **PM-05 (Medium): the Wanted flow is ambiguous.** Who contacts whom when someone taps "I have this"?
  - **Fix:** "I have this" opens the Sell flow prefilled and links the new listing to the Wanted post (`listings.wanted_ref`). The Wanted poster gets a `wanted_match` notification and makes an offer as usual. No new chat type.
- **PM-06 (Medium): free items have no allocation rule.** Many people can "ask" for a free item.
  - **Fix:** free items use offers at $0 ("Ask for it"). The seller sees requests in arrival order and picks one. That's the same machinery with different copy.
- **PM-07 (Medium): the campus unlock at 500 isn't explained for the launch campus.**
  - **Fix:** the launch campus is `live` from the start of the beta; access is limited by the beta itself. Other campuses use the 500 rule from R1.1 (DEC-11, DEC-13). PRD §4 states this.
- **PM-08 (Low): the Rate-the-app prompt timing.** It's fine as designed; keep it.
- **PM-09 (Medium): too many notification types for v1** (31). Anything that fires rarely or needs data you don't have yet (for example `quad_milestone`, price hints) moves with its feature.
  - **Fix:** R1.0 ships 21 types (API.md §7).

**Cut or move:**

| Item | Move to | Why |
|---|---|---|
| Quad (all Q screens) | R1.1 | Biggest rejection risk (Apple 1.2 anonymous; Play Jul 2026 anonymous rule); heavy moderation load for one person; not needed for the swap loop |
| Chat photos | R1.1 | CSAM/nudity risk without free image scanning on Plan A; text plus listing photos is enough to close deals |
| In-app map + location permission | R1.1 | 3–6 spots per campus read fine as a list; removes a permission, a native dependency and a privacy-label item |
| Student web app (browse/inbox/sell) | R2 | Duplicate surface; mobile is the product |
| Admin metrics / team / announcements / banned-words UI | R1.1 | Launch uses SQL/seed for banned words; PostHog covers metrics; you're the only admin |
| Widgets, Live Activity, iPad, Spanish, alternate icons, check-ins | R2 | Nice-to-have |
| Price hint | R1.0 (hidden until ≥5 comparables) | Cheap, and it self-hides |

---

## 2. UX/UI Designer

- **UX-01 (High): the tab bar changed across the board.** Early frames have a Search tab; later ones have Quad.
  - **Fix:** R1.0 tabs are **Discover · Sell · Inbox · Profile**, with Search as a Discover header icon. In R1.1, Quad is inserted as the 2nd tab. The tab bar reads from config so the switch is one line.
- **UX-02 (High): "Night" is modelled as one of eight skins,** but dark mode must be orthogonal to the brand accent.
  - **Fix:** two layers. **Mode** (light/dark, which follows the system and can be overridden in Appearance) and a single **brand accent** (chosen once; Pistachio is the default until the owner decides). The other accents stay a design-time tool only, not a user setting.
- **UX-03 (High): the accent used as text or icon fails contrast** on light backgrounds (Pistachio, Butter, Sky are around 1.5–2:1 on white).
  - **Fix:** rule: the accent is only used as a **fill** with `onAccent` text. Accent-colored text or icons aren't allowed on light surfaces. The token test enforces pairs.
- **UX-04 (Medium): header patterns are inconsistent.** Some screens use large titles, others inline titles.
  - **Fix:**
    - Tab roots use a large title.
    - Pushed screens use an inline title.
    - Quick actions (offer, report, filters, options, confirm) are bottom sheets.
    - Destructive confirmations are sheets with a red primary button.
- **UX-05 (Medium): the swipe card overlay text at 200% font scale** covers the photo or clips.
  - **Fix:** card overlay text caps at `maxFontSizeMultiplier=1.4`. The full details are on the listing screen, which scales fully, and "Details" is in the card's a11y actions.
- **UX-06 (Medium): the Birthday screen uses a custom wheel.**
  - **Fix:** use the native date picker (`@react-native-community/datetimepicker`: iOS wheels, Android dialog). It's accessible by default and has no preselected date (the field shows "Pick a date").
- **UX-07 (Medium): "Safe-exchange zone" is a promise we can't guarantee** (and a liability; see LEG-04).
  - **Fix:** the copy becomes **"Meetup spot"**. Spots that campus police officially designate get a "Police-designated" tag. Everything else is a "Public spot".
- **UX-08 (Medium): the "Campus" segment on Discover (free stuff, Wanted, free food) and the Quad** are two community surfaces that will confuse users in R1.1.
  - **Fix:** the Campus segment stays (items). The Quad is conversation. The labels make that clear: segment "Swipe | Around campus"; the Quad tab is "Quad".
- **UX-09 (Low): haptics are used everywhere.**
  - **Fix:** a haptics budget. Only these fire one:
    - swipe threshold (selection)
    - offer sent / accepted (success)
    - error shake (warning)
    - vote (R1.1)
- **UX-10 (Medium): no documented spec for the empty first-launch state** when a campus has fewer than 10 listings.
  - **Fix:** the Day one hero (C6) plus founding sellers (C7) replace the deck until 10 active listings exist.
- **UX-11 (Low): the Quad emoji avatars conflict with the "no emoji in UI" rule.**
  - **Fix:** R1.1 Quad uses letter-and-color aliases ("Anon 3"), not emoji.
- **UX-12 (Medium): the web delete and help pages need the same design system** but live on the site.
  - **Fix:** `packages/tokens` generates CSS variables for the site and the admin.
- **UX-13 (Low): Android visuals.** Material pill tab indicator, arrow back, ripple. Accepted as designed (N1–N4).
- **UX-14 (Medium): the "not AI-looking" risk in code.** Developers default to generic cards, gradients and emoji.
  - **Fix:** DESIGN_SYSTEM.md §8 lists banned patterns:
    - no gradient buttons
    - no drop-shadow-heavy cards
    - no emoji icons
    - no "✨" copy
    - no stock illustrations
    - photos first, one accent, tight type scale, real copy from `en.ts`

---

## 3. Software Architect

- **ARC-01 (High): JWT claims go stale.** `campus_id` and `status` in the token live up to 1 h after a suspension.
  - **Decision:** RLS **select** policies use the claims (cheap). Every **write** RPC calls `require_active()`, which reads `profiles` live. A suspended user can read for at most 1 h and can't write. On suspension, `admin_set_user_status` also calls `auth.admin.signOut(user, 'global')` through an Edge Function to revoke refresh tokens.
- **ARC-02 (High): no API compatibility policy.** Store builds lag behind OTA and backend changes; old app versions will call changed RPCs.
  - **Fix:**
    - RPCs are **additive-only**.
    - A breaking change creates `name_v2`.
    - The old version is kept until `min_version` passes the app version that used it.
    - A CI contract test compares RPC signatures against `packages/shared/src/rpc-contract.json`.
- **ARC-03 (Medium): the separate exposed `admin` schema adds PostgREST config and complexity.**
  - **Fix:** admin RPCs live in `public` with the prefix `admin_`, and each checks `require_admin()`.
- **ARC-04 (Medium): the web stack.** Expo Router static export for marketing and legal pages is heavy and weak for SEO.
  - **Fix:** `apps/site` uses **Astro** (free, static, markdown legal pages, Pages Functions for `/l`, `/m`, `/i`). See ADR-009.
- **ARC-05 (Medium): cron-driven push every minute** costs about 43k Edge invocations a month even when idle (fine, 9% of the quota).
  - **Fix:** keep it, but `send-push` returns early with no DB work when `select 1 from notifications where push_state='pending' and push_after<=now() limit 1` is empty (a cheap query through pg_net payload: the cron only calls the function if rows exist, `perform ... where exists`).
- **ARC-06 (Medium): offline behavior is under-specified.**
  - **Fix:** ADR-006:
    - Only swipes/saves queue offline.
    - Messages queue while the app is open (in-memory plus MMKV) and are sent in order.
    - Everything else fails fast with copy.
    - Cached reads: feed page 1, inbox, my listings, the profile.
- **ARC-07 (Low): too many state libraries?** Zustand plus TanStack Query plus MMKV is fine.
  - **Rule:** server data only goes in Query. Zustand only holds UI and ephemeral state (deck position, pending swipes, sheet state).
- **ARC-08 (Medium): MMKV v4 and Unistyles v3 depend on Nitro and the New Architecture.** SDK 57 defaults to the New Architecture.
  - **Fix:** pin via `npx expo install`; add P1 spike S1-verify that both build on iOS and Android dev clients.
- **ARC-09 (Low): Supabase region.**
  - **Fix:** `us-east-1` (closest to Ohio) for both projects.
- **ARC-10 (Medium): no documented approach to free-tier ceilings.**
  - **Fix:** ARCHITECTURE.md §6 has a budget table plus `scripts/usage-report.ts` (in R1.0, not post-launch).

ADRs are in ARCHITECTURE.md §7 (ADR-001 to ADR-016).

---

## 4. Backend Engineer

- **BE-01 (Critical): hard deletes cascade through deals.** `listings on delete cascade` → offers → chats → messages. A seller deleting a listing (or their account) mid-deal wipes the buyer's chat and any evidence for an open report.
  - **Fix:**
    - Listings are **never hard-deleted by users**. `delete_listing` sets `status='deleted'` and `deleted_at`.
    - FKs from offers and chats to listings are `on delete set null`.
    - `chats` stores a **snapshot** (`listing_title`, `listing_price_cents`, `listing_thumb_path`).
    - `chats.buyer_id` and `chats.seller_id` are `on delete set null`, and the UI shows "Deleted user".
    - Account deletion anonymizes rather than cascading into other people's chats.
- **BE-02 (Critical): reported evidence disappears** when the reported user deletes their account.
  - **Fix:** `reports.evidence jsonb` is captured at report time (text, message excerpts, photo keys). `delete-account` moves photo keys referenced by open reports to `onlyswap-private/evidence/` (kept 180 days) instead of deleting them.
- **BE-03 (High): double sending.** Overlapping cron runs of `send-push` or `send-email` can send twice.
  - **Fix:** claim rows with `update … set push_state='sending', claimed_at=now() where id in (select id … for update skip locked limit 500) returning *`. Rows stuck in `sending` for more than 10 min are reset by a cron job. Same pattern for `email_outbox`.
- **BE-04 (High): duplicate notifications** from retried triggers or RPC retries.
  - **Fix:** `notifications.dedupe_key text` with a unique partial index `(user_id, dedupe_key) where dedupe_key is not null` (for example `offer_new:{offer_id}`), and inserts use `on conflict do nothing`.
- **BE-05 (High): `create_listing` retries after a timeout** could create duplicates.
  - **Fix:** the id comes from `reserve_listing_id()`. The insert uses `on conflict (id) do nothing` and returns the existing row, so it's idempotent.
- **BE-06 (High): meetups.** Multiple active proposals per chat are possible.
  - **Fix:** unique partial index `meetups(chat_id) where status in ('proposed','confirmed')`. A new proposal cancels the previous one in the same transaction.
- **BE-07 (High): no-show abuse.** Both sides can report each other.
  - **Fix:** `report_noshow` requires the **reporter to have checked in**. If both checked in, the report is rejected. Two confirmed no-shows pause offers; the admin can reverse.
- **BE-08 (Medium): `hot_rank` is stored at write time** and goes stale. (R1.1 Quad.)
  - **Fix:** compute it at read time over the last 7 days with an index on `(campus_id, status, created_at)`.
- **BE-09 (Medium): mass-report brigading** can auto-hide legitimate content.
  - **Fix:** auto-hide requires 3 reports from **distinct accounts older than 7 days** within 24 h. It always creates a review item; auto-hide is never auto-remove.
- **BE-10 (Medium): race between `make_offer` and a status change** (sold/deleted) in another transaction.
  - **Fix:** `make_offer` does `select … from listings where id=$1 for share` and checks the status in the same transaction.
- **BE-11 (Medium): chat after the listing sells to someone else.**
  - **Fix:** `mark_sold` closes other open chats for that listing (`status='closed'`, read-only) with a system message. Buyers are notified with `offer_declined`-style copy: "This sold to someone else".
- **BE-12 (Medium): time zones and DST.** Meetup times, quiet hours and "tonight" copy must use the campus time zone.
  - **Fix:** all date math is in SQL with `at time zone campus.timezone`; client display uses `Intl` with the campus TZ; tests include the DST boundary (T-INT-TZ-01).
- **BE-13 (Medium): `pg_graphql` exposes a second API surface.**
  - **Fix:** `drop extension pg_graphql` (or disable it in the dashboard). PostgREST plus RPC only.
- **BE-14 (Low): enum churn.** Postgres enums are hard to alter. Keep enums for stable sets (statuses). Use `text + check` for fast-changing lists (report reasons, notification types). Changed in DATA_MODEL.md.
- **BE-15 (Medium): migrations.** Seeds for production (categories, banned words, first names) must be migrations, not `seed.sql`, which only runs locally.
  - **Fix:** `0100_ref_data.sql` holds idempotent upserts; `seed.sql` is local demo data only.
- **BE-16 (Medium): `rate_counters` is written on every RPC** (hot rows).
  - **Fix:** window buckets per action; `unlogged table` (rate data is disposable); prune daily.

---

## 5. Mobile Engineer (iOS + Android)

- **MOB-01 (High): keyboard handling** in chat, sheets and forms is the #1 source of janky React Native apps.
  - **Fix:** add `react-native-keyboard-controller` (free, Expo-compatible) for all keyboard avoidance and the sticky composer. Don't use raw `KeyboardAvoidingView`.
- **MOB-02 (High): the time-sensitive notification entitlement is missing.**
  - **Fix:** iOS entitlement `com.apple.developer.usernotifications.time-sensitive` in `app.config.ts`, plus the capability on the App ID (EAS syncs capabilities).
- **MOB-03 (High): edge-to-edge and predictive back** (SDK 57 defaults on Android 15/16).
  - **Fix:** `react-native-safe-area-context` everywhere; test the gesture nav plus 3-button nav; sheets handle back.
- **MOB-04 (Medium): low-end Android performance.**
  - Avoid `BlurView` on Android (use a translucent solid fallback).
  - Limit the deck to 3 mounted cards.
  - Use 400 px thumbnails in lists.
  - Keep Reanimated worklets free of JS callbacks during the gesture.
  - Target device: Pixel 5 emulator at release build.
- **MOB-05 (Medium): lifecycle.** Realtime sockets must close in the background (iOS kills them anyway).
  - **Fix:** an `AppState` listener unsubscribes and refetches on `active`. Push handles the rest.
- **MOB-06 (Medium): the share card via `react-native-view-shot`** fails off-screen on Android unless `collapsable={false}` and rendered on-screen with 0 opacity.
  - **Fix:** documented in DESIGN_SYSTEM §6. **Fallback:** if capture fails, share without an image (OG falls back to the cover photo).
- **MOB-07 (Medium): Android photo picker availability** on older Play Services.
  - **Fix:** `expo-image-picker` falls back automatically. Keep `READ_MEDIA_*` blocked; test on API 30 (min supported is Android 7 per SDK 57 = API 24; decide the **min API 26** in `app.config.ts` via build properties to cut ancient devices).
- **MOB-08 (Low): alternate app icons** need a config plugin and have low value. Moved to R2.
- **MOB-09 (Medium): the OTA update UX.**
  - **Fix:** `expo-updates` checks on launch. It downloads in the background and applies on next cold start. Critical fixes use `min_version` (store build) or a prompt "Restart to update" only for flagged updates.
- **MOB-10 (Medium): the push token lifecycle** on reinstall or restore to a new phone.
  - **Fix:** tokens are keyed by the token string. `register_push_token` upserts `last_seen_at`. Tokens not seen in 60 days are disabled.
- **MOB-11 (Low): screen orientation** is locked to portrait (`orientation: portrait`).

---

## 6. Web Engineer

- **WEB-01 (High): the site stack** (see ARC-04). The site is Astro; the admin is Vite + React; both are on Cloudflare Pages.
- **WEB-02 (High): no security headers.**
  - **Fix:** a `_headers` file per project with:
    - a strict CSP (admin: `connect-src` Supabase + Sentry only)
    - `X-Frame-Options: DENY`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy`
    - HSTS (Pages sets it)
- **WEB-03 (Medium): SEO basics.**
  - Titles and descriptions per page
  - OG tags
  - `sitemap.xml` (landing, legal, help, child safety)
  - `robots.txt` disallows `/m/`, `/l/`, `/i/`, `/delete`
  - canonical URLs
  - `lang="en"`
  - Lighthouse ≥ 90
- **WEB-04 (Medium): admin hosting exposure.** The admin URL is public (MFA protects it).
  - **Fix:** also send the `noindex` header on the admin. Optional (free, unverified limits, see SEC-15): put Cloudflare Access in front.
- **WEB-05 (Medium): the web delete page auth.** OTP on the web needs the same Supabase project and redirect URLs.
  - **Fix:** it uses OTP code entry (no magic-link redirect) to avoid redirect-URL config.
- **WEB-06 (Low): responsive layout.** The landing has desktop (W1) and phone (W2) designs; legal pages use a single column under 768 px.
- **WEB-07 (Medium): `/l/[id]` public card data.**
  - **Fix:** show only title, price, campus name and share image when the owner has shared. It's `noindex`, with no seller info.

---

## 7. Security Engineer

The threat model is in SECURITY.md. The new findings:

- **SEC-01 (Critical): CSAM and illegal images.** User photos (listings, avatars) can carry CSAM, and there's no free scanning on `workers.dev`.
  - **Fix:**
    - **Plan B domain unlocks Cloudflare's free CSAM Scanning Tool** on the custom-domain zone. This is a strong reason to buy the domain (Q2).
    - Plan A mitigations: new-account photo rate limits, reporting, immediate takedown tooling, and the NCMEC reporting process in the runbook.
- **SEC-02 (High): presigned PUT size isn't enforced** unless `Content-Length` is signed.
  - **Fix:** sign `content-length` and `content-type`. R2 rejects mismatches.
- **SEC-03 (High): suspended users keep refresh tokens.**
  - **Fix:** global sign-out on suspension or ban (ARC-01).
- **SEC-04 (High): admin account takeover** is the worst case (it can reveal identities in R1.1).
  - **Fix:**
    - TOTP enrolled on **two** devices.
    - The admin uses a separate email from your personal one.
    - Reveals need re-MFA plus a case ref.
    - The audit log is immutable.
    - Email receipts go to a second address.
- **SEC-05 (Medium): media Worker quota exhaustion (DoS)** at 100k requests a day on `workers.dev`.
  - **Fix:** the app's disk cache reduces load. The Worker returns 429 per IP over 600 requests a minute (in-memory best effort). With the Plan B domain, R2 is served from a custom domain behind Cloudflare cache plus the free WAF rate-limit rule.
- **SEC-06 (Medium): scams in chat without scanning.**
  - **Fix:** a **client-side** hint on incoming messages containing URLs, phone numbers or payment-app words ("Venmo first", "Zelle", "gift card"): a small inline "Keep payment in person. Never pay before you see the item." No server reading.
- **SEC-07 (Medium): fake accounts** with staff or alumni emails on student domains.
  - **Fix:** blocked alumni domains, yearly re-verify, new-account limits, reports. The residual risk is documented.
- **SEC-08 (Medium): supply chain.** pnpm lockfile, Dependabot, `pnpm audit` in CI (fails on high), and Expo packages pinned by the SDK.
- **SEC-09 (Medium): the PostgREST surface.** Disable `pg_graphql` (BE-13); `revoke all on all tables in schema public from anon` except the allowlisted RPCs; RLS on every table (CI check `supabase/tests/rls_enabled.test.sql`).
- **SEC-10 (Medium): secrets in EAS builds.** Only `EXPO_PUBLIC_*` values are bundled; a bundle-scan test runs in CI (T-SEC-12).
- **SEC-11 (Low): meetup share links** leak first names and spot to anyone with the link. They expire 24 h after the meetup and use 22-character tokens. Accepted and disclosed in the Privacy policy.
- **SEC-12 (Medium): email enumeration** through `lookup_school` and OTP responses. `lookup_school` reveals only whether a domain is supported (public anyway); OTP send returns the same message for any email on an allowed domain.
- **SEC-13 (Medium): Quad anonymity (R1.1).** Aliases are per thread; there are no Realtime events for the Quad; push to the OP says "Someone replied"; a timing-correlation risk exists for tiny campuses. **Fix:** the Quad only opens when a campus has 300 or more active users.
- **SEC-14 (Low): the backup encryption key** is in the password manager plus a printed copy. Accepted.
- **SEC-15 (Low): Cloudflare Access for the admin.** Optional; its free-tier limits aren't verified, so it's not a dependency.

---

## 8. QA Lead

**Untested critical flows and bug classes found in this review.** Each one gets a test in TESTING.md:

| Bug class | New test |
|---|---|
| Delete a listing or account mid-chat (BE-01) | T-INT-DEL-02, E2E-21 |
| Evidence retention (BE-02) | T-INT-DEL-03 |
| Push/email double send (BE-03) | T-FN-07 (concurrent invocations) |
| Duplicate notifications (BE-04) | T-INT-NOTIF-DEDUPE |
| Idempotent create_listing (BE-05) | T-INT-LIST-04 |
| One active meetup (BE-06) | T-INT-MEET-02 |
| No-show rules (BE-07) | T-INT-MEET-03 |
| Brigading (BE-09) | T-INT-SAFE-03 |
| Offer vs. sold race (BE-10) | T-INT-OFF-RACE-02 |
| Timezone/DST (BE-12) | T-INT-TZ-01 |
| Rules re-accept (PM-04) | T-UNIT-AUTH-06, E2E-22 |
| Sign out of all devices (PM-03) | T-INT-AUTH-05 |
| API compatibility (ARC-02) | T-CONTRACT-01 |
| Stale claims after suspension (ARC-01) | T-INT-AUTH-06 |
| Presign size enforcement (SEC-02) | T-SEC-18 |
| RLS enabled on every table (SEC-09) | T-SEC-19 |
| Scam hint (SEC-06) | T-UNIT-CHAT-04 |
| Keyboard/composer (MOB-01) | manual QA row + Maestro E2E-06 step |
| Android low-end perf (MOB-04) | Perf-02 on Pixel 5 emulator |
| OTA fingerprint mismatch | T-REL-01 (manual) |

**Also added:**
- `eslint-plugin-react-native-a11y` in CI.
- `pnpm audit` in CI.
- A contract test.
- A "zero RLS-less tables" test.
- Test IDs traced per feature (§13).

---

## 9. DevOps / Release Engineer

- **OPS-01 (High): staging and prod share the Gmail sender,** so the 500/day limit is shared.
  - **Fix:** a separate staging Gmail sender, or on staging all mail goes to the local test inbox (E2E) plus a small allowlist.
- **OPS-02 (High): keystore and signing backup.**
  - **Fix:** after the first Android build, download credentials with `eas credentials` → a backup of the upload keystore in the password manager. Play App Signing holds the app key. iOS certs are managed by EAS (reproducible).
- **OPS-03 (High): the domain must be final before the first store build.** Universal Links and App Links hosts are compiled into the binary.
  - **Fix:** decide Q2 before P11. Keep `onlyswap.pages.dev` in associated domains **permanently** as well, so both hosts work.
- **OPS-04 (Medium): CI minutes.** pgTAP needs `supabase start` (Docker) on Linux runners, about 4 min a run. At about 150 runs a month that's around 600 min, within 2,000. **Fix:** cache Docker images; run DB tests only when `supabase/**` changes.
- **OPS-05 (Medium): the migration deploy order** (DB before app).
  - **Fix:** always backward-compatible migrations (ARC-02), then deploy the DB, then publish the OTA or store build.
- **OPS-06 (Medium): usage monitoring** moved from post-launch to R1.0 (ARC-10).
- **OPS-07 (Low): release naming.**
  - **Fix:** semver `1.0.0`; OTA runtime from the fingerprint; git tags `v1.0.0`; changelog in `CHANGELOG.md`.
- **OPS-08 (Medium): staging pausing** is handled by the keepalive (private repo); the prod project won't pause once real users exist.

The $0 check passes. The only costs are Apple ($99/yr, paid) and Google ($25 once). The domain ($10.46/yr) is optional but recommended (Q2).

---

## 10. Legal / Compliance and Store Review

- **LEG-01 (Critical): the Terms and Privacy text doesn't exist yet;** only the layouts do.
  - **Fix:** task P14-LEGAL-01 is expanded with required sections (RELEASE.md §6):
    - eligibility (18+, current student)
    - marketplace disclaimer
    - prohibited items
    - UGC license
    - DMCA / takedown
    - reporting and enforcement
    - appeals
    - termination
    - limitation of liability
    - governing law (Ohio)
    - changes to terms
    - contact
  - A lawyer review is recommended; it isn't free, and it's flagged as an owner decision.
- **LEG-02 (High): the Quad's anonymous feature changes store obligations.** Moving it to R1.1 makes R1.0's rating questionnaire simpler (no social feed). The 18+ age gate stays in R1.0 regardless (meetups with strangers, TX/UT/LA laws, simpler R1.1).
- **LEG-03 (High): the Apple reviewer "social media" answer** must be updated when the Quad ships (R1.1 metadata update plus a re-rating). Added to the R1.1 release checklist.
- **LEG-04 (High): "safe-exchange zone" wording implies a safety guarantee.**
  - **Fix:** UX-07 wording plus a Terms clause. Only police-designated spots get that label, and the admin records the designation date.
- **LEG-05 (Medium): the banned list is missing pets, gift cards and recalled items.** Added (DATA_MODEL seed).
- **LEG-06 (Medium): sharing the other person's first name** in meetup share links is disclosed in the Privacy policy and at the share sheet ("Your friend will see Aisha's first name and the spot").
- **LEG-07 (Medium): the Privacy policy must list the retention periods exactly** as implemented: reports 180 d, notifications 60 d, audit 2 y, backups 30 d, exports 7 d, age blocks 365 d (hash only), waitlist emails 12 mo.
- **LEG-08 (Low): a DMCA agent ($6 per 3 years) is optional;** this is the owner's call (Q5).

**Likely rejection reasons and fixes (R1.0):**

| Reason | Fix |
|---|---|
| Apple 2.1: can't sign in | password reviewer accounts plus seeded Demo University plus autoplay bot |
| 5.1.1(v) / Play account deletion | in-app plus web delete |
| 1.2 UGC | report and block on listings, users and chats; rules before posting; contact info |
| 4.2 thin app / empty | demo campus content |
| 2.3 metadata | fictional school; accurate claims |
| Play Data safety mismatch | generated from DATA_MODEL retention plus SDK list |
| Play UGC terms before posting | rules checkbox at onboarding |
| Play target API | 36 |
| Play closed testing | 12 testers for 14 days, started at P11 |
| Age rating | 18+ override plus age check |

---

## 11. Data / Analytics

- **DATA-01 (High): no metric definitions.**
  - **Fix:** PRD §5 plus TESTING's analytics checks. Definitions:
    - **Completed swap:** `listings.status='sold' AND buyer_id not null AND chats.buyer_outcome='done'`.
    - **Activation:** first swipe within 24 h of signup and first offer or listing within 7 days.
    - **Liquidity:** active listings per weekly active buyer; median time to first offer; % listed items sold in 14 days; feed-exhaustion rate.
    - **Retention:** D1, D7, D30 by signup week.
    - **Safety:** reports per 100 completed swaps, no-show rate, moderation SLA (p90 hours to resolve).
- **DATA-02 (Medium): the events list duplicates DB facts.**
  - **Fix:** business metrics come from the DB (admin views). PostHog is for **behavior only**:
    - screen funnels
    - swipe-to-offer conversion
    - feature usage
  - That cuts events to 18 and never sends content.
- **DATA-03 (Medium): privacy.**
  - `person_profiles='identified_only'`, with the ID a salted hash of the user id.
  - No email or name.
  - Session replay **off**.
  - Autocapture off.
  - GeoIP and IP capture off.
  - Opt-out respected.
  - US Cloud.
- **DATA-04 (Low): volume.** 18 events × about 40 per active user per month × 10k users is about 400k/month. That's within 1M.

---

## 12. Consolidated findings

Legend: **Chg** = what the finding changes: **D** design, **P** plan/docs, **C** code (to be built).

| ID | Role | Issue | Sev | Fix | Chg |
|---|---|---|---|---|---|
| PM-01 | PM | v1 scope too big | Critical | R1.0 / R1.1 / R2 split | P, D |
| BE-01 | BE | cascading deletes wipe chats/evidence | Critical | soft delete + snapshots + set null | P, C |
| BE-02 | BE | evidence lost on deletion | Critical | report evidence snapshot + evidence prefix | P, C |
| SEC-01 | SEC | no CSAM scanning on Plan A | Critical | domain → CF CSAM tool; mitigations | P (Q2) |
| LEG-01 | LEG | legal text not written | Critical | required sections; owner writes; lawyer optional | P |
| PM-02 | PM | no metrics | High | PRD §5 | P |
| PM-03 | PM | no recovery flows | High | help flow, sign out everywhere, domain aliases | D, P, C |
| PM-04 | PM | no rules re-accept | High | version gate | D, C |
| UX-01 | UX | tab bar inconsistent | High | 4 tabs R1.0, Quad in R1.1 | D |
| UX-02 | UX | dark mode vs skins | High | mode × single accent | D, C |
| UX-03 | UX | accent contrast | High | accent is fill-only | D |
| ARC-01 | ARC | stale JWT claims | High | writes read live; global sign-out | P, C |
| ARC-02 | ARC | no API compat policy | High | additive RPCs + contract test | P, C |
| BE-03 | BE | double send | High | skip locked claims | C |
| BE-04 | BE | duplicate notifications | High | dedupe_key | C |
| BE-05 | BE | non-idempotent create_listing | High | reserved id + on conflict | C |
| BE-06 | BE | multiple active meetups | High | partial unique | C |
| BE-07 | BE | no-show abuse | High | reporter must check in | C |
| MOB-01 | MOB | keyboard jank | High | keyboard-controller | C |
| MOB-02 | MOB | missing time-sensitive entitlement | High | add entitlement | C |
| MOB-03 | MOB | edge-to-edge/back | High | safe-area + tests | C |
| WEB-01 | WEB | site stack | High | Astro | P |
| WEB-02 | WEB | no security headers | High | `_headers` | C |
| SEC-02 | SEC | presign size unenforced | High | sign content-length | C |
| SEC-03 | SEC | refresh tokens survive suspension | High | global sign-out | C |
| SEC-04 | SEC | admin takeover | High | 2 TOTP, separate email, receipts | P |
| OPS-01 | OPS | shared Gmail limit | High | separate staging sender | P |
| OPS-02 | OPS | keystore backup | High | download + store | P |
| OPS-03 | OPS | domain baked into binary | High | decide before P11; keep pages.dev | P (Q2) |
| LEG-02 | LEG | Quad changes obligations | High | Quad R1.1; age gate R1.0 | P |
| LEG-03 | LEG | re-rating at R1.1 | High | R1.1 checklist | P |
| LEG-04 | LEG | "safe zone" liability | High | "Meetup spot" wording | D |
| DATA-01 | DATA | no metric definitions | High | PRD §5 | P |
| PM-05 | PM | wanted flow unclear | Medium | wanted_ref + notification | P, C |
| PM-06 | PM | free item allocation | Medium | $0 offers | P |
| PM-07 | PM | launch campus unlock | Medium | admin flips live | P |
| PM-09 | PM | too many notif types | Medium | 21 in R1.0 | P |
| UX-04 | UX | header patterns | Medium | rule | D |
| UX-05 | UX | overlay text scaling | Medium | cap 1.4 on overlays | D |
| UX-06 | UX | custom DOB wheel | Medium | native picker | D |
| UX-07 | UX | "safe-exchange" copy | Medium | "Meetup spot" | D |
| UX-08 | UX | two community surfaces | Medium | labels | D |
| UX-10 | UX | day-one empty | Medium | C6/C7 replace deck <10 listings | D |
| UX-12 | UX | tokens on web | Medium | CSS vars generated | C |
| UX-14 | UX | AI-look risk | Medium | banned patterns list | D |
| ARC-03 | ARC | admin schema complexity | Medium | `admin_` prefix in public | P |
| ARC-04 | ARC | web via Expo export | Medium | Astro site | P |
| ARC-05 | ARC | idle cron cost | Medium | exists-guard | C |
| ARC-06 | ARC | offline undefined | Medium | ADR-006 | P |
| ARC-08 | ARC | Nitro deps | Medium | spike | P |
| ARC-10 | ARC | ceilings unmanaged | Medium | budget + usage script in R1.0 | P |
| BE-08 | BE | stale hot rank | Medium | compute at read (R1.1) | C |
| BE-09 | BE | brigading | Medium | distinct aged reporters; review | C |
| BE-10 | BE | offer/sold race | Medium | FOR SHARE | C |
| BE-11 | BE | chats after sold elsewhere | Medium | close + notify | C |
| BE-12 | BE | TZ/DST | Medium | campus TZ everywhere | C |
| BE-13 | BE | pg_graphql surface | Medium | disable | C |
| BE-15 | BE | prod ref data in seed | Medium | ref-data migration | C |
| BE-16 | BE | hot rate rows | Medium | unlogged + buckets | C |
| MOB-04 | MOB | low-end perf | Medium | rules + Pixel 5 target | C |
| MOB-05 | MOB | lifecycle sockets | Medium | AppState handling | C |
| MOB-06 | MOB | view-shot Android | Medium | on-screen capture + fallback | C |
| MOB-07 | MOB | old Android | Medium | minSdk 26 | C |
| MOB-09 | MOB | OTA UX | Medium | background apply | C |
| MOB-10 | MOB | token lifecycle | Medium | upsert + 60 d disable | C |
| WEB-03 | WEB | SEO | Medium | sitemap/robots/meta | C |
| WEB-04 | WEB | admin exposure | Medium | noindex | C |
| WEB-05 | WEB | web OTP | Medium | code entry | C |
| WEB-07 | WEB | /l data | Medium | minimal card | C |
| SEC-05 | SEC | Worker DoS | Medium | cache + limit; domain | C |
| SEC-06 | SEC | chat scams | Medium | client-side hint | D, C |
| SEC-07 | SEC | fake accounts | Medium | limits + re-verify | P |
| SEC-08 | SEC | supply chain | Medium | audit + Dependabot | C |
| SEC-09 | SEC | PostgREST surface | Medium | revoke + RLS test | C |
| SEC-10 | SEC | bundle secrets | Medium | scan test | C |
| SEC-12 | SEC | enumeration | Medium | uniform responses | C |
| SEC-13 | SEC | Quad anonymity at small scale | Medium | 300-user minimum (R1.1) | P |
| OPS-04 | OPS | CI minutes | Medium | path filters, cache | C |
| OPS-05 | OPS | deploy order | Medium | DB first, compatible | P |
| OPS-06 | OPS | usage monitoring late | Medium | R1.0 | P |
| LEG-05 | LEG | banned list gaps | Medium | pets, gift cards, recalled | D, C |
| LEG-06 | LEG | share link disclosure | Medium | copy + policy | D |
| LEG-07 | LEG | retention exactness | Medium | policy table | P |
| DATA-02 | DATA | event duplication | Medium | behavior-only events | P |
| DATA-03 | DATA | analytics privacy | Medium | settings list | C |
| PM-08 | PM | review prompt | Low | keep | — |
| UX-09 | UX | haptics overuse | Low | budget | D |
| UX-11 | UX | emoji aliases | Low | letter aliases | D |
| UX-13 | UX | Android visuals | Low | accepted | — |
| ARC-07 | ARC | state libs | Low | rule | P |
| ARC-09 | ARC | region | Low | us-east-1 | P |
| BE-14 | BE | enum churn | Low | text+check for lists | C |
| MOB-08 | MOB | alt icons | Low | R2 | P |
| MOB-11 | MOB | orientation | Low | portrait | C |
| WEB-06 | WEB | responsive | Low | single column | C |
| SEC-11 | SEC | share link exposure | Low | accepted + disclosed | P |
| SEC-14 | SEC | backup key | Low | accepted | — |
| SEC-15 | SEC | CF Access | Low | optional | — |
| OPS-07 | OPS | release naming | Low | semver + changelog | P |
| OPS-08 | OPS | staging pause | Low | keepalive | P |
| LEG-08 | LEG | DMCA agent | Low | owner choice (Q5) | — |
| DATA-04 | DATA | event volume | Low | within limit | — |

**Totals:** 5 Critical · 28 High · 52 Medium · 17 Low (102 findings). All are accepted except the ones marked "accepted as-is" or open questions.

---

## 13. Decisions (conflicts resolved)

| # | Conflict | Final call | Why |
|---|---|---|---|
| DEC-1 | PM wants the Quad cut from v1; the research/engagement memo says the Quad drives daily opens | **Quad moves to R1.1** (build starts right after R1.0 submission) — *pending owner confirmation Q1* | The swap loop must work first; rejection risk and solo moderation load are highest for the anonymous feed; R1.1 can ship within weeks through a normal store update |
| DEC-2 | UX wants the in-app map; Security/Legal want no location | **R1.0: no map, no location permission**, a spot list plus "Directions" deep link to Apple/Google Maps. R1.1: MapLibre map *without* location (spots only); location sort only if users ask | Removes a permission and a privacy-label item; 3–6 spots don't need a map |
| DEC-3 | Chat photos: helps deals vs. CSAM risk without scanning | **R1.1, and only once Plan B's CSAM scanning is on or the owner accepts the risk** (Q3) | Safety first; listing photos already show the item |
| DEC-4 | Architect: Astro for the site vs. "don't add tools" | **Astro** (ADR-009) | Static, SEO, markdown legal; free; isolated from the app |
| DEC-5 | UX: 8 skins as a user feature vs. dev simplicity | **One brand accent plus light/dark** | Brand consistency; halves the QA matrix |
| DEC-6 | Admin scope | **R1.0 admin:** login+MFA, reports, users, listings, appeals, campus setup (domains, spots, status), flags, audit log. **R1.1:** Quad queue, metrics, team, announcements, banned-words UI | You're the only admin at launch |
| DEC-7 | "Safe-exchange zone" | **"Meetup spot"**, and "Police-designated" only when official | Liability |
| DEC-8 | Age gate even without the Quad | **Keep in R1.0** | Meetups with strangers; state laws; avoids adding it later |
| DEC-9 | Fonts: blueprint said Inter; board uses system fonts | **System fonts** (SF Pro / Roboto) | Native feel, no bundle; the board already used them |
| DEC-10 | Enums vs text for lists | **Enums for statuses, text+check for reasons/types** | Migration safety |
| DEC-11 | Launch campus unlock | **The launch campus is `live` from the start of the beta** (testers only, via TestFlight / Play closed test); the 500 rule applies to new campuses from R1.1 | Controlled launch; removes the waitlist gate from R1.0 |
| DEC-12 | Min Android | **minSdk 26 (Android 8)** | Low-end perf and testing surface |
| DEC-13 | After the first cut, R1.0 re-estimated at ~1,090 h (still too large) | **Second cut:** waitlist gate and campus unlock screens, Around campus (free food, Wanted, campus feed), Wanted matching, price-hint UI, data export screen, `/i` and `/joined` pages move to R1.1. The launch campus is live from the start of the beta (DEC-11). Unknown-school waitlist *requests* stay in R1.0 (A03 → `waitlist-request`). Data export requests go to support email in R1.0 | Every remaining R1.0 task is either the swap loop, safety, or a store requirement |

---

## 14. Changes applied (what changed, where)

| Area | Before (v0) | After (locked) | Doc |
|---|---|---|---|
| Release scope | Everything in v1 | R1.0 / R1.1 / R2 (PRD §6) | PRD, TASKS |
| Tabs | Discover, Quad, Sell, Inbox, Profile | R1.0: Discover, Sell, Inbox, Profile (Quad in R1.1) | DESIGN_SYSTEM §9 |
| Theme | 8 selectable skins | light/dark × one brand accent | DESIGN_SYSTEM §2 |
| Meetup location | map + coarse location permission | spot list + Maps deep link; no permission | PRD, DESIGN_SYSTEM, DATA_MODEL |
| Copy | "safe-exchange zone" | "Meetup spot" / "Police-designated" | DESIGN_SYSTEM §9 |
| Birthday | custom wheel | native date picker | DESIGN_SYSTEM §9 |
| Deletion | cascades | soft delete + snapshots + set null + evidence | DATA_MODEL |
| Notifications | 31 types, no dedupe, no claim | 21 types R1.0; dedupe_key; skip-locked claim | API §7, DATA_MODEL |
| Admin schema | `admin.*` | `public.admin_*` | API |
| Site | Expo web export | Astro `apps/site` | ARCHITECTURE |
| Web app | v1 | R2 | PRD |
| Recovery | none | help flow, sign out everywhere, domain aliases, rules re-accept | PRD, DESIGN_SYSTEM, API |
| Banned list | 8 groups | + pets, gift cards, recalled items | DATA_MODEL |
| Scam hint | none | client-side hint on incoming messages | DESIGN_SYSTEM, TESTING |
| Keyboard | KeyboardAvoidingView | react-native-keyboard-controller | ARCHITECTURE |
| Min Android | API 24 | API 26 | RELEASE |
| Security headers | none | `_headers` for site + admin | SECURITY |
| API policy | none | additive RPCs + contract test | ARCHITECTURE ADR-011, TESTING |
| Tasks | 198 in 18 phases, single release | re-planned: R1.0 tasks + R1.1/R2 backlog, new fix tasks | TASKS |
| Tests | 44 unit, 30 integration, 20+13 E2E | + 20 new tests from §8 | TESTING |

**Design board:** the HTML board is **not re-rendered** in this freeze. The design deltas (DESIGN_SYSTEM.md §9) override the board. Updating the board visuals is optional and is task R-DES-01 (low priority).

---

## 15. Traceability check

Every design feature is traced PRD feature → screens → data → API → tasks → tests. The full matrix is PRD.md §7.

**Features that break the chain:** none for R1.0.

**Features deliberately parked with an incomplete chain:**
- **R1.1 features** (Quad, chat photos, map, admin extras) keep the PRD, screens, data, API and tests, but their tasks are in the R1.1 backlog without session scheduling.
- **R2 features** (web app, widgets, Live Activity, iPad, Spanish, alternate icons, check-ins) have PRD, screens and backlog tasks only. Their data, API and tests are marked "to be specified at R2 kickoff".

That's intentional and recorded in DECISIONS_LOG.

---

## 16. Open questions for the owner

| # | Question | Default if you don't answer |
|---|---|---|
| Q1 | Confirm the **Quad moves to R1.1** (not in the first store release)? | Yes, R1.1 |
| Q2 | **Buy the domain** ($10.46/yr .com) before P11? It unlocks the CSAM scanning tool, reliable .edu email delivery, uncapped image serving, and a permanent deep-link host. | Recommended yes. Without it, launch on `pages.dev` + Gmail and accept the risks in SECURITY.md |
| Q3 | Chat photos in R1.1: only after CSAM scanning is available (needs Q2), or accept the risk on Plan A? | Only with scanning |
| Q4 | Final **name** after the USPTO search (P0-ACC-13)? | Keep "OnlySwap" only if the search is clear |
| Q5 | Register a **DMCA agent** ($6 per 3 years)? | No (Terms have a takedown process) |
| Q6 | **Brand accent** (Pistachio default) and **logo** (Handoff default)? | Pistachio + Handoff |
| Q7 | A **lawyer review** of Terms and Privacy (not free)? | Owner writes them from the required-sections list; no lawyer |
| Q8 | **Launch campus** confirmed as Ohio State? Real meetup spots verified with campus police? | Ohio State; spots labelled "Public spot" until verified |

---

## 17. Verdict

**Freeze stats:**
- 102 findings (5 Critical, 28 High) and 13 decisions.
- R1.0 = 197 tasks, about 840 h human-paced, estimated 7–9 months at 20 h/week with Claude Code (PRD §6).
- 44 build sessions.
- Traceability checked by script: every R1.0 feature is fully traced, and every referenced task and test ID exists.

**Ready to build: YES, for Phase 0–3 (accounts, foundations, design system, data model). NO for store-facing phases until Q2 and Q4 are answered.**

**Why yes:**
- The architecture, data model, API contracts, security model and test plan are now consistent and traceable.
- The critical data-integrity bugs (BE-01/02) and scope risk (PM-01) are fixed in the spec.
- Nothing in Phases 0–3 depends on the open questions: tokens, schema and RLS are the same whichever way Q1–Q8 go.

**Why not everything yet:**
- Q2 (domain) changes the email provider, deep-link host and CSAM coverage, and must be final before the first store build (P11).
- Q4 (name) must be final before any store listing, bundle display name or marketing asset.
- Answer both before starting P4 to avoid rework in onboarding copy and email templates.
