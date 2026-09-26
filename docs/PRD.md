# PRD.md — Product requirements (LOCKED)

## 1. Product

OnlySwap is a marketplace only for verified students at one school. You:
1. Swipe through what people on campus are selling.
2. Make an offer.
3. Chat once the seller accepts.
4. Meet at a public campus spot and pay in person.

**Problem:**
- Campus buying and selling happens in chaotic group chats and Facebook Marketplace.
- Those channels are full of strangers, scams and dead listings.
- Students want quick, local and trustworthy swaps, especially at move-in and move-out.

**Why now:** every student has a .edu inbox, which is a free identity check. A single-campus network makes cold start manageable.

**Non-goals:**
- in-app payments or shipping
- services, housing, tickets
- users under 18
- people who aren't students
- nationwide marketplaces

## 2. Users and roles

| Role | Who | Can |
|---|---|---|
| Student (buyer/seller) | 18+, verified school email, campus `live` | everything in the app |
| Waitlisted student | school not live yet | join the waitlist (R1.0: request only; R1.1: waitlist screen + invites) |
| Reviewer | Apple/Google reviewers | password login to Demo University |
| Moderator | trusted helper (R1.1 invite UI) | reports, appeals, removals, suspensions ≤ 7 d |
| Owner | Wasif | everything admin, including bans, config and (R1.1) Quad reveal |

## 3. Features (IDs are used in the traceability matrix, §7)

| ID | Feature | User problem | Release |
|---|---|---|---|
| F01 | School-email sign-up/login | prove you're a student without passwords | 1.0 |
| F02 | 18+ age check | legal/store requirement; safety | 1.0 |
| F03 | Profile setup and edit | show who you are (first name, initial, year) | 1.0 |
| F04 | Community rules + re-accept | set expectations; Google requires terms before posting | 1.0 |
| F05 | Notifications (push, in-app list, prefs) | don't miss offers, messages, meetups | 1.0 |
| F06 | Unknown-school waitlist request | "my school isn't here" shouldn't dead-end | 1.0 |
| F07 | Reviewer access + demo campus | store review | 1.0 |
| F08 | Discover swipe deck | browse fast, one item at a time | 1.0 |
| F09 | Listing detail, options, report listing | decide, and flag bad listings | 1.0 |
| F10 | Search, filters, saved searches + alerts | find a specific thing; get told when it appears | 1.0 |
| F11 | Seller profiles and ratings | trust before meeting | 1.0 |
| F12 | Sell (photos, details, spots, give-away, share) | list in about a minute | 1.0 |
| F13 | Offers and counters (incl. free "Ask for it") | negotiate without awkward DMs | 1.0 |
| F14 | Inbox | one place for offers and chats | 1.0 |
| F15 | Chat (text, scam hint) | coordinate once accepted | 1.0 |
| F16 | Meetups (spot, time, I'm here, late, reschedule, share with a friend, no-show) | meet safely and reliably | 1.0 |
| F17 | Deal completion (did it sell, mark sold, relist) | close the loop; free the listing | 1.0 |
| F18 | My listings, stats, edit, delete | manage what you sell | 1.0 |
| F19 | Report, block, appeal, enforcement states | stay safe; fair process | 1.0 |
| F20 | Safety center, banned items, help (incl. email-access recovery) | know the rules; get help | 1.0 |
| F21 | Settings (notifications, privacy, appearance, change school, sign out everywhere, about) | control | 1.0 |
| F22 | Account deletion (app + web) | store requirement; trust | 1.0 |
| F23 | Re-verify and system states (session expired, update, maintenance, offline, deep-link errors) | robustness | 1.0 |
| F24 | Admin panel (reports, users, listings, chats-on-report, appeals, campus setup, config, audit) | run the service | 1.0 |
| F25 | Public site (landing, legal, help, child safety, delete, `/l`, `/m`, 404, deep-link files) | discovery, compliance, sharing | 1.0 |
| F26 | Analytics and monitoring | know if it works | 1.0 |
| F27 | Backups and operations | don't lose data | 1.0 |
| F28 | The Quad (anonymous-to-peers board) | campus conversation, daily opens | 1.1 |
| F29 | Chat photos | show condition in chat | 1.1 |
| F30 | In-app map of spots | orientation | 1.1 |
| F31 | Campus waitlist, unlock, invite links | multi-campus growth | 1.1 |
| F32 | Around campus (free food, Wanted, campus feed) | community and liquidity | 1.1 |
| F33 | Price hint | pricing help | 1.1 |
| F34 | Download your data (self-serve) | privacy convenience (R1.0 via support email) | 1.1 |
| F35 | Admin metrics, team, announcements, banned-words UI, Quad queue | scale operations | 1.1 |
| F36 | Student web app | desktop use | 2 |
| F37 | Widgets and Live Activity | glanceable meetups | 2 |
| F38 | iPad | larger screens | 2 |
| F39 | Spanish | language access | 2 |
| F40 | Alternate app icons | delight | 2 |
| F41 | Quad check-ins | presence | 2 |

## 4. Core flows (R1.0)

1. **Onboarding:**
   - A01 → A02 → A03 → A04 → A05 → A06 → A07 → A08 → Discover.
   - Unknown school: A03 → waitlist request → exit.
   - Minor: A05 → Not eligible → account deleted.
   - Returning: A03 (login) → A04 → gate.
   - Rules changed: gate → A07 "Updated rules".
2. **Buy:**
   1. B01 swipe right or $.
   2. B05 offer.
   3. Seller accepts (E02) → chat E03.
   4. E05 plan meetup → E06 meetup day.
   5. E07 "Did it sell?" → F07 mark sold → E08 ratings.
3. **Negotiate:** offer → counter ↔ counter (≤ 4 rounds) → accept, or decline/withdraw/expire (48 h).
4. **Sell:** D01 photos → D02 details → D03 spots → D04 posted + share.
5. **Free item:** listed as give-away → requests arrive as $0 "Ask for it" offers → the seller accepts one.
6. **Safety:** report (listing, user, chat, message) → confirmation → admin action → report update. Block from chat or profile. Appeal from an enforcement screen.
7. **Recovery:**
   - Lost access to the school inbox → Help → "I can't get into my school email" → the owner verifies identity → `admin_change_email`.
   - Session revoked → X02.
   - Re-verify yearly → X03.
8. **Delete:** F16 or the web `/delete` → gone. Other people's chats keep a snapshot and show "Deleted user".

**Launch model (DEC-11):** the launch campus is `live` from the start of the beta. Students outside the beta can't install yet. Other schools can only request to be notified in R1.0.

## 5. Success metrics

**North star:** completed swaps per campus per week. A completed swap means a listing is `sold` with a buyer, and the buyer's outcome is `done`.

### 5.1 Definitions (used by `admin_metrics_*` views and TESTING T-DATA-02)

| Metric | Definition |
|---|---|
| Activation | new verified user who swipes ≥ 10 cards within 24 h **and** makes an offer or posts a listing within 7 d |
| Liquidity: supply | active listings ÷ weekly active buyers |
| Liquidity: speed | median hours from listing created to first offer |
| Sell-through | % of listings created in week W that are sold within 14 d |
| Feed exhaustion | % of feed sessions ending with fewer than 5 new cards (`daily_counters`) |
| Retention | D1 / D7 / D30 active by signup week (`activity_days`) |
| Deal reliability | % confirmed meetups completed; no-show rate |
| Safety | reports per 100 completed swaps; p90 hours to resolve a report |
| Quality | crash-free sessions (Sentry) |

### 5.2 Initial targets (first semester, launch campus, hypotheses to revisit)

| Metric | Target |
|---|---|
| Completed swaps/week | ≥ 50 by week 8 |
| Activation | ≥ 40% |
| D7 retention | ≥ 25% |
| Median time to first offer | < 6 h |
| Sell-through at 14 d | ≥ 30% |
| No-show rate | < 10% |
| Reports per 100 swaps | < 5 |
| p90 moderation time | < 24 h |
| Crash-free sessions | ≥ 99.5% |

### 5.3 Per-feature leading metric

| Feature | Metric |
|---|---|
| F01/F02 | signup completion % (started → onboarding_completed) |
| F08 | cards swiped per session; right-swipe → offer sent % |
| F10 | saved-search alert → listing view % |
| F12 | create started → posted % ; median time to post |
| F13 | offers accepted %; median counter rounds |
| F15/F16 | accepted → meetup confirmed %; confirmed → completed % |
| F19 | report → resolution p90 |
| F22 | deletions per 1k MAU (health signal) |

### 5.4 PostHog behavior events (exactly 18, no content or PII)

1. `app_opened`
2. `signup_started`
3. `email_verified`
4. `onboarding_completed`
5. `card_swiped` {dir}
6. `listing_viewed` {source}
7. `offer_sheet_opened`
8. `offer_sent` {pct_of_ask_bucket}
9. `search_performed` {results_bucket}
10. `search_saved`
11. `listing_create_started`
12. `listing_posted` {photos_count}
13. `chat_opened`
14. `meetup_planned` {spot_type}
15. `deal_confirmed` {outcome}
16. `rating_submitted`
17. `report_submitted` {target_type}
18. `share_tapped` {surface}

## 6. Scope and release plan

| Release | Contents | Estimate |
|---|---|---|
| **R1.0** | F01–F27 | 197 tasks ≈ 840 h human-paced (≈ 1,050 h with 25% buffer). With Claude Code writing most code, your time is mainly review, device testing, accounts and store work. Planning assumption: 55–70% of that, ~580–740 h, **≈ 7–9 months at 20 h/week** or 3.5–4.5 months at 40 h/week. |
| **R1.1** | F28–F35 (Quad, chat photos, map, waitlist/unlock/invites, Around campus, price hint, data export UI, admin extras) | ≈ 6–8 weeks after the R1.0 submission |
| **R2** | F36–F41 | after R1.1, prioritized by metrics |

**Floor of R1.0:** these can't be cut, because the stores require them or the loop breaks without them:
- F01, F02, F04, F07, F08, F12, F13, F15, F16, F17, F19, F22, F24 (minimal), F25 (legal + delete)

**Cuttable only if you're desperate:**
- F10 saved-search alerts (search stays)
- F11 ratings (profiles stay)
- F18 stats
- F21 appearance

## 7. Traceability matrix (every feature → screens → data → API → tasks → tests)

Screens use DESIGN_SYSTEM §10 IDs. Data uses DATA_MODEL tables. API uses API.md names. Tasks use TASKS.md IDs. Tests use TESTING.md IDs.

| F | Screens | Data | API | Tasks | Tests |
|---|---|---|---|---|---|
| F01 | A01–A04, X02 | profiles, campus_domains, review_accounts | `lookup_school`, auth hooks, `on_auth_user_created` | P3-AUTH-01, P3-AUTH-02, P3-AUTH-03, P4-AUTH-01, P4-AUTH-02, P4-AUTH-03, P4-AUTH-04, P4-AUTH-05, P4-AUTH-06 | T-INT-AUTH-01, T-INT-AUTH-02, T-INT-AUTH-03, T-SEC-06, T-SEC-07, E2E-01 |
| F02 | A05 | age_blocks, profiles.adult_confirmed_at | `confirm_age`, `delete-account` (underage) | P1-SPIKE-03, P4-DEL-01, P4-AUTH-07 | T-INT-AUTH-04, T-UNIT-AUTH-04, E2E-02 |
| F03 | A06, F02 | profiles | `update_profile`, `upload-url` | P4-AUTH-08, P11-SET-01 | T-UNIT-AUTH-01 |
| F04 | A07 | profiles.rules_*, app_config.rules_version | `accept_rules`, `require_active` | P4-AUTH-09, P4-AUTH-17 | T-UNIT-AUTH-06, E2E-22 |
| F05 | A08, F09, F11, X13 | notifications, notification_prefs, push_tokens, push_tickets | `register_push_token`, `get_notifications`, `update_notification_prefs`, `send-push`, `push-receipts` | P4-AUTH-10, P9-PUSH-01, P9-PUSH-02, P9-PUSH-03, P9-PUSH-04, P9-NOTIF-01, P9-NOTIF-02, P9-FIX-01 | T-FN-01, T-FN-02, T-FN-07, T-INT-NOTIF-DEDUPE, T-UNIT-NOTIF-01, E2E-14 |
| F06 | A03 (A5 state) | waitlist_requests | `waitlist-request` | P4-AUTH-11 | T-FN-06, E2E-03 |
| F07 | A03 (A4 state) | review_accounts, campuses.is_demo | `signInWithPassword`, `demo_autoplay` | P4-AUTH-15, P4-AUTH-16 | E2E-04 |
| F08 | B01 | listings, swipes, saves | `get_feed`, `record_swipes`, `undo_swipe`, `save_listing` | P6-FEED-01, P6-FEED-02, P6-FEED-03 | T-UNIT-FEED-01, T-UNIT-FEED-02, T-UNIT-FEED-03, T-INT-FEED-01, E2E-05, Perf-02 |
| F09 | B02, B03, B04 | listings, listing_photos, watches, reports | `record_view`, `watch_listing`, `hide_listing`, `create_report` | P6-LIST-01, P6-LIST-02, P6-LIST-03 | T-INT-SAFE-01, E2E-13 |
| F10 | B06, B07, B08, B09 | saved_searches, saves | `search_listings`, `search_suggest`, saved-search RPCs | P6-SRCH-01, P6-SRCH-02, P6-SRCH-03, P6-SRCH-04, P6-SAVE-01 | T-INT-SRCH-01, E2E-11 |
| F11 | B10, E08 | ratings, profile_stats | `submit_rating`, `ratings_visible` | P6-USER-01, P8-DEAL-01, P8-DEAL-02 | T-INT-DEAL-01 |
| F12 | D01–D04, X08 | listings, listing_photos, listing_reservations, R2 | `reserve_listing_id`, `create_listing`, `upload-url`, media Worker | P5-MEDIA-01, P5-MEDIA-02, P5-MEDIA-03, P5-SELL-01, P5-SELL-02, P5-SELL-03, P5-SELL-04, P5-SELL-05, P5-SELL-07 | T-UNIT-MEDIA-01, T-UNIT-MEDIA-03, T-UNIT-MEDIA-06, T-INT-LIST-01, T-INT-LIST-04, T-SEC-08, T-SEC-18, E2E-10 |
| F13 | B05, E02 | offers | offer RPCs | P7-OFF-01, P7-OFF-02, P7-OFF-04, P7-OFF-06, P7-OFF-07 | T-INT-OFF-01, T-INT-OFF-02, T-INT-OFF-RACE, T-INT-OFF-RACE-02, T-UNIT-OFF-01, E2E-05, E2E-07 |
| F14 | E01 | offers, chats | `get_inbox`, realtime `user:` | P7-OFF-03 | T-SEC-16, E2E-06 |
| F15 | E03, E04 | chats, messages | `get_messages`, `send_message`, `mark_chat_read`, `set_chat_mute`, `hide_chat` | P8-CHAT-01, P8-CHAT-02, P8-CHAT-03, P8-CHAT-05, P8-CHAT-06 | T-INT-CHAT-01, T-INT-RT-01, T-UNIT-CHAT-01, T-UNIT-CHAT-02, T-UNIT-CHAT-04, E2E-06 |
| F16 | E05, E06, W05 (`/m`) | meetups, safe_spots, noshow_reports | meetup RPCs, `get_meetup_share` | P8-MEET-01, P8-MEET-02, P8-MEET-03, P8-MEET-04, P13-WEB-06 | T-INT-MEET-01, T-INT-MEET-02, T-INT-MEET-03, T-INT-TZ-01, T-UNIT-MEET-01, E2E-08, E2E-09, E2E-W03 |
| F17 | E07, F07, F08 | listings, chats | `confirm_deal`, `mark_sold`, `relist_listing` | P8-DEAL-01, P8-DEAL-02, P8-DEAL-03, P8-DEAL-04 | T-INT-SOLD-01, T-INT-DEL-02, T-UNIT-DEAL-01, E2E-08, E2E-21 |
| F18 | F03, F04, F05, F06 | listings, listing_price_changes | `update_listing`, `delete_listing`, `listing_stats`, `listing_offers` | P7-OFF-05, P11-SET-01 | T-INT-LIST-02, T-INT-LIST-03 |
| F19 | E09, B03, F13, X04, X07 | reports, blocks, appeals, strikes | `create_report`, `block_user`, `create_appeal`, `get_my_report` | P3-SAFE-01, P11-SAFE-02, P11-SAFE-03, P11-SAFE-04 | T-INT-SAFE-01, T-INT-SAFE-02, T-INT-SAFE-03, E2E-13, E2E-19 |
| F20 | F19, F20, X10 | safe_spots, support_requests | `support-request`, `admin_change_email` | P11-SAFE-05, P4-AUTH-19 | T-INT-AUTH-07 |
| F21 | F10–F15, F18 | profiles, notification_prefs | `update_profile_flags`, `update_notification_prefs`, `signOut(global)` | P11-SET-02, P9-NOTIF-02, P4-AUTH-18 | T-INT-AUTH-05, T-DATA-01, E2E-23 |
| F22 | F16, W04 | all (cascade/set null), R2 | `delete-account` | P4-DEL-01, P5-MEDIA-04, P11-ACC-01, P13-WEB-05 | T-INT-DEL-01, T-INT-DEL-02, T-INT-DEL-03, T-FN-05, E2E-15, E2E-W04 |
| F23 | X01–X06, X11, X12 | app_config, profiles.verified_until | `complete_reverify`, `get_app_config` | P4-AUTH-14, P11-STATE-01, P11-STATE-02 | T-UNIT-AUTH-03, T-UNIT-LIB-06, E2E-17, E2E-18, E2E-20 |
| F24 | G01, G02 | admins, audit_log, all | `admin_*` (R1.0 set), `revoke-sessions` | P12-ADM-01, P12-ADM-02, P12-ADM-03, P12-ADM-04, P12-ADM-05, P12-ADM-06, P12-ADM-07, P12-ADM-08 | T-INT-ADMIN-01, T-INT-ADMIN-02, T-INT-ADMIN-04, T-INT-AUTH-06, E2E-A01, E2E-A02, E2E-A04 |
| F25 | W01–W07 | public RPCs | `public_*`, `get_listing_public_card`, Pages Functions | P13-WEB-01, P13-WEB-02, P13-WEB-03, P13-WEB-04, P13-WEB-08, P13-WEB-09, P14-LEGAL-01 | E2E-W01, E2E-W02, E2E-W05, E2E-W06, E2E-W07, E2E-W08 |
| F26 | — | daily_counters, activity_days, views | `admin_metrics_*` (views) | P1-LIB-02, P14-MON-01, P14-MON-02, P14-MON-03, P14-OPS-03 | T-DATA-01, T-DATA-02 |
| F27 | — | backups bucket | `backup.yml` | P14-BAK-01, P14-BAK-02, P14-OPS-01 | T-REL-01 |

**R1.1 and R2 rows (chain parked on purpose, REVIEW §15):**

| F | Screens | Data | API | Tasks | Tests |
|---|---|---|---|---|---|
| F28 Quad | Q01–Q14 | quad_* (0200_quad.sql) | Quad RPCs | P10-QUAD-01…07, R11-ADM-03, R11-REL-01 | T-INT-QUAD-ANON, T-INT-QUAD-01, T-INT-QUAD-02, T-UNIT-QUAD-01, T-UNIT-QUAD-02, T-SEC-04, E2E-12 |
| F29 Chat photos | E03 variant | messages.photo_path | `send_message(kind photo)`, `upload-url(chat)` | P8-CHAT-04, R11-PHOTO-GATE | T-UNIT-CHAT-03, T-SEC-09 |
| F30 Map | E05, F19 variants | safe_spots | — | P1-SPIKE-02, R11-MAP-01 | (added at R1.1 kickoff) |
| F31 Waitlist/unlock/invites | A09, A10, W05 `/i`, W06 `/joined` | campus_progress, profiles.invite_code | `my_waitlist_position`, `unlock_campus`, `get_invite` | P4-AUTH-12, P4-AUTH-13, R11-INVITE-01 | T-INT-UNLOCK-01 |
| F32 Around campus | C01–C03 | listings.kind, wanted_ref | `get_campus_feed`, `create_listing` | P5-SELL-06, P5-SELL-08, P6-CAMP-01 | (T-INT-LIST-01 cases for food/wanted) |
| F33 Price hint | D02 variant | price_hints | `price_hint` | R11-HINT-01 | (added at R1.1 kickoff) |
| F34 Data export | F17 | data_exports | `export-data` | P11-ACC-02 | T-INT-EXPORT-01 |
| F35 Admin extras | G03 | announcements, banned_words, admins | admin R1.1 RPCs | R11-ADM-01, R11-ADM-02 | T-INT-ANN-01, T-INT-ADMIN-03 |
| F36–F41 | W08, X15, N5–N7, F14 icons, Q15 | TBD at R2 | TBD | P13-WEB-07, P17-FEAT-01, P17-FEAT-02, P17-FEAT-03, R2-ICON-01, R2-QUAD-CHECKIN | TBD at R2 |

**Enabling work** (cross-cutting; supports every R1.0 feature):

| Area | Tasks | Verified by |
|---|---|---|
| Accounts and decisions | P0-ACC-01 … P0-ACC-17 | RELEASE §8 go/no-go |
| Foundations, env, CI | P1-SETUP-01 … 06, P1-ENV-01/02, P1-CI-01/02/03, P1-DB-01, P1-SPIKE-01, P1-SPIKE-04, P1-LIB-01 | CI green; T-CONTRACT-01; T-UNIT-LIB-* |
| Design system | P2-TOK-01/02/03, P2-FONT-01, P2-CMP-01 … 11, P2-MOT-01, P2-KIT-01/02 | T-UNIT-TOK-01, T-UNIT-CMP-*, T-A11Y-LINT |
| Data platform | P3-DB-01 … 04, P3-DB-06 … 12, P3-SEED-01, P3-TYPES-01, P3-TEST-01/02 | T-INT-RLS-*, T-SEC-19, integrity suite (P3-DB-12) |
| Email and scheduled jobs (serve F05, F16, F17, F19, F22, F23) | P9-MAIL-01, P9-MAIL-02, P9-CRON-01 | T-FN-03, T-FN-07, T-INT-CRON-01, T-INT-TZ-01 |
| Accessibility | P11-A11Y-01 | TESTING §4 manual a11y rows, T-A11Y-LINT |
| Quality and security | P14-SEC-01, P14-PERF-01, P14-E2E-00/01/02, P14-KEEP-01 | TESTING §3, §5, §6 |
| Beta, store, ops | P11-BETA-01, P15-BETA-01 … 05, P16-STORE-01 … 07, P17-OPS-01/02, P17-FEAT-04 | RELEASE §5, §8; TESTING §7 |

**Traceability result:**
- Every R1.0 feature (F01–F27) has screens, data, API, tasks and tests.
- Every R1.0 task maps to a feature row or an enabling-work row.
- Every referenced task and test ID exists (checked by script during the freeze).
- R1.1 and R2 chains are parked on purpose (REVIEW §15).
