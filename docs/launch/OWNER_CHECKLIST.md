# Owner checklist: iOS launch at Ohio Wesleyan (2026-11-04)

Your steps only, in order. Claude's steps sit between them in `docs/LAUNCH_PLAN.md`; each phase gate there must be green before you start the next block. Tick here as you go.

## Now: merge the PR stack (phase 1)
- [ ] Merge in order, one at a time, waiting for green CI after each retarget: #55, #56, #57, #58, #59, #60, then the LR 42 PR stacked on #60.
- [ ] After the stack: merge or close Dependabot #31 to #34 and #50 (LR 43).

## Accounts and keys (phase 3; table in `docs/runbooks/production.md` §0, about 1 to 2 hours)
- [ ] Supabase: pause `intention`, so the free plan has a slot for `onlyswap-prod`.
- [ ] Gmail: a production sender with 2-Step Verification and an app password named OnlySwap.
- [ ] Sentry: projects `onlyswap-mobile` and `onlyswap-functions`. PostHog: a production project with IP capture and GeoIP off.
- [ ] Then run, and paste values at the hidden prompts: `bash scripts/deploy/prod-supabase.command`. Tell Claude when it finishes; Claude checks the gate (health, migrations, functions, scheduled jobs, restore drill).

## Domain and scanning (phase 4)
- [ ] Buy the domain in Cloudflare (about $10.46 a year, approved) and switch the nameservers.
- [ ] Cloudflare: a Turnstile widget for the domain (Managed) and an R2 token scoped to `onlyswap-media` and `onlyswap-private`.
- [ ] Turn on the Cloudflare CSAM Scanning Tool for the media host. The legal review lists it as a submission blocker (LR 31).
- [ ] Run `bash scripts/deploy/cloudflare-prod.command` (R2, media Worker, site, admin and web on prod). Do not use `site.command`; it deploys staging.

## Ohio Wesleyan data (phase 5)
- [ ] Read `docs/launch/OWU_SPOTS.md` (6 draft spots; none is police-designated). Walk them or confirm with campus, and fix any "verify on site" coordinates.
- [ ] Note: `supabase/campuses/owu.sql` puts the Campus Center at 61 S. Sandusky St (40.2970, -83.0672); the research says 40 Rowland Ave (40.296626, -83.069990). Say which is right; Claude updates `owu.sql` with the approved list.
- [ ] Then: `bash scripts/deploy/add-campus.command owu prod`.

## Legal sign-off (phase 8, LR 34, start now: no dependencies)
- [ ] Read `docs/launch/LEGAL_SELF_REVIEW.md`: 30 PASS, 10 GAP, 6 CHECK, each GAP with drafted text. Tell Claude which drafts to apply.
- [ ] Must fix before submitting: the Quad is described as anonymous in Terms and the store listing, but names are shown (DEC 150), and the child-safety page says chat photos are scanned, but chat photos are off and unscanned (DEC 159).
- [ ] Confirm the NCMEC CyberTipline registration, and the support email shown on the legal pages.
- [ ] Sign the block at the end of that file and add the DECISIONS_LOG row.

## iOS build (phase 6)
- [ ] Accept the latest Apple agreements, then create the APNs key: `eas credentials -p ios`. Install the CLI: `npm i -g eas-cli`.
- [ ] Run `bash scripts/deploy/eas-prod-env.command`.
- [ ] After Claude reports `verify:prebuild` at 33/33 and the review account is seeded: `eas build --profile production -p ios`, then `eas submit -p ios`.

## Testing (phase 7)
- [ ] Install from TestFlight on your iPhone. Sign up with a real `@owu.edu` address, post a listing with a photo, and do one full swap with a second tester (offer, chat, meetup, rating).
- [ ] Age check on a real iOS 26.4 device in Sandbox (LR 33). Delete a test account and confirm it's gone (LR 25).
- [ ] Set up UptimeRobot and Sentry alerts (LR 37).

## Submit (phase 8)
- [ ] App Store Connect: the App Privacy label with age range, and the age rating questionnaire with no override (LR 35).
- [ ] Metadata from `docs/store/listing.md` (after the Quad fix above), 6.9-inch screenshots, review notes with the review account (LR 36).
- [ ] Submit. Send any rejection text to Claude.

## Decided for you (2026-11-04, under "do whatever best")
- LR 50, the teen significant-change holdback, is out of R1.0 (DEC 161). The Quad stays off for every campus until it ships. Reverse this by asking for LR 50 before launch; it costs about a day of work and blocks nothing else.
