# DECISIONS_LOG.md

Newest first. Each entry records the date, the decision, why it was made, who decided, and what it supersedes.

"Owner" means Wasif. "Review" means the pre-build review in `docs/REVIEW.md`.

| # | Date | Decision | Why | By | Supersedes |
|---|---|---|---|---|---|
| 39 | 2026-09-25 | Second scope cut (DEC-13): waitlist gate/unlock screens, Around campus (food, Wanted, campus feed), price-hint UI, data export screen, `/i` + `/joined` pages → R1.1 | R1.0 still ~1,090 h after the first cut | Review | — |
| 38 | 2026-09-25 | Spec frozen. `CLAUDE.md` + `docs/*.md` are the source of truth; `docs/archive/blueprint-v0/` is kept for history only | Pre-build review | Review | blueprint v0 |
| 37 | 2026-09-25 | Release split R1.0 / R1.1 / R2 (PRD §6) | Solo scope; rejection risk; faster feedback | Review (owner to confirm Q1) | "everything in v1" |
| 36 | 2026-09-25 | Quad moves to R1.1, only for campuses with 300+ active users | Apple 1.2 / Play anonymous rules; moderation load; anonymity at small scale | Review (Q1) | Quad in v1 |
| 35 | 2026-09-25 | No in-app map and no location permission in R1.0. Spot list + Directions deep link. MapLibre map (no location) in R1.1 | Fewer permissions, simpler privacy label, less native weight | Review | map + coarse location |
| 34 | 2026-09-25 | Chat photos move to R1.1, gated on CSAM scanning (domain) or an explicit owner risk acceptance | Safety | Review (Q3) | chat photos behind a flag in v1 |
| 33 | 2026-09-25 | Student web app (browse, inbox, sell) moves to R2. Site = landing, legal, help, delete, child safety, `/l`, `/m`, `/i`, 404 | Scope | Review | web app in v1 |
| 32 | 2026-09-25 | Site built with Astro (`apps/site`); admin with Vite+React (`apps/admin`); both on Cloudflare Pages | SEO, static, markdown legal pages; free | Review (ADR-009) | Expo Router web export for site |
| 31 | 2026-09-25 | Theme = light/dark mode × one brand accent. Accent is fill-only (never text on light) | Contrast; brand consistency; QA matrix | Review | 8 user-selectable skins |
| 30 | 2026-09-25 | R1.0 tabs: Discover · Sell · Inbox · Profile; Quad is inserted in R1.1 | Consistency; Quad deferred | Review | 5 tabs incl. Quad |
| 29 | 2026-09-25 | System fonts (SF Pro / Roboto), not Inter | Native feel, matches the board | Review | blueprint "Inter" |
| 28 | 2026-09-25 | Copy uses "Meetup spot" with a "Police-designated" tag only when official; never "safe-exchange zone" | Liability | Review | "safe-exchange zone" |
| 27 | 2026-09-25 | Birthday uses the native date picker, not a custom wheel | Accessibility | Review | custom wheel |
| 26 | 2026-09-25 | Listings are soft-deleted; chats keep a listing snapshot; FKs into deals are `set null`; report evidence is snapshotted and retained 180 d | Data integrity; evidence | Review (BE-01/02) | cascading deletes |
| 25 | 2026-09-25 | Notifications have `dedupe_key`; push/email use `for update skip locked` claims | No duplicates or double sends | Review | — |
| 24 | 2026-09-25 | Admin RPCs are `public.admin_*`, not an `admin` schema | Simpler PostgREST config | Review (ADR-012) | `admin` schema |
| 23 | 2026-09-25 | RPCs are additive-only; breaking changes create `_v2`; contract test in CI | Old app versions in the wild | Review (ADR-011) | — |
| 22 | 2026-09-25 | Writes read live `profiles` state; suspension/ban revokes sessions globally | Stale JWT claims | Review (ADR-013) | claims-only checks |
| 21 | 2026-09-25 | `react-native-keyboard-controller`, `react-native-safe-area-context`, minSdk 26, portrait only, time-sensitive push entitlement | Mobile quality | Review | — |
| 20 | 2026-09-25 | 21 notification types in R1.0 (API §7); the rest ship with their feature | Scope | Review | 31 types |
| 19 | 2026-09-25 | The launch campus is `live` from the start of the beta; the 500-member rule applies to later campuses (R1.1) | Controlled launch | Review | 500 rule for all |
| 18 | 2026-09-25 | Enums for statuses; `text + check` for reasons and notification types | Migration safety | Review | enums everywhere |
| 17 | 2026-09-25 | Analytics: behavior-only events (18) in PostHog; business metrics from DB views; no replay, no autocapture, no GeoIP | Privacy; free tier | Review | 22 events |
| 16 | 2026-09-25 | Store compliance: 18+ with an age check (OS signal first, date fallback), promotional push opt-in, fictional school in store assets, expanded banned list, child-safety page | Apple/Google/state law audit | Owner + audit | "no age check" |
| 15 | 2026-09-25 | Launch in the United States only; declare "not a trader" (EU DSA) | Scope; privacy of personal address | Audit | — |
| 14 | 2026-09-25 | Build blueprint v0 created (198 tasks) | — | Owner | — |
| 13 | 2026-09-25 | Stack: Expo SDK 57 / RN 0.86 / TS / Expo Router; Supabase; Cloudflare R2/Workers/Pages; Expo Push; Sentry; PostHog; EAS | $0 constraint; one codebase | Research plan | — |
| 12 | 2026-09-25 | $0 running cost; only Apple $99/yr (paid) and Google $25 once; domain $10.46/yr optional (Q2) | Owner constraint | Owner | — |
| 11 | 2026-09-25 | Quad and chat photos designed behind flags | Owner undecided | Owner | — |
| 10 | 2026-09 | Anonymous feed "The Quad": anonymous to peers, not to OnlySwap; no anonymous DMs | Apple Feb 2026 rule | Owner | — |
| 9 | 2026-09 | Seller must accept an offer before chat opens; no chat content scanning | Safety + privacy | Owner | — |
| 8 | 2026-09 | Founding sellers = status badge only, no prizes | Sweepstakes law | Owner | — |
| 7 | 2026-09 | Cash in person; no in-app payments | Scope; Apple 3.1.3(e) | Owner | — |
| 6 | 2026-09 | .edu email + 6-digit code; no passwords (except reviewer accounts) | Verified students | Owner | — |
| 5 | 2026-09 | Color and logo chosen later (switchable); defaults Pistachio + Handoff | Owner | Owner | — |
| 4 | 2026-09 | Editorial warm-minimal, "not AI-looking" visual direction | Owner | Owner | — |
| 3 | 2026-09 | Campus-only marketplace with swipe discovery | Owner | Owner | — |

## Open (awaiting owner)

Q1–Q8 are in `docs/REVIEW.md` §16. When answered, add a row here and update the affected docs.
