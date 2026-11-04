# Legal self-review (LR 34, P14-LEGAL-01, LEG-01)

Date: 2026-11-04
Reviewer: Claude (recorded self-review, DEC 157). The owner signs off at the end.
Not legal advice. See the last section.

## Scope

Checked against `docs/RELEASE.md` §6 (lines 128 to 159):

- Site texts, version `2026-11`: `terms.md`, `privacy.md`, `rules.md`, `child-safety.md`, `safety.md`, `banned-items.md`, `cookies.md`.
- In-app copy: `apps/mobile/src/legal/generated.ts`, shown by `apps/mobile/src/features/legal/LegalScreen.tsx`. `node scripts/sync-legal.mjs --check` passed today ("app and site match (7 documents)"), so the in-app and web copies are identical. The same check is in `pnpm test:scripts` (`package.json:18`).
- Cross-checked against `docs/SECURITY.md` §6, `docs/DATA_MODEL.md` §5 (line 685), `docs/store/listing.md`, `docs/RELEASE.md` §5 (privacy label, age assurance) and DEC 136, 137, 150 to 152, 157, 159.
- Claims checked by grep against code: `analytics.ts`, `sentry.ts`, `app.config.ts`, `en.ts`, `delete.astro`, `mailer.ts`, `help.astro`, migrations `0012` and `0219`.

Paths below: `L/` = `apps/site/src/content/legal/`. Line numbers are in that file.

Not done: a trace of every upload path for EXIF removal, any test of whether parent agreement is enforced, and any check of current state-law status. Anything I could not confirm is marked CHECK.

## Requirement table

### A. Terms (RELEASE §6, "Terms must include")

| # | Requirement | Where met | Status | Note |
|---|---|---|---|---|
| T1 | Eligibility: 13+, under 18 with parent or guardian agreement, current student, one account | `L/terms.md:12-16` | PASS | The parent agreement is a promise in text only. No in-app step collects it (G11). |
| T2 | Marketplace role (introduce, not sell, inspect or handle money) | `L/terms.md:22` | PASS | |
| T3 | Prohibited items, link to banned list | `L/terms.md:26`, `L/banned-items.md` | PASS | |
| T4 | User content license | `L/terms.md:30` | PASS | Limited to running, improving and promoting the app. Matches Privacy. |
| T5 | Takedown / DMCA-style process and contact | `L/terms.md:36` | GAP | Process exists, but the Help form has no copyright topic (`help.astro:61-66`) and no DMCA agent is registered (TASKS P0-ACC-14, optional). G6. |
| T6 | Reporting, enforcement, strikes, suspensions, bans, appeals | `L/terms.md:40-48` | PASS | |
| T7 | Meetups: public spots, no safety guarantee, police-designated wording | `L/terms.md:52` | PASS | Matches CLAUDE.md rule 8. `L/rules.md:12` and `L/safety.md:20` still say "or a busy place" although meetups are Meetup spots only since DEC 151 (G9). |
| T8 | Account termination and deletion | `L/terms.md:70` | PASS | App and `/delete` both named. |
| T9 | Disclaimers | `L/terms.md:74` | PASS | |
| T10 | Limitation of liability | `L/terms.md:78` | PASS | |
| T11 | Indemnity | `L/terms.md:82` | CHECK | Minors can usually cancel contracts, so this may not bind 13 to 17 year olds. Harmless to keep. Do not rely on it. |
| T12 | Governing law (Ohio) and venue | `L/terms.md:86` | PASS | |
| T13 | Changes to terms with re-accept gate | `L/terms.md:90`; gate in `RulesScreen.tsx:55` and `supabase/migrations/0012_rpcs_account.sql:243` | PASS | Runs on `rules_version`. Page says "version and date" but shows only a version (G10). |
| T14 | Contact | `L/terms.md:94` | CHECK | A link to the Help web form only. No email address in any legal text (G10). |
| T15 | Quad description matches the real product | `L/terms.md:56` | GAP | Says "Other students don't see who wrote a post". Since DEC 150 the Quad shows names. Contradicts `L/rules.md:28` and `L/privacy.md:55`. G1. |

### B. Privacy (RELEASE §6, "Privacy must include")

| # | Requirement | Where met | Status | Note |
|---|---|---|---|---|
| P1 | What is collected (DATA_MODEL §5, SECURITY §6) | `L/privacy.md:12-30` | GAP | Waitlist email is kept (`L/privacy.md:107`) but is not in the collection table. G4. |
| P2 | Purposes | `L/privacy.md:34-36` | PASS | |
| P3 | Processors listed | `L/privacy.md:42-47` | GAP | Map tiles load from `tiles.openfreemap.org` (`apps/mobile/src/features/meetups/logic.ts:181-182`). That host sees the device IP and is not listed. G5. |
| P4 | No sale, no tracking, no ads | `L/privacy.md:8`, `:30` | PASS | Matches SECURITY §6 and the store listing. |
| P5 | Retention periods exactly as DATA_MODEL §5 | `L/privacy.md:91-109` vs `DATA_MODEL.md:685-703` | GAP | Every personal-data period matches (60 d, 30 d, 365 d, 180 d, 2 y, 7 d, 30 d). Gaps: the other chat member keeps messages after you delete (G3a); sold listings older than 180 d keep a thumbnail; the evidence bucket lifecycle is 200 d, not "180 d after resolution" (CHECK). Rate counters (2 d) and activity day totals (400 d) are unlisted. I treat them as non-personal aggregates (CHECK). |
| P6 | Quad disclosure (R1.1) | `L/privacy.md:53-59` | GAP | Line 57 starts "Only the owner of OnlySwap can do this" but nothing before it says what "this" is. A paragraph about revealing authors was cut when DEC 150 made names visible. Line 49 still points to "who wrote a Quad post (section 4)". G2. |
| P7 | Meetup share link disclosure | `L/privacy.md:85-87` | PASS | |
| P8 | Age: 13+, range stored, no DOB, teen section, parent requests, consent withdrawal, under-13 deletion | `L/privacy.md:120-126` | PASS | Parent requests go to the Help page, which has no parent or privacy topic (G7). Consent withdrawal and lock match RELEASE.md line 120. |
| P9 | User rights: Download your data, deletion in app and on web | `L/privacy.md:73-75`, `:113-115` | PASS | Code: `en.ts:353`, `:1647` (in-app delete); `delete.astro` (web delete, same function as the app). |
| P10 | Security measures | `L/privacy.md:130` | PASS | |
| P11 | Contact | `L/privacy.md:138` | CHECK | Help form only (G10). |
| P12 | Effective date and version | front matter `version: '2026-11'`; `[legal].astro:31` | GAP | Version only. No effective date. G10. |
| P13 | In-app and web copies match, CI-enforced | `scripts/sync-legal.mjs` | PASS | Ran today, passes. |

### C. Claims against the real system (CLAUDE.md rules 11 and 12, Apple, COPPA, CAN-SPAM)

| # | Claim or rule | Evidence | Status | Note |
|---|---|---|---|---|
| C1 | EXIF removed from every photo | `L/privacy.md:17`, `:59`, `:63`; `lib/media.ts`, `lib/exifGps.ts`; DATA_MODEL §6 ("EXIF stripped by re-encode (tested)") | PASS | Not every upload path traced. |
| C2 | No location permission or collection | `L/privacy.md:30`; `app.config.ts:27-29` blocks Android location; `app.config.ts:243` adds no NSLocation string | PASS | |
| C3 | PostHog: 18 events, no PII, hashed id, opt-out | `L/privacy.md:27`; `lib/analytics.ts:4`, `:39` (`EVENT_NAMES`), `:164-167` (`identified_only`, `disableGeoip`) | PASS | Opt-out switch is in `PrivacyScreen` (`SettingsScreens.tsx:164`). |
| C4 | Sentry: no PII, opt-out | `L/privacy.md:28`; `lib/sentry.ts:48` (`sendDefaultPii: false`) | PASS | |
| C5 | Deletion in app and on web (Apple 5.1.1(v)) | `en.ts:353`, `:1647`; `apps/site/src/pages/delete.astro:4-31` | PASS | Email sign-in only, so no Sign in with Apple token to revoke. |
| C6 | Under 13 blocked (COPPA) | `L/terms.md:12`, `L/privacy.md:120`; `en.ts:574`; `supabase/migrations/0219_age_retry_offer_lock.sql:35,60` | PASS | Block, deletion and hash-only retry block (365 d) exist. No birthday stored (DATA_MODEL line 129). |
| C7 | Teen section is accurate (range only, parent can ask, withdrawal locks) | `L/privacy.md:122-126`; `en.ts:1534`; RELEASE.md lines 110-120 | PASS | |
| C8 | State age-assurance laws (Texas, Utah, Louisiana) | `L/privacy.md:126`; RELEASE "Age assurance" block; DEC 136, 151 | CHECK | The system handles them through Declared Age Range. Policy copy is vague ("in some states"). Open: LAUNCH_READINESS item 50 (Quad and regulated teens). California's age-signal law (AB 1043, from memory, effective 2027) and the court status of Texas SB 2420 are in no doc. Verify both before relying on them. |
| C9 | Apple 1.2: filter, report, block, contact, timely action | `docs/store/listing.md` 1.2 table; RELEASE.md line 109 | PASS | Report on every content type, block and Quad hide, filters, 24 h human review. Contact is the Help form (see C14). |
| C10 | Store listing and App Review notes match the product | `docs/store/listing.md` ("The Quad (anonymous campus board)", "Posts are anonymous to other students", 1.2 row "No anonymous bullying") | GAP | Stale after DEC 150. Telling Apple the Quad is anonymous is a 2.3 accuracy risk. G8. |
| C11 | CAN-SPAM for email | `supabase/functions/_shared/mailer.ts:55-100` | PASS | The only outward email is one waitlist "campus open" message the person asked for, with a reason line. Sign-in code, deletion and export mail are transactional. Promotional push is opt-in (`tips`, DATA_MODEL line 433). If marketing email is ever added, it needs an unsubscribe link and a postal address first. |
| C12 | Child safety page: scanning claims are true | `L/child-safety.md:20`; DEC 159 (chat photos off; private chat photos are not scanned); LAUNCH_READINESS item 31 | GAP | Says chat photos "may be checked automatically for known child sexual abuse material". True only once such scanning exists and chat photos are on. G3b. |
| C13 | Evidence preservation matches the law | `L/child-safety.md:28` vs `L/privacy.md:103` (reports and evidence 180 d) | GAP | US law (18 USC 2258A as amended by the 2024 REPORT Act, from memory) has providers keep a CyberTipline report's content for one year. 180 d is shorter. G3c. |
| C14 | Support / contact address published | RELEASE.md line 56 (Support URL `/help`); `listing.md` ("support email in App Store Connect") | CHECK | The URL satisfies App Store Connect. The listing mentions an email, but no legal text shows one. Google Play's child safety section also wants a contact point. Confirm it exists and is read. |
| C15 | NCMEC CyberTipline reporting set up | `L/child-safety.md:29`; `docs/runbooks/incident.md:52` | CHECK | The runbook says report to NCMEC. Nothing records that OnlySwap is registered to file reports. Owner action. |
| C16 | Website cookies page is true | `L/cookies.md` | PASS | No analytics or ad scripts found in `apps/site/src` outside the legal text. |
| C17 | Privacy label and Data safety match policy | RELEASE.md lines 59-70, 105-113 vs `L/privacy.md` | PASS | Same data types. |
| C18 | Legal pages reachable in app before sign-up and in Settings | `RulesScreen.tsx:40-41`; `SettingsScreens.tsx:94-96`; `app/legal/[doc].tsx` | PASS | |

Totals (46 rows): **PASS 30, GAP 10, CHECK 6.**

- PASS: T1 T2 T3 T4 T6 T7 T8 T9 T10 T12 T13, P2 P4 P7 P8 P9 P10 P13, C1 to C7, C9, C11, C16, C17, C18.
- GAP: T5 T15 P1 P3 P5 P6 P12 C10 C12 C13.
- CHECK: T11 T14 P11 C8 C14 C15.

## Gaps and drafted fixes

Ordered roughly by risk. I did not edit the legal texts. After pasting, follow G12.

### G1. Terms section 8 says the Quad is anonymous (T15). HIGH

Risk: a false statement to users and to App Review, and it contradicts Privacy and Rules.

Replace the first paragraph of `terms.md` section 8 (line 56) with:

> The Quad is a board for students at your school. Posts and replies show your first name, last initial and profile photo, like the rest of OnlySwap, and stay linked to your account so we can enforce these terms. We share who wrote something with the authorities only when the law requires it or someone's safety is at serious risk, as described in the [Privacy Policy](/privacy). In the Quad you must not:

### G2. Privacy Quad section is broken (P6). HIGH

Replace `privacy.md` lines 55 to 57 (the Quad intro and the orphan "Only the owner" paragraph) with:

> The Quad is a board for students at your school. Posts and replies show your first name, last initial and profile photo, like the rest of OnlySwap, and are linked to your account. Other students at your school can see them. We keep that link so we can act on reports and, when the law requires it or someone's safety is at serious risk, tell the authorities who wrote a post. Staff look at a post's author only to review a report, and every look is logged.

Change `privacy.md` line 49 from "That includes, in those cases only, who wrote a Quad post (section 4)." to:

> That includes, in those cases only, the account details of the person who wrote a Quad post (section 4).

Before publishing, confirm "staff look at a post's author only to review a report" and "every look is logged" in the admin console. I did not verify these in code.

### G3. Deletion, retention and child-safety evidence (P5, C12, C13). MEDIUM to HIGH

**G3a. Other chat member keeps messages.** `delete.astro` and `en.ts:1649` already say the other person keeps their copy and sees "Deleted user". Privacy does not. In `privacy.md` section 5, replace the row "Account, listings, messages" with:

> | Account, listings, messages | Until you delete your account. When you delete, the people you chatted with keep their copy of the chat, and your name on it becomes "Deleted user". Chats closed for 90 days move to private archive storage. Sold listings older than 180 days keep only a small thumbnail. |

Check first how long an archive lives after one member deletes. DATA_MODEL line 718 says an archive is marked done only if nobody in it is deleting, and the rest of the lifecycle is not stated plainly.

Replace `privacy.md` line 115 with:

> **Delete it:** in the app (Profile, Settings, Delete account) or on the web at [/delete](/delete). Your profile, listings, photos and saves are removed. Other people keep their copy of any chat with you, without your name. Reports, one-way hashes and backups stay as described in section 5.

**G3b. Chat photo scanning claim.** Replace `child-safety.md` line 20 with:

> - Photos in listings, Quad posts and profiles are checked automatically, as described above. Sending photos in chat is off for now. If we turn it on, photos are stored privately and a person reviews any photo that is reported. Photos in chat from people you've just started talking to will stay blurred until you tap them.

In `privacy.md` line 63, replace "Photos may be checked automatically for illegal content, like child sexual abuse material, and a person reviews any photo that's reported." with:

> Photos in chat are not scanned automatically, so reports are how we find problems, and a person reviews any photo that's reported.

Skip that last edit only if CSAM scanning covers private chat photos by launch.

**G3c. Evidence.** Replace `child-safety.md` line 28 with:

> 2. Keep the content and account details privately for at least one year, as US law requires for reports to the CyberTipline.

Add to the `privacy.md` section 5 table after "Reports and evidence":

> | Evidence in child safety reports sent to the authorities | 1 year from the report |

Then make the R2 `evidence/` lifecycle (now 200 d) and the report-evidence job keep these for a year. Confirm the duty with NCMEC guidance or a lawyer before launch. I am citing it from memory.

### G4. Waitlist data missing from the collection table (P1). LOW

Add a row to the `privacy.md` table after "Data export requests":

> | Waitlist request (school email and school) | To tell you when your school opens. Kept until we email you or 12 months, whichever comes first. |

### G5. Map tile provider not disclosed (P3). LOW to MEDIUM

Add to the `privacy.md` processors list (after line 47):

> - OpenFreeMap (map pictures on the Meetup spots map; it sees your device's IP address when the map loads, but not who you are)

Verify no key or user id is sent with tile requests (`meetups/logic.ts:181`). If the owner would rather not list a new processor, proxy tiles through the media Worker.

### G6. Copyright takedown contact (T5). MEDIUM

Option A (free, matches TASKS P0-ACC-14): add a "Copyright or takedown" topic to the Help form (`help.astro:61-66`) and change the start of `terms.md` line 36 to:

> If you believe content on OnlySwap infringes your copyright or other rights, use the [Help page](/help) and pick "Copyright or takedown". Include:

Option B (about $6 per 3 years): register a DMCA designated agent at copyright.gov and add the agent's name and address to `terms.md` section 5. Without registration, the safe harbor for user posts is not available. Record the choice in `DECISIONS_LOG.md`.

### G7. Parent and privacy request route (P8, T1). MEDIUM

Add two topics to the Help form: "Parent or guardian request" and "Privacy request". Replace `privacy.md` line 125 with:

> - A parent or guardian can ask to see or delete your data. Use the [Help page](/help) and pick "Parent or guardian request". We check that it's a real request before we act on it.

### G8. Store listing and review notes still say the Quad is anonymous (C10). HIGH (Apple 2.3, 1.2)

In `docs/store/listing.md`:

- "The Quad (anonymous campus board)" becomes "The Quad (campus board)".
- Replace "Posts are anonymous to other students but always tied to a verified, age-checked account." with "Posts show the author's first name, last initial and photo, and are tied to a verified, age-checked account."
- 1.2 table, row "No anonymous bullying": replace the right column with "Quad posts show the author's name and are tied to a verified, age-checked school account; calling out students is against the rules and filtered; strikes and bans apply".
- `docs/OWNER_TODO.md` item 20 has a `rules_changes` example "anonymous to students". Do not paste it.

### G9. Meetup wording (T7). LOW

`rules.md:12`: "Use a Meetup spot in the app. Not a dorm room, not an empty parking lot. Daytime is better."
`safety.md:20`: "Pick a Meetup spot, in daylight if you can."

### G10. Contact and effective date (T14, P11, P12). LOW to MEDIUM

If the owner has a support email, add it at the end of Terms, Privacy and Child safety, for example:

> Questions or requests: use the [Help page](/help) or email support@<your-domain>.

I do not know the address, so do not invent one. Add under each page's first paragraph: "Effective November 4, 2026." Change "The version and date are at the top of this page" (`terms.md:90`) and "The version and date are at the top." (`privacy.md:134`) to say "version and effective date".

### G11. Parent agreement is not collected (T1). MEDIUM, owner decision

Terms say a parent agrees, but nothing in the app collects or checks it, except where an app store asks a parent to approve. Options: (a) keep the text and record it as a risk acceptance below; (b) soften `terms.md` line 13 to:

> If you're 13 to 17, make sure a parent or guardian is OK with you using OnlySwap and these terms.

My recommendation is (b). A promise we don't check reads worse than a plain one.

### G12. Release mechanics

After edits: run `node scripts/sync-legal.mjs`, bump `version` in each edited page's front matter, set `rules_version` in admin Config so existing accounts re-accept (use a fresh `rules_changes` line, for example "Updated: how the Quad shows names, and how long we keep chat copies"), and re-run `pnpm test:scripts`.

## Items that block App Store submission

1. G1, G2, G8: contradictory Quad statements across Terms, Privacy and the review notes. Fix before submitting.
2. CSAM scanning (LAUNCH_READINESS item 31, OWNER_TODO 19, RELEASE §5 step 10) is still Missing. Not a text issue, but the child-safety page and Guideline 1.2 both lean on it while teens can upload listing and Quad photos.
3. G3c and C15: settle the evidence-retention duty and NCMEC registration before the first report has to be filed.
4. C14: confirm a working support contact exists.

G4 to G7 and G9 to G11 are not blockers. They should land in the same text change.

## Owner sign-off

I have read this review and the drafted fixes. My decisions:

- [ ] Apply the drafted fixes. Rejected items: ____________________
- [ ] Accept the remaining GAP and CHECK items as a recorded risk. Items: ____________________
- [ ] DMCA agent: register (G6 B) / use the Help form only (G6 A)
- [ ] Parent agreement: keep text (G11 a) / soften text (G11 b)

Name: ____________________  Date: ____________  Decision: ____________________

This is a recorded self-review by an AI assistant and the owner. It is not legal advice, no lawyer has read it, and it does not replace one. Statements about US law above are from memory and are not verified against current sources. If you ever do pay for a lawyer, the highest-value items to hand over are G3c, C8 and G11.
