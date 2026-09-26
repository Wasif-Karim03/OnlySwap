# launch.md — Launch, production, build order, self-audit

## 1. Pre-launch audit (the week before submitting)

**Product:**
- [ ] Every testing.md §7 store-readiness item is checked.
- [ ] Maestro E2E-01 to E2E-20 are green on iOS and Android release builds.
- [ ] Playwright web and admin suites are green.
- [ ] Every item in the manual QA checklist (testing.md §4) is done on at least 1 small and 1 large device per OS.
- [ ] Legal pages v2026-09 are published. The in-app bundled copies match the web versions (a script diffs them).
- [ ] Safe spots are verified with campus police (P15-BETA-05). Placeholder names are removed from production.
- [ ] 30+ real listings exist at the launch campus (founding sellers).

**Backend:**
- [ ] Production migrations applied, `supabase test db` run against a production clone (restored backup, local).
- [ ] Auth settings on production:
  - custom SMTP working
  - rate limits raised
  - hooks enabled
  - "Confirm email" on
  - JWT expiry 1 h
  - refresh token rotation on
- [ ] `app_config` on production: `maintenance=false`, `min_version_*` set to the launch version, `quad_enabled=true`, `chat_photos_enabled` set per decision.
- [ ] Reviewer accounts plus Demo University seeded on production. `demo_autoplay` is running.
- [ ] `test-inbox` and `test_set_now` are **absent** from production (CI check passed).
- [ ] Cron jobs listed in production (`select jobname, schedule from cron.job`).
- [ ] Backups: last night's file exists in R2, and the restore drill has been done at least once.
- [ ] UptimeRobot monitors are green. Sentry alerts are configured. The PostHog dashboard is live.
- [ ] Free-tier usage on staging is extrapolated to launch and fits (testing.md Perf-08 to 14).

**Security:**
- [ ] T-SEC-01 to 17 pass.
- [ ] Secrets are rotated after beta: service key, R2 keys, Gmail app password, Expo token.
- [ ] 2FA is on for GitHub, Apple ID, Google account, Cloudflare, Supabase, Expo, Sentry and PostHog.
- [ ] Admin TOTP is enrolled on 2 devices (you and a backup), and recovery is documented.

## 2. Beta

| Track | When | Who | Exit criteria |
|---|---|---|---|
| Play **internal** | from P4 onward, every milestone | you + up to 100 | smoke passes |
| Play **closed** | **start at P11-BETA-01** (the 14-day clock) | 15–20 testers via Google Group | 12+ opted in for 14 consecutive days; crash-free > 99% |
| TestFlight **internal** | from P4 | you | — |
| TestFlight **external** | P15 | 20–100 students at the launch campus (public link after Beta App Review) | 7 days crash-free > 99%; no P0/P1 bugs; 10+ completed swaps |

**Beta feedback loop:**
- Feedback comes in through TestFlight's built-in feedback and the in-app Help → "Report a problem" (emails you).
- Log issues in GitHub Issues with the labels `beta`, `p0`–`p3`.
- Triage daily.

## 3. Store submission steps

**Apple (App Store Connect):**
1. Create the app: name "OnlySwap" (or the renamed name), SKU `onlyswap-ios`, bundle `app.onlyswap`, primary language English (U.S.).
2. Pricing: Free.
3. Availability: **United States only**.
4. App Privacy: fill in the label (plan §19).
5. Privacy Policy URL: `{SITE}/privacy`.
6. Age Rating questionnaire, then override to 18+.
7. EU DSA: declare "not a trader" (not distributing in the EU).
8. Export compliance: No (only HTTPS) — already set in Info.plist.
9. Version page:
   - screenshots (6.9")
   - promotional text
   - description (no trademarks)
   - keywords (≤ 100 characters, no school names or competitor names)
   - support URL `{SITE}/help`
   - marketing URL `{SITE}`
10. App Review Information:
    - demo login `appreview@review.onlyswap.test` and its password
    - notes:
      - how to trigger a full swap on Demo University
      - Quad moderation description
      - no anonymous messaging
      - 18+ with age check
      - physical goods, cash in person, 3.1.3(e)
    - contact phone and email
11. Build: select the EAS-submitted build → Submit for Review. Release option: **manually release**, then turn on **phased release** (7 days).

**Google Play Console:**
1. App content: every declaration in tasks P16-STORE-03.
2. Main store listing:
   - title "OnlySwap: Campus Marketplace"
   - short description (80 characters)
   - full description
   - icon, feature graphic, screenshots
   - category Shopping
   - contact email and website
3. Production → Countries: United States.
4. Release: upload the AAB (`eas submit`), release notes, then **staged rollout 20%**.
5. Once production access is granted (after the closed test), go 20% → 50% (day 3) → 100% (day 7) if there are no crash spikes.

**Rejection playbook** (reply within 24 h through Resolution Center or Policy status):

| Rejection | Response |
|---|---|
| 2.1 can't log in | Re-verify the demo login on cellular; add a screen recording to the notes |
| 1.2 UGC / anonymous | Reply with the moderation description; point to report, block, filter, 24 h SLA and rules; if needed, flip `quad_enabled=false` on iOS and resubmit the metadata only |
| 5.1.1 / Data safety mismatch | Compare the SDK list against the label; fix the label (no build needed) |
| 4.1 / name | Rename (the name lives in one place, `app.config.ts` + strings); new build |
| Play age-restricted | Confirm Restrict minor access is on, target audience is 18+, and the age check is shown in the reviewer notes |

## 4. Production operations

**Rollback plan:**

| Failure | Action | Time to fix |
|---|---|---|
| JS bug in a release | `eas update --branch production --message "rollback"` republishing the previous update group (`eas update:republish`) | minutes |
| Native crash in a new binary | iOS: pause the phased release and expedite a fixed build. Android: halt the staged rollout in the Play Console. | hours to 1 day |
| Bad migration | Forward fix migration. For data loss, restore a table from the nightly backup into a temp schema and copy rows back (runbook `docs/runbooks/restore.md`). | hours |
| Abuse wave or bad content | Admin flags: `quad_enabled=false`, tighten `offers_per_hour`, or pause the campus | minutes |
| Backend outage | `maintenance=true` (app shows X12) while you fix | minutes |

**Monitoring and alerts** (all free):
- **Sentry:** new issue, regression, crash-free sessions < 99% (email). Edge Functions and Workers are instrumented.
- **UptimeRobot** (5-min checks): `health` function, media Worker, web, `/privacy`, `/delete`, admin (email alert).
- **Supabase:** daily email usage summary. Also a weekly `scripts/usage-report.ts` that emails DB size, egress and function invocations.
- **Cloudflare:** R2 billing notification at $1. Workers request usage checked weekly.
- **Priority-1 reports** (threats, self-harm, CSAE) email you instantly (`trg_reports_after_insert`).

**Backups:**
- Nightly encrypted `pg_dump` to R2, kept 30 days.
- Monthly restore drill.
- Storage objects aren't backed up; photos can be re-uploaded, which is accepted.
- The `age` private key lives in the password manager, with a printed copy.

**Incident handling** (`docs/runbooks/incident.md`):
1. Detect (alert or report).
2. Assess severity:
   - **SEV1:** data exposure, auth broken, safety threat.
   - **SEV2:** core flow broken.
   - **SEV3:** minor.
3. Contain: flags, maintenance, revoke keys.
4. Fix and deploy (OTA or build).
5. For a SEV1 data exposure, notify affected users by email within 72 h, and tell Apple and Google if required.
6. Write a blameless postmortem in `docs/incidents/YYYY-MM-DD.md`.
7. For CSAE, report to the NCMEC CyberTipline, preserve evidence per the law, and ban the account.

## 5. Maintenance routine

**Daily** (5 min):
- Admin reports queue: keep the 24 h SLA.
- Held Quad posts.
- Sentry new issues.

**Weekly:**
- Appeals.
- Banned words with high overturn rates.
- Usage report versus free-tier limits.
- PostHog funnel and liquidity warnings.
- Answer support emails.
- Dependabot PRs (free) for security fixes.

**Monthly:**
- Restore drill.
- Rotate the Gmail app password (Plan A).
- Review free-tier pricing pages for changes.
- Expo SDK patch updates (`npx expo install --check`).
- Pre-launch report in the Play Console.
- Review crash-free trend.
- Purge stale beta testers.

**Each semester:**
- Re-check safe spots with campus police.
- Refresh the re-verify cycle.
- Plan move-out / move-in promotions (opt-in "tips" only).

**Yearly:**
- Renew the Apple Developer Program ($99, already budgeted).
- Renew the domain if on Plan B.
- Renew the DMCA agent every 3 years if registered.
- Update legal text versions.
- Review the Expo SDK major upgrade and the Android target API deadline (every August).

## 6. Totals, timeline and risks

**Total task count: 198** (tasks.md).

Timeline assumes ~20 focused hours a week with Claude Code. Sizes: S = 1.5 h, M = 4 h, L = 12 h, plus 25% buffer.

| Phase | Tasks | Est. hours | Calendar |
|---|---|---|---|
| P0 Accounts | 14 | 12 | week 1 (Play verification can take days, so start day 1) |
| P1 Foundations | 15 | 45 | weeks 1–3 |
| P2 Design system | 18 | 70 | weeks 3–6 |
| P3 Data + RLS | 17 | 95 | weeks 6–10 |
| P4 Auth + onboarding | 17 | 75 | weeks 10–13 |
| P5 Sell + media | 11 | 55 | weeks 13–16 |
| P6 Discover + search | 13 | 95 | weeks 16–20 |
| P7 Offers | 6 | 35 | weeks 20–22 |
| P8 Chat + meetups | 12 | 110 | weeks 22–27 |
| P9 Notifications + email | 9 | 60 | weeks 27–30 |
| P10 Quad | 7 | 65 | weeks 30–33 |
| P11 Safety/account/settings (+ Play closed test starts) | 12 | 85 | weeks 33–37 |
| P12 Admin | 8 | 85 | weeks 37–41 |
| P13 Web | 8 | 55 | weeks 41–44 |
| P14 Hardening | 12 | 80 | weeks 44–48 |
| P15 Beta | 5 | 40 | weeks 48–50 (overlaps P14) |
| P16 Store launch | 7 | 20 | weeks 50–52 |
| P17 Post-launch | 7 | 60 | after launch |

That's about 1,140 hours to launch, or roughly **11–12 months at 20 h/week** (about 6 months at 40 h/week).

To shorten it, launch an **MVP cut** at the end of P9 plus the minimum of P11:
- report/block, delete account, and the settings required for the stores;
- admin reports queue only;
- legal pages only on the web.

Defer Quad (P10), the web app pages (part of P13) and most admin screens to v1.1. That's roughly 6–7 months at 20 h/week. The Play 14-day closed test must still start 2+ weeks before the store launch.

**Top risks to watch:**
1. **Store policy for the anonymous feed and age rules.** Mitigated by 18+, the age check, no anonymous chat and the `quad_enabled` kill switch. It's still the most likely rejection reason.
2. **Name conflict ("OnlySwap").** Rename cost grows every week. Decide at P0-ACC-13.
3. **Cold start and liquidity.** The app is only useful with listings: founding sellers, Day one flows and a 500-member unlock threshold. Watch the liquidity metrics (G12) weekly.
4. **Free-tier ceilings:** Worker 100k req/day around 1k DAU (Plan A), Gmail 500/day, Realtime 200 connections, EAS Update 1k MAU. Exits are in plan §18; the domain ($10.46/yr) removes the first two.
5. **Solo moderation load.** 24 h SLA, 7 days a week. Recruit a campus moderator (G13 roles) before public launch.
6. **Scope versus time.** 198 tasks. Use the MVP cut if month 6 arrives without the core loop.
7. **Safety incidents at meetups.** Safe zones verified with police, share-with-a-friend, no-show handling, fast report response, and clear Terms (not legal advice; get a lawyer's review before launch).

## 7. Build order (one Claude Code session per line)

Each session ends with something runnable and a passing check.

1. **S1** P1-SETUP-01..06: monorepo, Expo app, dev builds on both phones. *Runnable: blank tabs app on devices.*
2. **S2** P1-ENV-01/02, P1-CI-01, P1-LIB-01/02, P1-DB-01. *CI green, Sentry test crash visible.*
3. **S3** P1-SPIKE-01..03. *Email sent, map rendered, age signal logged.*
4. **S4** P2-TOK-01..03, P2-FONT-01, P2-MOT-01. *Theme switching across 8 skins.*
5. **S5** P2-CMP-01..06. *Kit page shows controls.*
6. **S6** P2-CMP-07..11, P2-KIT-01/02. *Full kit and states gallery.*
7. **S7** P3-DB-01..06. *Schema resets locally.*
8. **S8** P3-DB-07, P3-TEST-01/02, P3-SAFE-01. *Helper and safety pgTAP green.*
9. **S9** P3-DB-08/09, P3-TYPES-01. *RLS matrix green.*
10. **S10** P3-AUTH-01..03, P3-SEED-01. *A real .edu inbox gets a code from staging.*
11. **S11** P4-AUTH-01/02, P4-DEL-01. *Auth API unit tests green.*
12. **S12** P4-AUTH-03..06. *Sign in end-to-end on devices.*
13. **S13** P4-AUTH-07..10. *Age, profile (without avatar), rules, primer.*
14. **S14** P4-AUTH-11/12/14/15. *Waitlist and reviewer login.*
15. **S15** P5-MEDIA-01..04. *Photos upload to R2 with EXIF stripped.* (Then go back and finish the P4-AUTH-08 avatar.)
16. **S16** P5-SELL-01..03. *Draft and details with errors.*
17. **S17** P5-SELL-04..07. *Post a listing, share card, food and wanted.*
18. **S18** P6-FEED-01/02. *Deck component on fixtures at 60 fps.*
19. **S19** P6-FEED-03, P6-LIST-01/03. *Discover → listing.*
20. **S20** P6-LIST-02, P6-SRCH-01..04. *Report listing, search.*
21. **S21** P6-SAVE-01, P6-USER-01, P6-CAMP-01. *Saved, seller profile, campus feed.*
22. **S22** P7-OFF-01, P7-OFF-06. *Offer state machine green.*
23. **S23** P7-OFF-02..05. *Offer UI full loop on two devices (still no chat).*
24. **S24** P8-CHAT-01/02. *Realtime between two devices (test screen).*
25. **S25** P8-CHAT-03..05. *Real chat UI.*
26. **S26** P8-MEET-01/04. *Meetup RPCs and card.*
27. **S27** P8-MEET-02/03. *Plan and meetup day screens.*
28. **S28** P8-DEAL-01..03. *Full swap: offer → chat → meetup → sold → rating.*
29. **S29** P9-PUSH-01..03. *Pushes arrive on both OSes.*
30. **S30** P9-PUSH-04, P9-NOTIF-01/02. *Every catalog notification fires.*
31. **S31** P9-MAIL-01/02, P9-CRON-01, P4-AUTH-13, P4-AUTH-16. *Campus unlock simulation; demo autoplay.*
32. **S32** P10-QUAD-01/02. *Quad RPCs with the anonymity test.*
33. **S33** P10-QUAD-03..05. *Feed and thread.*
34. **S34** P10-QUAD-06/07. *Posting with block and hold.*
35. **S35** P11-SAFE-02..05, P11-ACC-01/02. *Report/block/appeal/delete/export.*
36. **S36** P11-SET-01/02. *Profile and settings screens.*
37. **S37** P11-STATE-01/02, P13-WEB-01 (for deep links). *Gates and deep links.*
38. **S38** P11-A11Y-01, then **P11-BETA-01: start the Play closed test.**
39. **S39** P12-ADM-01..03. *Admin login with MFA and RPCs.*
40. **S40** P12-ADM-04..06. *Overview, metrics, reports, users.*
41. **S41** P12-ADM-07/08. *Listings, Quad, chats, campus, announcements, words, team, flags, audit.*
42. **S42** P13-WEB-02..05, P13-WEB-08. *Landing, legal, help, delete, 404.*
43. **S43** P13-WEB-06/07. *OG/meet/invite pages and the web app.*
44. **S44** P14-MON-01..03, P14-BAK-01/02, P14-KEEP-01. *Monitoring and backups.*
45. **S45** P14-E2E-00..02. *All E2E green.*
46. **S46** P14-SEC-01, P14-PERF-01, P14-LEGAL-01. *Security, perf and legal done.*
47. **S47** P15-BETA-01..05. *TestFlight external and seeding.*
48. **S48** P16-STORE-01..07. *Submitted, approved, rolling out.*
49. **S49+** P17-*

## 8. Self-audit: every design feature mapped

✓ means the design feature is covered by a screen (screens.md), backend pieces (backend.md), a task (tasks.md) and tests (testing.md).

| Design feature (board) | Screen | Backend | Task | Test |
|---|---|---|---|---|
| Launch animation, motion (M) | S-A01, P2-MOT | — | P4-AUTH-03, P2-MOT-01 | Perf-01, manual reduce motion |
| Skins, logo, theme (S, L, F14) | S-F14 | profiles.theme | P2-TOK-*, P11-SET-02 | T-UNIT-TOK-01 |
| Sign up A1–A14 incl. reviewer, not found, age | S-A01..A14 | hooks, confirm_age, waitlist, unlock | P4-AUTH-* | E2E-01..04, T-INT-AUTH-* |
| Swipe/first swipe/undo/end of deck (B1–B4, X24) | S-B01 | get_feed, record_swipes | P6-FEED-* | T-UNIT-FEED-*, E2E-05 |
| Listing, owner, hold, options, report, photo viewer (B5–B10) | S-B05, B08, B09p | listings, reports, watches | P6-LIST-* | T-INT-LIST-*, E2E-13 |
| Offer + limit + sent (B11–B13) | S-B09 | make_offer | P7-OFF-02 | T-INT-OFF-* |
| Search, suggestions, results, filters, saved, saved searches (B14–B19) | S-B12..B18 | FTS, trgm, saved_searches, triggers | P6-SRCH-*, P6-SAVE-01 | T-INT-SRCH-01, E2E-11 |
| Seller profile, reviews, new seller (B20–B22) | S-B17 | public_profiles, profile_stats, ratings_visible | P6-USER-01 | RLS profiles |
| Campus feed, free food, free stuff, wanted, day one, founding (C) | S-C01, C02, C05 | listing kinds, food expiry, wanted match, founding flag | P5-SELL-06, P6-CAMP-01 | T-INT-LIST-01 |
| Quad (Q1–Q15 incl. held) | S-Q01..Q15 | quad tables/RPCs, triggers | P10-* | T-INT-QUAD-*, T-SEC-04, E2E-12 |
| Sell flow D1–D6 | S-D01..D06 | create_listing, upload-url, R2 | P5-* | T-UNIT-MEDIA-*, E2E-10 |
| Inbox, offers E1–E8 | S-E01, E03 | offers RPCs, cron | P7-* | T-INT-OFF-*, E2E-06/07 |
| Chat, photos, details, blocked (E9, E10, X17, X18) | S-E09, X17 | messages, broadcast, realtime RLS | P8-CHAT-* | T-INT-CHAT-01, T-INT-RT-01 |
| Meetup plan/day/share/no-show/changes (E11–E15, X19b, X20) | S-E11, E12, W-MEET | meetups RPCs, share page | P8-MEET-*, P13-WEB-06 | T-INT-MEET-01, E2E-08/09 |
| Did it sell, rate, reveal (E16–E18) | S-E16, E17 | confirm_deal, ratings_visible | P8-DEAL-* | T-INT-DEAL-01 |
| Report/block/sent/update (E19–E21) | S-E19 | reports, blocks | P11-SAFE-02 | T-INT-SAFE-* |
| Profile/settings F1–F19 incl. notification and privacy settings, data export, about | S-F01..F19 | prefs, export-data, delete-account | P11-SET-*, P11-ACC-*, P9-NOTIF-02 | E2E-14..16 |
| States X1–X40 | S-X table | app_config, gates | P11-STATE-*, P2-KIT-02 | E2E-17..20, manual |
| Lock screen notifications, Live Activity, widgets (X34, X35, X39, X40) | catalog / post-launch | notifications | P9-PUSH-*, P17-FEAT-01 | T-FN-02 |
| Large text, VoiceOver (X32, X33) | global a11y | — | P11-A11Y-01 | manual a11y |
| Android variants N1–N4; iPad N5–N6; Spanish N7 | global / post-launch | — | P2-CMP-09, P17-FEAT-02/03 | manual Android |
| Web W1–W16 + meet/invite/legal set | W-* | Pages Functions, public RPCs | P13-* | E2E-W01..W07 |
| Store assets T1–T11 | T | — | P16-STORE-01 | testing §7 |
| Admin G1–G15 + flags | G-* | admin RPCs, audit | P12-* | T-INT-ADMIN-*, E2E-A01..A06 |
| Handoff H1–H9 (flow, tokens, states, voice, notifications, analytics, privacy, languages, compliance) | referenced | catalog, events | P2-TOK, P9, P14-MON-02, P16 | contrast test, T-FN-03 (copy), store checks |
| Decisions board (K) | docs/decisions.md | app_config flags | P0-ACC-13 | — |

**Items added during the self-audit** (they weren't in the research plan or design):
- G2 `age_blocks` hash
- G3 review-domain allowlist in the hook
- G4 `waitlist_requests` for unknown schools
- G5 `daily_counters` / `activity_days` instead of raw events
- G6 `tips` preference
- G7 OG only after an explicit share
- G8 W-MEET and W-INVITE pages
- G9 remaining web legal pages
- G10 reveal controls
- G11 mailer fallback Worker
- G12 email drip at 400/day
- `banned_hashes`, `listing_reservations`, `common_first_names`, `can_upload`, `update_profile_flags`
- `test-inbox` + `test_set_now` + `private.now()` (staging only)
- `demo_autoplay` bot
- `/dev/kit` and `/dev/states` gallery routes
- G-FLAGS admin page
- `support_requests` + `support-request` function
- `scripts/usage-report.ts`, `scripts/export-store-assets.ts`, `scripts/fire-all-notifications.ts`, `scripts/seed-review.ts`, `scripts/seed-media.ts`
- licenses generation for About
- signed URLs for chat photos
- chat archiving cron to stay under 500 MB
- `maybeAskForReview` rules
- Android predictive back and edge-to-edge notes
