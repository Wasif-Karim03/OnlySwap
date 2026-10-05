# RELEASE.md — Environments, CI/CD, store submission, operations (LOCKED)

## 1. Environments

The environments are local, staging and production (ARCHITECTURE §8).

**Rules:**
- Migrations go local → staging (on merge to `main`) → production (on a release tag, after a backup).
- Production never gets `supabase/migrations_staging/`.
- Staging uses its **own Gmail sender** (OPS-01) and the E2E test domain.
- Each environment has its own Workers, buckets and Pages project (`onlyswap-site`, `onlyswap-admin`, with preview branches for staging).

## 2. Versioning

| Thing | Rule |
|---|---|
| App version | semver in `app.config.ts` (`1.0.0`). iOS `buildNumber` and Android `versionCode` are auto-incremented by EAS (`appVersionSource: remote`) |
| OTA runtime | `runtimeVersion: { policy: 'fingerprint' }` |
| Git | tag `v1.0.0` per store release; `CHANGELOG.md` (Keep a Changelog) |
| DB | migration numbers; additive-only RPCs (ADR-011) |
| `app_config` | `min_version_ios`, `min_version_android` (force update), `rules_version` (re-accept), `maintenance` |
| Min OS | iOS 16.4 (SDK 57), Android 8.0 / API 26 (`minSdkVersion` via `expo-build-properties`, MOB-07); target/compile SDK 36 |

## 3. CI/CD (GitHub Actions, Linux runners only)

| Workflow | Trigger | Steps | Budget |
|---|---|---|---|
| `ci.yml` | PR | install (pnpm cache) → lint (+a11y) → typecheck → Jest → contract test → bundle secret scan → `pnpm audit --audit-level high` → gitleaks; `supabase start` + `supabase test db` **only if `supabase/**` changed** | ~4–7 min |
| `deploy-staging.yml` | push to `main` | `supabase db push` (staging) → deploy functions → wrangler deploy (staging Workers) → Pages auto-deploys preview → `eas update --channel preview` (if app changed) | ~5 min |
| `release.yml` | tag `v*` (manual approval environment) | backup snapshot → `supabase db push` (prod) → functions → Workers → `eas build --profile production --platform all --non-interactive` → `eas submit` | ~6 min of Actions (builds run on EAS) |
| `backup.yml` | cron 03:00 UTC + `workflow_call` | `supabase db dump` (schema + data) → `age` encrypt → R2 `onlyswap-backups` | ~2 min/day |
| `keepalive.yml` | cron daily (pre-launch, staging) | `select 1` via REST | <1 min |
| `usage-report.yml` | cron weekly | `scripts/usage-report.ts` → email | ~1 min |

The expected total is about 900 of 2,000 free minutes a month.

**Dependabot:** weekly for npm and GitHub Actions. Expo packages are grouped and updated only through `npx expo install --fix`.

## 4. Builds, signing, OTA

| Item | How ($0) |
|---|---|
| Dev clients | `eas build --profile development` (counts against 15+15/mo) or `npx expo run:ios` / `run:android` locally (free, unlimited) |
| Production builds | EAS Build Free (low-priority queue); fallback `eas build --local` on your Mac |
| iOS signing | EAS-managed distribution certificate and provisioning profiles; capabilities: Push, Time Sensitive Notifications (MOB-02), Associated Domains, Declared Age Range |
| Android signing | EAS-generated upload keystore; **download a backup** (`eas credentials` → Android → Download keystore), store it in the password manager (OPS-02); Play App Signing holds the app signing key |
| Push credentials | APNs key via `eas credentials`; FCM v1 JSON uploaded to EAS |
| OTA | `eas update --channel production` for **JS-only fixes** (Apple 2.5.2); background download, applied on next cold start (MOB-09); EAS Update free = 1,000 MAU (ARCHITECTURE §6) |
| Deep-link hosts | `onlyswap.pages.dev` **always** plus the custom domain if Q2 = yes; decided before the first store build (OPS-03) |

## 5. Store submission

**Apple (App Store Connect):**
- App record: bundle `app.onlyswap`, SKU `onlyswap-ios`.
- Primary category Shopping.
- **Availability: United States.** EU DSA: "not a trader".
- Pricing: Free.
- **Privacy label (R1.0):**
  - Contact Info → Email Address, Name
  - Identifiers → User ID
  - User Content → Photos, Emails or Text Messages, Other User Content
  - Search History
  - Purchases → Purchase History (sold records)
  - Usage Data → Product Interaction
  - Diagnostics → Crash Data, Performance Data
  - All of these are linked to the user, none used for tracking. No location in R1.0.
  - **R1.1 features (ship with R1.0, DEC 76) add no new types:** chat photos are User Content → Photos; Quad posts, replies, polls, votes, hides and mutes are Other User Content; invite credit is User ID; data export requests and announcements read data already listed. Price hints are campus aggregates (n ≥ 5), not collected per person. Still no location (Quad check-in places are typed text), no contacts, no advertising data.
- **Age rating questionnaire** (answered once for the single launch with R1.1, DEC 76; LEG-03):
  - UGC yes, messaging and chat yes, social media / public posting **yes** (the Quad is a campus-wide board)
  - age assurance yes
  - infrequent mild references (user posts; filtered and moderated)
  - unrestricted web access no, gambling and contests no
  - **override to 18+**
  - Wording and the Apple 1.2 UGC checklist: `docs/store/listing.md`.
- Export compliance: `usesNonExemptEncryption: false`.
- Privacy manifest: `ios.privacyManifests` (UserDefaults CA92.1, File timestamp C617.1) plus SDK manifests.
- **App Review notes** (full text in `docs/store/listing.md`):
  - demo accounts `appreview@review.onlyswap.test` (+ password)
  - steps to complete a swap on Demo University
  - where to find Around campus (Discover switch), the Quad (tab, rules first) and photos in chat (only if `chat_photos_enabled` is on)
  - safety features: report, block, Quad hide and mute, filters, 24 h human review
  - 18+ age check
  - physical goods, cash in person, 3.1.3(e)
  - **No hidden features (2.3.1):** before submitting, Demo University must have the Quad on (`scripts/seed-review.ts` sets `campuses.quad_enabled`; the owner turns on the global `app_config.quad_enabled` in admin Config, real campuses stay off) and the seeded Quad and Around campus posts.
- Screenshots: 6.9" 1320×2868 ×5 (fictional school). Optional preview video 886×1920.
- Release: manual release, **phased release 7 days**.

**Google Play Console:**
- Personal account, verified; closed test **12+ testers × 14 consecutive days** (starts at P11-BETA-01), then apply for production (~7 days).
- **App content:**
  - Privacy policy URL; Ads: No
  - App access (reviewer credentials, no OTP)
  - Target audience 18+ only
  - Content rating (IARC): users interact yes (chat and the Quad), shares location **no**, digital purchases no, unmoderated UGC no
  - User-generated content (UGC policy): terms accepted before posting (sign-up rules, Quad rules), in-app report on every content type, block (and Quad hide), filters before posting, human review within 24 h, minor-safety reports first
  - Data safety (mirror the Apple label, all "collected, not shared", encrypted in transit, deletion yes + URL `/delete`). R1.1 rows: Photos and videos → Photos (listings, profile, chat photos, Quad photos; app functionality); Messages → Other in-app messages (chat); App activity → Other user-generated content (Quad posts, replies, polls, Wanted and food posts; app functionality) and App interactions (votes, hides, mutes); Personal info → User IDs (invite credit). Location: none (approximate and precise). Contacts: none.
  - Financial features: none; Health: none; Government: no; News: no; Advertising ID: not used
  - Child safety standards URL `/child-safety` + contact
- Store listing: title "OnlySwap: Campus Marketplace" (≤30 characters), short and full description, icon 512, feature graphic 1024×500, 5 phone screenshots ≥1080 px. Countries: United States.
- Release: staged rollout 20% → 50% → 100%.

**Rejection playbook:** see REVIEW.md §10 plus:
- Reply within 24 h.
- For metadata-only fixes (labels, notes), use no new build.
- For 1.2 issues (R1.1 Quad), flip `quad_enabled=false` and resubmit.

## 6. Legal text (must exist before P16), LEG-01

Legal pages are drafted by the owner. A lawyer review is optional and not free (Q7). They're published at `/terms`, `/privacy`, `/rules`, `/banned-items`, `/safety`, `/cookies`, `/child-safety` and bundled in the app; a CI diff checks that both copies match.

**Terms must include:**
- eligibility (18+, current student at a supported school; one account per person)
- marketplace role (we introduce, we don't sell, inspect or handle money)
- prohibited items (link to banned list)
- user content license (to display in the app)
- takedown / DMCA-style process and contact
- reporting and enforcement, strikes, suspensions, bans, appeals
- meetups (public spots, no guarantee of safety, police-designated wording)
- account termination and deletion
- disclaimers and limitation of liability
- indemnity
- governing law (Ohio) and venue
- changes to terms (re-accept gate)
- contact

**Privacy must include:**
- what's collected (the table from DATA_MODEL §5 and SECURITY §6)
- purposes
- processors (Supabase, Cloudflare, Expo/Apple/Google push, Sentry, PostHog, the email provider)
- no sale, no tracking, no ads
- retention periods exactly as in DATA_MODEL §5
- Quad disclosure (R1.1)
- meetup share link disclosure
- age (18+, DOB not stored)
- user rights (access through Download your data, deletion in the app and on the web)
- security measures
- contact
- effective date and version

## 7. Operations

**Monitoring and alerts** (all free):

| Signal | Tool | Alert |
|---|---|---|
| Crashes, JS errors, function errors | Sentry | new issue, regression, crash-free < 99% (email) |
| Uptime: `health` function, media Worker, site `/`, `/privacy`, `/delete`, admin | UptimeRobot (5 min) | email |
| Free-tier usage | `usage-report.yml` weekly | thresholds in ARCHITECTURE §6 |
| Priority-1 reports | DB trigger → email | immediate |
| R2 billing | Cloudflare notification at $1 | email |

**Backups:**
- Nightly encrypted dump, kept 30 days.
- **Restore drill monthly** (`docs/runbooks/restore.md`: restore into local Docker, verify row counts).
- R2 objects aren't backed up; this is accepted.

**Rollback:**

| Failure | Action |
|---|---|
| JS regression | `eas update:republish` the previous group to `production` |
| Native crash | pause iOS phased release; halt Play staged rollout; ship a fix build (expedited review) |
| Bad migration | forward-fix migration; table-level restore from the backup into a temp schema, copy rows |
| Abuse wave | admin flags (tighten limits, pause campus, R1.1 quad off) |
| Backend outage | `maintenance=true` → X12 screen |

**Incident runbook** (`docs/runbooks/incident.md`):
1. Detect.
2. Classify: SEV1 = data exposure, auth broken, or a safety threat; SEV2 = a core flow broken; SEV3 = minor.
3. Contain: flags, maintenance, key rotation, `revoke-sessions`.
4. Fix and deploy.
5. For a data exposure, notify affected users within 72 h.
6. Write a postmortem in `docs/incidents/`.

**CSAM process:** SECURITY.md §7.

**Maintenance routine:**
- **Daily:**
  - reports queue (24 h SLA)
  - held listings
  - Sentry new issues
- **Weekly:**
  - appeals
  - usage report
  - PostHog funnel
  - support inbox
  - Dependabot PRs
- **Monthly:**
  - restore drill
  - rotate the Gmail app password (Plan A)
  - re-check free-tier pricing pages
  - `npx expo install --check`
  - Play pre-launch report
- **Each semester:**
  - re-verify meetup spots
  - review banned words
- **Yearly:**
  - Apple renewal ($99)
  - domain renewal (Plan B)
  - Expo SDK major upgrade
  - Android target-API deadline (August)
  - legal text review

## 8. Release checklists

**R1.0 go/no-go (all must be ✓):**
- TESTING.md §7 store-readiness list
- all E2E green on iOS + Android release builds
- security tests green
- legal pages published
- reviewer accounts + demo autoplay working in prod
- `test-inbox` absent in prod
- backups verified
- monitors green
- Q2 and Q4 decided
- 30+ founding listings
- meetup spots labelled correctly

**R1.1 go/no-go** (ships with R1.0, DEC 76; the per-campus Quad switch is a later, separate step):
- legal version `2026-11` published (Privacy: Quad, chat photos, Around campus, invites, export, price hints, announcements; Terms §8 and Community Rules: Quad and chat photos; Child safety: photos and posts) and the app bundle matches (`node scripts/sync-legal.mjs --check`)
- `app_config.rules_version` bumped with `rules_changes` lines, so existing accounts accept the updated rules
- Apple age questionnaire answered with social media yes, 18+ (§5)
- Play Data safety and UGC answers as in §5 (no new data types)
- Demo University: `scripts/seed-review.ts` run on prod, global `quad_enabled` on, every R1.1 feature visible to reviewers
- chat photos: on only with CSAM scanning or a logged risk acceptance (R11-PHOTO-GATE), else off and left out of the review notes
- Quad tests green
- per campus, later: `campuses.quad_enabled` on only at ≥300 active users, with a moderator besides the owner recommended
