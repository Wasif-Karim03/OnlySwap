# Admin console checklist

Cross-check of the admin console (`apps/admin`) against the database, the app's features, the current screens (`design/admin-screens-now.html`) and the approved direction (`design/admin-redesign-mock.html`). Written 2026-10-11.

Legend: **[x]** built and working, **[~]** built but needs fixing or redesign, **[ ]** missing.
Priority: **P1** before launch, **P2** soon after launch, **P3** later.

## 1. What we already have

### Access and safety of the console itself
- [x] Email code sign-in, then a required two-step check (authenticator app), for every admin
- [x] Roles: owner (all campuses) and moderator (one campus, limited actions)
- [x] Every staff action needs a reason and writes one audit row; the audit log can't be edited or deleted
- [x] Reading a reported chat is allowed only when a report targets it, and is logged
- [x] Quad author reveal: owner only, fresh two-step check, case number, reason, receipt email, 5 per day

### Pages and actions
- [~] Overview: 9 number tiles only (no trends, no live feed, no "needs attention")
- [~] Reports queue and report detail: dismiss, remove content, warn, strike, suspend, ban, read reported chat
- [~] Appeals: approve or deny
- [~] Users list and user detail: pause, suspend, ban, make active, force re-verify, clear strike, change email
- [~] Listings: held for review and active, approve or remove
- [~] Quad moderation: held, reported, hidden; approve or remove; reveal author
- [~] Metrics: funnel, retention, liquidity, safety, per campus
- [~] Banned words: add, edit, delete, per scope
- [~] Announcements: list and post (one per campus per week)
- [~] Campuses: settings, email domains, meetup spots
- [~] Team: invite and remove admins
- [~] Config: app switches and limits (raw JSON today)
- [~] Audit log: list

All 38 admin database functions are wired into a page; none is unused.

## 2. Bugs to fix (P1)
- [x] Unknown page shows "Page not found" outside the sidebar, with no way back
- [x] Report detail: one "Suspend days" box sits in front of every action; show it only for Suspend
- [x] User detail: one "Until" date sits in front of every action; show it only for Pause and Suspend
- [x] Change email saves without asking for a reason (audit row has no reason) (0209 adds the reason overload)
- [x] Users list doesn't show campus or email
- [x] Announcements can't be posted when "All campuses" is selected; demo campus shows in the picker
- [x] Audit log has no paging and no date filter
- [x] "1 strikes" and "1 no-shows" plurals
- [x] Campuses: the Active checkbox is huge (input height rule hits checkboxes); long spot names are cut off
- [x] Sidebar scrolls away on long pages

## 3. Redesign (approved mock) (P1)
- [x] New look: fixed sidebar with groups, top bar with search and export, calm tables, colored status pills, one main action per area
- [x] Plain words instead of database names (`no_show` to "No-show", `unlock_threshold` to "Opens at")
- [x] Overview: trend numbers, live activity feed (latest 10), needs attention, campuses table
- [x] Reports: queue and detail side by side, reported person's history next to the report, one action row with the reason box
- [x] People list with status colors, campus, year, swipes, offers, deals, reports, last active (built on `admin_list_users_v2`)
- [x] One student page: header with status and numbers, tabs (Timeline, Swipes, Offers, Listings, Chats, Meetups, Reports, Access log), what they like, when they're active, account facts (`/people/$id`; tabs in `?tab=`, plus Blocks; swipes are the Timeline's All / Offers / Saves / Left / Views filter, not a separate tab)
- [x] Listing page: who swiped which way and when, offers, views, price history, funnel, right vs left (`/listings/$id`)
- [x] Activity page: every action by every student, filters (type, campus, person, listing, time), CSV (`/activity`, Load more, 20 s live refresh)
- [x] Quad, Audit log, Campuses (schools list plus settings plus spots table), Announcements (with reach count), Settings (team, banned words, switches, limits) in the new layout
- [x] Sign-in pages with the logo and one line about who the console is for

## 4. New data the redesign needs (P1)
Today the app stores saves, offers (a right swipe is an offer), chats, meetups, deals and left swipes (deleted after 30 days). It does not store views per person or anything about how people browse.
- [x] Activity events table: who, what (shown in deck, viewed, swiped, saved, searched, opened from), which listing, when, device and app version; one server function the app calls in batches (backend: `activity_events`, `track_events`; the app sends them in step 2)
- [x] Time on card and where the listing was opened from (Discover, search, Around campus, profile, link) (backend: `dwell_ms`, `source`)
- [x] Last active time and device per student (backend: `last_active_at`, `last_platform`, `last_app_version`)
- [x] Keep events 90 days, then delete (left swipes stay at 30 days); add both to the privacy policy retention table (`prune_activity` job)
- [x] Admin functions for: activity feed, a student's timeline, a listing's swipe list and funnel, live numbers with trends; each one that shows a named student writes an access row to the audit log (backend, API §4.1)
- [x] Privacy policy and in-app privacy text: "Our team can see your activity in the app (swipes, saves, offers) to run and protect the service. Every look is logged."
- [x] PostHog stays as it is (18 events, no personal data); the new events live only in our database
- [x] App side (`apps/mobile/src/lib/activity.ts`): a queue saved on the phone sends `track_events` batches (up to 50, every 15 s, on background, at 50 waiting; at most 100 batches an hour; 24 h and 500 caps; retries offline; cleared on sign-out) with the device type and app version. Fires `app_open` (launch, and after 30 minutes away), `deck_shown` (top card in Discover), `swiped_left` / `saved` / `offer_made` with time on card, `unsaved`, `listing_viewed` once per visit with time on page and where it was opened from (`from` route param: Discover, search, Around campus, profile, saved, link, notification), `searched` with the text. Service data, not analytics: the analytics switch doesn't turn it off (privacy policy section 2)

## 5. Missing pages and tools (not in the mock yet)
- [x] **Support inbox** (P1) (backend; reply goes out by email through the outbox): the Help form and "can't get into my school email" requests are stored (`support_requests`) but no page shows them. List, reply by email, mark done. Page: `/support`.
- [x] **Waitlist demand** (P1) (backend): website and app waitlist sign-ups by school (`waitlist_requests`), so you can see which school to open next, and open it in one click Page: `/waitlist`.
- [x] **Add a school from the console** (P1) (backend): today a new school needs a SQL file and a Terminal command; add "Add school" with name, domain, time zone, first meetup spot Page: Add school on `/campuses`.
- [x] **Meetups and no-shows** (P2) (backend): upcoming meetups per campus, no-show reports, who keeps missing Page: `/meetups`.
- [x] **Ratings** (P2) (backend): thumbs up and down per student, low-rated sellers Page: Ratings card on `/metrics`.
- [x] **Account deletions and data exports** (P2) (backend): requests, status, failures Page: `/settings/data`.
- [x] **System health** (P2) (backend): failed emails (code emails), failed pushes, last run of each scheduled job, storage use against the free tier Page: `/settings/health`.
- [x] **Alerts to you** (P2): email when a threat or safety report comes in, or when the report queue is older than 4 hours
- [x] **Blocks** (P2) (backend, in `admin_person`): on a student's page, who they blocked and who blocked them Page: Blocks tab on the student page.
- [x] **Under-18 attempts** (P2) (backend): age check blocks per campus, for compliance Page: card on `/metrics`.
- [x] **App Review accounts** (P2) (backend): manage the Demo University reviewer logins before store submission Page: `/settings/review`.
- [x] **Bulk actions** (P2) (backend): remove or hold many listings at once (spam waves) Page: checkboxes on `/listings`.
- [x] **Global search** (P2) (backend): one box for people, listings, reports (the ⌘K in the mock) Page: top bar on every page.
- [x] **Photo blocklist** (P3): banned image hashes (`banned_hashes`) page (backend; note `banned_hashes` holds hashed emails of banned accounts, not photos) Page: `/settings/blocked-emails`.
- [~] **Categories editor** (P3): rename, reorder, hide categories (backend: rename, reorder, add; hide not built because the app reads categories directly) Page: `/settings/categories`.
- [ ] **Staging tools** (P3): mock data and bot status, on staging only
- [ ] **Phone-friendly layout** (P3): read-only on a phone for checking reports on the go

## 6. Checks before launch (P1)
- [ ] Moderator account can only see and act on its own campus (test with a real second admin)
- [ ] Every action and every person-page view shows up in the audit log with a reason
- [ ] Console works on the live staging data, not only sample data
- [ ] Tests for every new admin function (pgTAP) and the new pages
- [ ] Owner two-step check is set up on your account, with a second authenticator (or a written recovery plan) in case you lose your phone
