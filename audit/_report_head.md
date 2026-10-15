# OnlySwap production-readiness audit

Audited code: `feat/admin-v2` at 630885b (DEC 94 to 99 included; these are not in `main` yet). Date: 2026-10-14. Branch: `audit/production-readiness`. App code was not changed.
Load and security tests ran only against the local Supabase in Docker. No hosted service was touched.

## Verdict: Not ready for 5,000 DAU on free tiers. Ready for a small closed beta (about 200 students) once the S-effort fixes below land.

The core is solid. RLS is on every table, clients have read-only grants, 107 ID-swap (IDOR) attempts were all refused, Realtime topics are locked to their members, and there are no secrets in the bundle or git history. Idempotency holds for listings, messages and notifications, and the swipe feed held p95 8 ms at 1,000 virtual users.

Three things stop a full-campus launch:
1. **Search and the Quad feed scan whole tables.** With them in the traffic mix, the database saturated at 250 virtual users (39% errors).
2. **The 500 MB free database fills at about 250 DAU.** The main cause is the `activity_events` tracking table.
3. **Several other free tiers break before 5k DAU:** Supabase egress (~340 DAU), the image Worker's 100k requests a day (~2k DAU), Gmail's 500 emails a day (launch day), and Realtime connections at the 2x spike.

There are also three High security and safety bugs: moderators can unmask Quad authors, the 18+ check can be retried, and banned students can return with a `+alias`. On top of that, the app has no error boundary, and it doesn't clear cached data on sign-out.

## Launch blockers (Critical and High)

| # | ID | Sev | Blocker | Effort |
|---|---|---|---|---|
| 1 | [E-03](notes/E-scalability.md) | Critical | `activity_events` (about 64 rows per DAU per day, kept 90 days) fills the 500 MB DB at about 250 DAU and needs 3.4 to 9.9 GB at 5k | S |
| 2 | [E-01](notes/E-scalability.md), [E-23](notes/E-scalability.md) | Critical | `search_listings` / `search_suggest` cannot use their GIN indexes (opaque `text_matches`), 200 to 350 ms each; with search in the mix: 39% 5xx at 250 VUs, DB CPU 1302% | M |
| 3 | [A-01](notes/A-security.md) | High | Any moderator can see a Quad author through `admin_report_detail` / `admin_list_reports` / `reports`, which bypasses the owner-only, TOTP-checked, audited reveal | M |
| 4 | [A-02](notes/A-security.md) | High | The `quad.reveal` audit row stores `author_id`, and every moderator can read `audit_log` | S |
| 5 | [A-03](notes/A-security.md) | High | 18+ gate: after answering "minor", the same account calls `confirm_age` again with "adult" and passes | S |
| 6 | [E-05](notes/E-scalability.md) | High | `make_offer` deadlocks on concurrent first offers (`for share` then `update`): 479 of 480 failed with 24 buyers, 195 of 200 with 5 | S |
| 7 | [F-08](notes/F-reliability.md) | High | No error boundary in the mobile app; a render crash white-screens. May be the open "Android grey screen after posting" ([J-08](notes/J-launch-ops.md)) | S |
| 8 | [C-03](notes/C-memory.md) | High | Query cache, chat stores and swipe queue are not cleared on sign-out, so the next account on the same phone can see the previous account's data | S |
| 9 | [G-02](notes/G-abuse.md) | High | Ban evasion: `email_hash` doesn't strip `+tag`, so a banned student signs up again as `name+1@school.edu` | S |
| 10 | [E-08](notes/E-scalability.md), [G-01](notes/G-abuse.md) | High | Gmail SMTP's 500 a day vs about 2,600 launch-day OTP emails; local `max_frequency` is 1 s (mail-bomb risk) | S |
| 11 | [E-02](notes/E-scalability.md) | High | `get_quad_feed` seq-scans all posts with per-row hot score and OFFSET paging; quad-p500 p95 3.3 s | M |
| 12 | [E-07](notes/E-scalability.md) | High | The media Worker doesn't use the Cache API; Workers free tier of 100k requests a day breaks at about 2k DAU | S |
| 13 | [E-09](notes/E-scalability.md) | High | Realtime: 3 broadcasts per chat message; 250 sockets at spike vs a 200 cap; messages break about 3,470 DAU | M |
| 14 | [E-20](notes/E-scalability.md) | High | Egress: about 244 KB of JSON per session gives about 73 GB a month vs 5 GB free (about 340 DAU) | M |
| 15 | [E-04](notes/E-scalability.md) | High | Retention of swipes, notifications, messages, offers and listings is well over 500 MB at 5k DAU | M |
| 16 | [I-05](notes/I-accessibility.md) | High | `ink3` text and every placeholder fail WCAG contrast (2.5 to 2.8:1); `red` text below 4.5:1 | S |
| 17 | [J-02](notes/J-launch-ops.md) | High | `docs/runbooks/incident.md` is linked from RELEASE.md but doesn't exist | S |
| 18 | [J-06](notes/J-launch-ops.md) | High | Admin MFA is off (`mfa_required=false`); turning it back on is one manual SQL line with no check | XS |
| 19 | [J-07](notes/J-launch-ops.md) | High | The prod Supabase project doesn't exist yet; 40 owner items in `OWNER_TODO.md` are open | L |
| 20 | [J-05](notes/J-launch-ops.md) | High | Store submission is blocked on owner items 19 to 21 (chat-photo scanning decision, legal review, store questionnaires) | M |
| 21 | [J-08](notes/J-launch-ops.md) | High | New native builds are needed for both phones (fingerprint changed), and the Android grey screen is unresolved | M |

Duplicates folded in: B-09 is A-03, FR-02 is E-05, E-23 is the load symptom of E-01 and E-02.

## Scorecard
