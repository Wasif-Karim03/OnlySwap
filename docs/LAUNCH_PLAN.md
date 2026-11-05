# LAUNCH_PLAN.md: OnlySwap iOS launch at Ohio Wesleyan (2026-11-04)

Status was re-checked on 2026-11-04 against `docs/LAUNCH_READINESS.md` (Oct 17; "LR n" below = its item n) and the QA report `sim-shots/qa/REPORT.md`.
Owner steps only, in order: `docs/launch/OWNER_CHECKLIST.md`. Drafts for review: `docs/launch/OWU_SPOTS.md` (phase 5), `docs/launch/LEGAL_SELF_REVIEW.md` (phase 8).
Each phase ends with a gate. The next phase starts only when the gate is green, and no step is ticked without proof.

## Owner decisions (2026-11-04; recorded in DECISIONS_LOG in phase 0)
- Pause `intention` to free a Supabase slot for `onlyswap-prod` ($0).
- No custom domain for R1.0 (DEC 164). Public URLs use onlyswap.pages.dev. Chat photos stay **off** at launch.
- Legal: a recorded self-review against RELEASE §6 (no lawyer).
- Merge the PR stack one PR at a time, in order. Phones only (already `supportsTablet: false`).
- Launch: iOS first, at Ohio Wesleyan (`owu.edu`). The web app moves to prod with iOS. Android follows.

## Where we are
- Features: R1.0 is complete on staging. The QA HIGH bugs are fixed on PR #55 (not merged; 2 commits unpushed).
- main is behind: stacked drafts #37-#49 are unmerged. `mobile` CI is red on #37-#46, and the `checks` job is red on #55.
- No prod backend, no prod build. GitHub secrets and variables are empty, so Backup, Keepalive and Usage report fail every day.
- Done since Oct 17: #36 merged, `ascAppId` set, iPad off, prod helper scripts on main, deletion manifest (0246), cache purge, upload GC.

## Phase 0: Decisions and housekeeping (Claude, same day)
1. Add DECISIONS_LOG rows for the 6 decisions above. Update LAUNCH_READINESS §5 to point here.
2. Push `fix/qa-high-bugs` (7c6d308, 09cfef4) and refresh the PR #55 body.
3. Remove the chat-photos bullet from `docs/store/listing.md` (chat photos off).
Gate: docs committed, PR #55 up to date.

## Phase 1: Get main green and merged (Claude fixes, owner merges)
1. Find why `mobile` fails on #37-#46 and `checks` fails on #55. Fix each on its own branch.
2. Retarget and merge in order: #37 ... #49, then #55. Re-run CI after each merge. Triage Dependabot #31-#34 and #51 last.
Gate: main has every PR, and CI on main is green (lint, typecheck, test, db, checks).

## Phase 2: Fix the remaining bugs (Claude, on main, one branch per batch)
QA MED/LOW still open (36 items; full list in `sim-shots/qa/TRIAGE-MEDLOW.md`):
- B1 copy and strings (no sim needed): M3, M4, M14, M17, L1, L3, L6, L8, L9, L16.
- B2 listing screen: M6, M7, M16.
- B3 large text and layout: M1, M2, M10, M18, L7, L12, L13, L15, and the email-dock pattern elsewhere.
- B4 theme and tokens: M15, L14, M9.
- B5 the rest: M5, M8, M12, M13, L2, L4, L5, L10, L11, L18, L20.
Code items from LAUNCH_READINESS: LR 42 (stale Discover on web), LR 45 (close direct SELECT on listings via rate-limited RPCs, with pgTAP), LR 50 (teen significant-change holdback: out of R1.0 per DEC 161; the Quad stays off for every campus until it lands). LR 42 and LR 45 are done in code (2026-11-04).
Each batch: tests first, then the fix, all gates, a sim recheck (SE at ax-large, Pro Max in dark mode, keyboard states), then a PR.
Gate: every QA item is fixed or deliberately deferred with a reason. A full SE and Max sim pass shows no HIGH or MED items.

## Phase 3: Production backend (owner: accounts; Claude: config and deploys)
Owner: pause `intention` -> create `onlyswap-prod` (US East, free). Create the prod Gmail sender + app password and a Turnstile widget. Create the Sentry and PostHog prod projects.
Claude:
1. Add `[remotes.prod]` to `supabase/config.toml`, then run `scripts/deploy/prod-supabase.command` (LR 3).
2. Push migrations 0001-0257 from `supabase/migrations/` only; set app.env to prod; run `pnpm db:types` (LR 4).
3. Set Vault and Edge secrets (owner pastes values) and deploy every function except `test-inbox` (LR 5, 8, 9).
4. Push the Auth settings and read every one back (LR 11). Set `mfa_required = true` and the admin row (LR 32).
5. R2 prod buckets, CORS, exports lifecycle, and the media Worker on prod (LR 7, 10).
6. GitHub secrets and variables so Backup, Keepalive and Usage report go green, then a restore drill (LR 24, 29).
Gate: prod `health` is OK, migrations match, every function is listed, the 3 scheduled jobs are green once, and the restore drill is done.

## Phase 4: Site, admin and web on prod (domain and CSAM scanning come after launch, DEC 164)
Owner: nothing for R1.0. Later, before any campus beyond OWU: buy the domain and sign up for the CSAM Scanning Tool.
Claude: point media, site, admin and web at the domain; set CF_ZONE_ID and the purge token; deploy `apps/site` (APPLE_TEAM_ID set for Universal Links), `apps/admin` and the web app against prod (LR 27, 30, 31, 41).
Gate: web deletion, support, the waitlist, and share and invite links work end to end on prod. Scanning is enabled on the media host. A deleted photo URL returns 404.

## Phase 5: Ohio Wesleyan campus data
1. Claude researches OWU buildings and public meetup spots online (official OWU maps and pages first) and lists name, building, lat/lng and source for each. "Police-designated" only if OWU Public Safety says so officially, otherwise "Meetup spot".
2. The owner reviews the list (walks it, or confirms with campus).
3. Claude inserts the campus row (`owu.edu`, status live) and the spots on prod (LR 14).
Gate: an `@owu.edu` sign-up on prod finds the school, and Plan meetup lists the approved spots.

## Phase 6: iOS production build
Owner: confirm the Apple agreements and create the APNs key (`eas credentials -p ios`). Install the EAS CLI (`npm i -g eas-cli`).
Claude: set the EAS production env (LR 13) and SENTRY_DSN; compile the full app with `app-transaction` and get `verify:prebuild` to 33/33 (LR 17); seed the Demo University review account on prod and check the demo bot (LR 20, 21); leave `quad_enabled` off for every campus, Demo University included (DEC 161, LR 28 waits on LR 50).
Owner: `eas build --profile production -p ios`, then `eas submit` to TestFlight (LR 22).
Gate: the build is on TestFlight and installs on the owner's iPhone.

## Phase 7: Full testing on prod and TestFlight
- Prod smoke: a real `@owu.edu` sign-up, a listing with a photo, the photo through the prod Worker (LR 15).
- TestFlight: age check, a review-account sign-in, and one full swap from offer to rating (LR 23).
- Age assurance on a real iOS 26.4 device in Sandbox (LR 33). Account deletion with Quad photos, verified gone (LR 25).
- App Store Server Notifications TEST event logged (LR 26). UptimeRobot and Sentry alerts are live (LR 37).
- Every TESTING.md E2E flow on the simulator against a prod-like build, plus a two-phone swap with a second tester.
Gate: every test above passes with evidence in RELEASE §5. No open HIGH or MED bugs.

## Phase 8: App Store submission
- Legal self-review: Claude checks terms, privacy (teen section), rules and child safety against RELEASE §6 and drafts any gaps. The owner signs off in DECISIONS_LOG (LR 34).
- App Privacy label (with age range) and age rating questionnaire, no override (LR 35).
- Metadata from `docs/store/listing.md`; 6.9-inch screenshots from `scripts/export-store-assets.ts`; review notes with the review account (LR 36).
- Submit for review. Fix any rejection on the same branch and resubmit.
Gate: approved, then the owner releases.

## Phase 9: After launch
Watch the email limits daily for 2 weeks (LR 47). Remove keepalive once traffic keeps prod awake (LR 49). Turn on Quad per campus at 300+ users (LR 48). Then Android.

## Deferred on purpose (not launch blockers; revisit after launch)
LR 38 Auth CAPTCHA on native, LR 39 separate staging Gmail, LR 44 legacy age_blocks rows (owner decision), and Dependabot bumps that are not security fixes.

## Costs
Domain about $10.46 a year (approved). Everything else stays on free tiers. Apple $99 a year is already paid.
