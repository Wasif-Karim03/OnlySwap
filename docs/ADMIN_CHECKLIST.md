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
- [ ] Unknown page shows "Page not found" outside the sidebar, with no way back
- [ ] Report detail: one "Suspend days" box sits in front of every action; show it only for Suspend
- [ ] User detail: one "Until" date sits in front of every action; show it only for Pause and Suspend
- [ ] Change email saves without asking for a reason (audit row has no reason)
- [ ] Users list doesn't show campus or email
- [ ] Announcements can't be posted when "All campuses" is selected; demo campus shows in the picker
- [ ] Audit log has no paging and no date filter
- [ ] "1 strikes" and "1 no-shows" plurals
- [ ] Campuses: the Active checkbox is huge (input height rule hits checkboxes); long spot names are cut off
- [ ] Sidebar scrolls away on long pages

## 3. Redesign (approved mock) (P1)
- [ ] New look: fixed sidebar with groups, top bar with search and export, calm tables, colored status pills, one main action per area
- [ ] Plain words instead of database names (`no_show` to "No-show", `unlock_threshold` to "Opens at")
- [ ] Overview: trend numbers, live activity feed, needs attention, campuses table
- [ ] Reports: queue and detail side by side, reported person's history next to the report, one action row with the reason box
- [ ] People list with status colors, campus, year, swipes, offers, deals, reports, last active
- [ ] One student page: header with status and numbers, tabs (Timeline, Swipes, Offers, Listings, Chats, Meetups, Reports, Access log), what they like, when they're active, account facts
- [ ] Listing page: who swiped which way and when, offers, views, price history, funnel, right vs left
- [ ] Activity page: every action by every student, filters (type, campus, person, listing, time), CSV
- [ ] Quad, Audit log, Campuses (schools list plus settings plus spots table), Announcements (with reach count), Settings (team, banned words, switches, limits) in the new layout
- [ ] Sign-in pages with the logo and one line about who the console is for

## 4. New data the redesign needs (P1)
Today the app stores saves, offers (a right swipe is an offer), chats, meetups, deals and left swipes (deleted after 30 days). It does not store views per person or anything about how people browse.
- [ ] Activity events table: who, what (shown in deck, viewed, swiped, saved, searched, opened from), which listing, when, device and app version; one server function the app calls in batches
- [ ] Time on card and where the listing was opened from (Discover, search, Around campus, profile, link)
- [ ] Last active time and device per student
- [ ] Keep events 90 days, then delete (left swipes stay at 30 days); add both to the privacy policy retention table
- [ ] Admin functions for: activity feed, a student's timeline, a listing's swipe list and funnel, live numbers with trends; each one that shows a named student writes an access row to the audit log
- [ ] Privacy policy and in-app privacy text: "Our team can see your activity in the app (swipes, saves, offers) to run and protect the service. Every look is logged."
- [ ] PostHog stays as it is (18 events, no personal data); the new events live only in our database

## 5. Missing pages and tools (not in the mock yet)
- [ ] **Support inbox** (P1): the Help form and "can't get into my school email" requests are stored (`support_requests`) but no page shows them. List, reply by email, mark done.
- [ ] **Waitlist demand** (P1): website and app waitlist sign-ups by school (`waitlist_requests`), so you can see which school to open next, and open it in one click
- [ ] **Add a school from the console** (P1): today a new school needs a SQL file and a Terminal command; add "Add school" with name, domain, time zone, first meetup spot
- [ ] **Meetups and no-shows** (P2): upcoming meetups per campus, no-show reports, who keeps missing
- [ ] **Ratings** (P2): thumbs up and down per student, low-rated sellers
- [ ] **Account deletions and data exports** (P2): requests, status, failures
- [ ] **System health** (P2): failed emails (code emails), failed pushes, last run of each scheduled job, storage use against the free tier
- [ ] **Alerts to you** (P2): email when a threat or safety report comes in, or when the report queue is older than 4 hours
- [ ] **Blocks** (P2): on a student's page, who they blocked and who blocked them
- [ ] **Under-18 attempts** (P2): age check blocks per campus, for compliance
- [ ] **App Review accounts** (P2): manage the Demo University reviewer logins before store submission
- [ ] **Bulk actions** (P2): remove or hold many listings at once (spam waves)
- [ ] **Global search** (P2): one box for people, listings, reports (the ⌘K in the mock)
- [ ] **Photo blocklist** (P3): banned image hashes (`banned_hashes`) page
- [ ] **Categories editor** (P3): rename, reorder, hide categories
- [ ] **Staging tools** (P3): mock data and bot status, on staging only
- [ ] **Phone-friendly layout** (P3): read-only on a phone for checking reports on the go

## 6. Checks before launch (P1)
- [ ] Moderator account can only see and act on its own campus (test with a real second admin)
- [ ] Every action and every person-page view shows up in the audit log with a reason
- [ ] Console works on the live staging data, not only sample data
- [ ] Tests for every new admin function (pgTAP) and the new pages
- [ ] Owner two-step check is set up on your account, with a second authenticator (or a written recovery plan) in case you lose your phone
