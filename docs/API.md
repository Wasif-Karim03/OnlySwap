# API.md — Server contracts (LOCKED)

**API surfaces:**
- Postgres RPCs, called through `supabase.rpc(name, args)`
- Supabase Edge Functions at `POST /functions/v1/<name>`
- Cloudflare Workers and Pages Functions

**Every RPC:**
- is `security definer set search_path = public, private, extensions`
- is granted to `authenticated` (or to `anon` where marked **public**)
- raises errors as `P0001` with `MESSAGE = 'CODE[:detail[:retry_at]]'`

**Compatibility (ADR-011):**
- Contracts are additive-only.
- A breaking change means a new `_v2` function.
- `packages/shared/src/rpc-contract.json` is snapshotted in CI.

**Release tags:** R1.0 unless marked **[R1.1]**.

## 0. Error codes

The client maps these to copy in `apps/mobile/src/strings/en.ts` → `errors.*`.

| Code | Meaning |
|---|---|
| `NOT_AUTHENTICATED` | no session |
| `NOT_ACTIVE:<status>` | account not active (waitlist, reverify, paused, suspended, banned) |
| `AGE_REQUIRED` | adult confirmation missing |
| `RULES_REQUIRED` | rules not accepted or outdated version |
| `FORBIDDEN` | not owner/participant/admin |
| `NOT_FOUND` | row not visible |
| `INVALID:<field>` | validation failed |
| `BANNED_TERM:<term>` | text blocked by banned words |
| `RATE_LIMITED:<action>:<retry_at>` | limit hit |
| `OFFERS_PAUSED` | no-show pause |
| `SELLER_AWAY` | the seller paused their listings (DEC 126) |
| `LISTING_UNAVAILABLE` | not active / not open to offers |
| `OFFER_NOT_PENDING` | state changed |
| `ALREADY_REPORTED` | duplicate open report |
| `ALREADY_APPEALED` | appeal exists |
| `MEETUP_WINDOW` | action outside allowed time |
| `CHAT_CLOSED` / `CHAT_BLOCKED` | cannot send |
| `NOT_ADMIN` | admin check failed (role or AAL) |
| `SCHOOL_UNKNOWN` / `DOMAIN_BLOCKED` / `AGE_BLOCKED` / `BANNED` / `EMAIL_ALIAS` | auth hook rejections (surface via Auth error message); `EMAIL_ALIAS`: the address is a +tag alias of an existing account (DEC 105) |
| `FEATURE_OFF` | flag disabled (R1.1 features) |

## 1. Private helpers (`0007_helpers.sql`)

| Function | Contract |
|---|---|
| `private.now()` | returns `now()` (staging override for tests) |
| `private.require_active() → profiles` | reads live profile. Raises `NOT_AUTHENTICATED` / `NOT_ACTIVE` / `AGE_REQUIRED` / `RULES_REQUIRED` (checks `rules_version` = `app_config.rules_version`). Upserts `activity_days` |
| `private.require_admin(min admin_role) → admins` | admins row, `auth.jwt()->>'aal'='aal2'`, role ≥ min, campus scope; else `NOT_ADMIN` |
| `private.hit(action, lim int, win interval)` | increments `rate_counters` bucket; raises `RATE_LIMITED` |
| `private.hit_ip(action, lim, win)` | same, keyed by `x-forwarded-for` hash |
| `private.check_text(txt, scope) → text` | `ok`, `block:<term>` or `review:<term>`. Normalizes (lowercase, unaccent, leetspeak, repeats); bumps `fired_count` |
| `private.email_hash(email) → text` | sha256(lower(trim(email)) with any `+tag` dropped from the name part ‖ pepper from Vault) (DEC 105) |
| `private.is_blocked(a, b) → bool` | either direction |
| `private.queue_notification(user, type, grp, title, body, data, time_sensitive, dedupe_key, push_after)` | insert … on conflict do nothing (BE-04) |
| `private.queue_email(to, template, vars, dedupe_key)` | insert into `email_outbox` on conflict do nothing |
| `private.new_invite_code()` | 8-char base32 unique |
| `private.unaccent_immutable(text)` | immutable wrapper |
| `private.unlock_campus(campus_id)` | idempotent: set live, queue `campus_unlocked` + emails |
| `private.can_upload(uid, kind, target_id) → campus_id` | Called by `upload-url` with the service role. It checks ownership: the listing is the caller's or was reserved by them, or it's their own avatar or their own listing's share card |
| `private.snapshot_evidence(target_type, target_id) → jsonb` | text, excerpts (last 20 messages for chat/message targets), photo keys |

## 2. Auth hooks and triggers (`0010_hooks_triggers.sql`)

| Name | Type | Logic |
|---|---|---|
| `private.hook_before_user_created(event jsonb)` | Auth hook | 1. `email_hash` in `age_blocks` → `AGE_BLOCKED`. 2. In `banned_hashes` → `BANNED`. 2b. A profile already has that hash (a `+tag` alias) → `EMAIL_ALIAS`. 3. Email in `review_accounts` → allow. 4. `campus_domains` lookup: missing → `SCHOOL_UNKNOWN`; `blocked` → `DOMAIN_BLOCKED`. 5. Allow. |
| `private.hook_custom_access_token(event jsonb)` | Auth hook | claims `campus_id`, `status`, `adult`, `admin_role` |
| `on_auth_user_created` | after insert `auth.users` | create profile (campus, status waitlist if campus not live, `verified_until`, `invited_by` from metadata `invite_code`), `notification_prefs` row |
| `on_auth_user_email_changed` | after update of email | re-resolve campus by domain (Change school, email-access recovery) |
| `trg_profiles_waitlist` | after insert profiles | members ≥ threshold and campus waitlist and not launch-controlled → `unlock_campus` |
| `trg_listings_ai` | after insert listings | queue `saved_search_match` (≤1 per search per 2 h), `wanted_match` (open wanted in the same category, ≤1 per poster per day), founding-seller flag |
| `trg_listings_price` | after update of `price_cents` | log change; drop ≥5% → `price_drop` to savers (dedupe `price_drop:{listing}:{new_cents}`) |
| `trg_listings_status` | after update of status | hold→active: `watch_available`; sold/deleted/removed: auto-decline open offers, close other chats with a system message (BE-11) |
| `trg_offers_notify` | after insert/update offers | `offer_new` / `offer_countered` / `offer_accepted` / `offer_declined` / `offer_expired` with `dedupe_key = type:{offer}:{round}` |
| `trg_notifications_ping` | after insert or update of title, body, created_at on notifications | unread and `grp` not messages/offers: `realtime.send('user:'‖user_id, 'bell', {})` so the bell refetches `unread_count` (0234, DEC 122) |
| `trg_messages_ai` | after insert messages | update chat `last_message_at`; one `realtime.send('user:'‖other, 'inbox', {chat_id, message})` (both parties for a message with no sender; nothing on `chat:{id}`, DEC 108); queue `message_new` (preview only if the recipient's `message_previews`; collapse via `dedupe_key = message_new:{chat}:{minute}`) |
| `trg_meetups_notify` | after insert/update | `meetup_proposed` / `meetup_confirmed` / `meetup_status` / `meetup_changed` |
| `trg_reports_ai` | after insert | priority-1 → `queue_email(priority_report)`; ≥3 distinct reporters aged >7 d within 24 h → auto-hide target (BE-09) |
| `trg_audit_immutable` | before update/delete audit_log | raise |
| `trg_updated_at` | before update | `updated_at = now()` |
| `trg_saved_search_cap` | before insert saved_searches | max 20 |

## 3. User RPCs

Every write calls `require_active()` (reads that need `status='active'` do too).

**Public (anon)**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `lookup_school` | `domain text` | `{campus_id, name, status, is_review}` or null | lowercase ≤100 | 30/min/IP |
| `public_campus_progress` | — | `[{slug, name, status, members, threshold}]` | — | — |
| `public_safe_spots` | `slug` | `[{name, designation, lat, lng, hours}]` | — | — |
| `get_listing_public_card` | `id` | `{title, price_cents, campus_name, share_image_path}` only if shared and active/hold | — | 60/min/IP |
| `get_meetup_share` | `token` | `{a_first, b_first, spot_name, spot_lat, spot_lng, starts_at, a_here, b_here, late_minutes, status}` if not expired | — | 60/min/IP |
| `get_invite` | `code` | `{first_name, campus_name, members, threshold}` | — | 60/min/IP |
| `get_app_config` | — | public keys | — | — |

**Account & onboarding**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `confirm_age` | `method, is_adult?, birth_date?` | `{adult}` | computes in campus TZ; minor → `age_blocks` + returns false; never stores DOB | 3/day |
| `update_profile` | `first_name, last_initial, year, areas, bio, avatar_path` | profile | name regex; bio `check_text(profile)`; avatar path prefix `c/{campus}/u/{uid}/` | 20/day |
| `update_profile_flags` | `analytics_opt_in?, crash_reports_opt_in?, theme_mode?` | void | — | — |
| `accept_rules` | `version` | void | must equal `app_config.rules_version` | — |
| `my_waitlist_position` | — | `{position, members, threshold}` | — | — |
| `complete_reverify` | — | void | session `amr` has an OTP within 10 min | — |
| `my_counts` | — | `{active_listings, saved, wanted, offers_open}` | — | — |

**Feed, listings, search**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `get_feed` | `cursor jsonb, limit int=20` | `FeedItem[]` (`seller` has `swaps_count, thumbs_up, thumbs_total`, DEC 124) | excludes own, swiped 30 d, blocked, deleted; <5 results → `daily_counters.feed_exhausted++` | 120/h |
| `record_swipes` | `items jsonb` (≤50: `{listing_id, dir: left\|right\|save, at, dwell_ms?}`) | void | upsert; unknown ids and dirs ignored; `right` since DEC 106 (older apps send a right swipe as `left`); `dwell_ms` is time on card, capped at 600000, anything else stored as null (DEC 100) | 60/h |
| `undo_swipe` | `listing_id` | void | within 60 s | — |
| `save_listing` / `unsave_listing` | `listing_id` | `{save_count}` | not own; same campus | 200/day |
| `hide_listing` | `listing_id` | void | = permanent left | — |
| `watch_listing` | `listing_id` | void | listing on hold | — |
| `record_view` | `listing_id` | void | once/user/day | — |
| `track_events` | `events jsonb` (≤50: `{kind, listing_id?, source?, dwell_ms?, query?, at?}`), `platform text?` (`ios`\|`android`\|`web`), `app_version text?` | `{accepted}` | admin v2 activity (DEC 93): kinds `app_open`, `listing_viewed`, `unsaved`, `searched`, `opened_from` (DEC 100: `deck_shown`, `swiped_left`, `saved` and `offer_made` from older builds are dropped without an error); sources `discover`, `search`, `campus`, `profile`, `saved`, `link`, `notification` (else null); unknown kinds, listings not on the caller's campus or deleted, and `searched` without text are dropped; dwell capped at 600000 ms; query cut to 80; `at` kept within the last 24 h; stamps `last_active_at`, `last_platform`, `last_app_version`; `INVALID:events` when not an array or > 50 | 120/h |
| `get_listing` | `id` | `FeedItem & {access}`; `{id, access}` when not visible | access: buyer, owner, gone, blocked, other_campus (DEC 57) | 600/h |
| `get_campus_feed` | `kind text?, cursor` | items (all, news, free, wanted, food, new); `all` = food, free, wanted, news and sale from the last 7 days; items carry `link_url`, `event_at` (DEC 98); `day_one`, `active_listings`, `founding` on page one only, null after (0229) | — | 120/h |
| `create_news` | `id` (reserved), `title`, `description?`, `photos jsonb` (≤4), `link_url?`, `event_at?`, `place?` | listing | DEC 98: kind `news`, price 0, no offers; title 3–80, description ≤1000, place ≤60 (stored in `meet_note`), link `^https?://` with a dot, ≤300; `event_at` future and ≤90 days; expires at the end of the event's day in campus time, else now + 14 days; banned words and review holds as `create_listing`; `FORBIDDEN` without a reservation; idempotent on the id | create_listing 20/day + 3/day news |
| `search_listings` | `q, filters, cursor` | listings | `websearch_to_tsquery`; trigram fallback (both indexed, DEC 101); `cursor` `{offset}`; unknown filter keys → `INVALID:filters` | 120/h |
| `search_suggest` | `q` (≥2) | `[{type, label, count}]` | — | 600/h |
| `create_saved_search` / `update_saved_search` / `delete_saved_search` | … | row | max 20 | 30/day |
| `saved_search_new_counts` | — | `[{id, new_count}]` | — | — |
| `list_saved_searches` | — | `SavedSearch[]` | newest first (DEC 58) | — |
| `get_saved` | — | `(FeedItem & {price_at_save, saved_at})[]` | active, hold, sold (DEC 59) | — |
| `get_profile` | `user_id` | profile + listings + reviews, or `{id, access}` | access ok, me, blocked, gone (DEC 59) | 600/h |
| `price_hint` | `category_id` | `{p25,p50,p75}` or null | n≥5 | — |
| `price_hint` **[R1.1]** | `category_id, condition` | `{median_cents, p25_cents, p75_cents, n, scope}` or null | n≥5 for that condition, else the whole category (DEC 81) | — |
| `check_text` | `text, scope` | `{result, term}` | inline UX only | 600/h |
| `reserve_listing_id` | — | `uuid` | — | 30/day |
| `create_listing` | `id, kind, title, description, category_id, condition, price_cents, open_to_offers, photos jsonb, meet_spot_ids, meet_note, availability, wanted_max_cents, wanted_ref, food_minutes, pickup_by` | listing | id must be reserved by the caller; **idempotent** (`on conflict (id) do nothing`, returns existing); photos 1–8 (sale/free), 0–1 (wanted/food); path prefix check; `BANNED_TERM`; review → `held_review`; price ≤ 200000; food ≤ 180 min; `pickup_by` (free only, today…+14 d) sets the expiry (DEC 54) | 20/day (3 in first 24 h); wanted 5/day; food 3/day |
| `update_listing` | `id, …` | listing | seller; not sold/deleted; price change logged | 50/day |
| `delete_listing` | `id` | void | **soft**: status `deleted`, `deleted_at`; auto-declines, closes chats | — |
| `relist_listing` | `id, price_cents` | listing | expired, or Renew an active sale/free listing; once / 3 d (DEC 125); `my_listings` adds `renew_at` | — |
| `set_away` | `away bool` | `{away_since}` | Away mode (DEC 126): hides own sale/free listings from deck, search, campus feed; new offers → `SELLER_AWAY` (trigger); off adds the time away to active listings' `expires_at`. `get_me.away_since`, `get_profile.away`, `FeedItem.seller.away` | — |
| `set_listing_share_image` | `id` | `{share_image_path}` | seller; not deleted; records `share/{id}.jpg` after the app uploads the share card (DEC 55) | 30/day |
| `mark_sold` | `id, buyer_id?` | void | buyer must be a chat participant; closes other chats | — |
| `listing_stats` / `listing_offers` | `id` | stats / offers | seller only | — |

**Offers**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `make_offer` | `listing_id, amount_cents, note, quick_notes` | offer | not own; `FOR SHARE` lock; active + open; not blocked; `check_text(note)`; existing open offer → updates amount; `OFFERS_PAUSED` | campus `offers_per_hour` (10)/h; 5/day in first 24 h |
| `accept_offer` | `offer_id` | `{chat_id}` | correct party; `FOR UPDATE` listing; creates chat with snapshot; auto-declines others | — |
| `counter_offer` | `offer_id, amount_cents, note` | offer | round < 4; alternating | 30/day |
| `decline_offer` | `offer_id, reason` | void | — | — |
| `withdraw_offer` | `offer_id` | void | buyer | — |
| `get_inbox` | — | `{incoming[], outgoing[], chats[]}` | — | — |
| `get_offer` | `offer_id` | offer (with listing, other party, chat_id) | participants only (DEC 60) | — |

**Chat, meetups, deals**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `get_messages` | `chat_id, before bigint?, limit=50, after bigint?` | messages | participant; `after` for reconnect (DEC 61) | — |
| `get_chat` | `chat_id` | chat summary + state | participant (DEC 61) | — |
| `send_message` | `chat_id, kind='text', body, client_id` | message | participant; open; not blocked; **idempotent on client_id**; `kind='photo'` → `FEATURE_OFF` in R1.0 | 60/min, 1000/day |
| `mark_chat_read` / `set_chat_mute` / `hide_chat` | `chat_id, …` | void | — | — |
| `propose_meetup` | `chat_id, spot_id?, custom_place?, starts_at` | meetup | now+15 min ≤ starts_at ≤ now+14 d; cancels previous active in the same tx | 20/day |
| `confirm_meetup` | `meetup_id` | void | other party | — |
| `checkin_meetup` | `meetup_id` | void | start −60 … +60 min | — |
| `running_late` | `meetup_id, minutes` | void | 5/10/15/30 | — |
| `cancel_meetup` | `meetup_id, reason` | void | — | — |
| `create_meetup_share` | `meetup_id` | `{url}` | 22-char token; expires start + 24 h | 10/day |
| `get_meetup` / `get_chat_meetup` | `meetup_id` / `chat_id` | meetup (or null) | participants (DEC 62) | — |
| `report_noshow` | `meetup_id, note` | void | reporter checked in; ≥ start+20 min; other not checked in → else `MEETUP_WINDOW` | — |
| `confirm_deal` | `chat_id, outcome` | void | `done` / `not_yet` / `fell_through` (listing back to active) | — |
| `get_my_rating` | `chat_id` | `{mine, theirs, theirs_waiting}` | theirs only once revealed (DEC 63) | — |
| `submit_rating` | `chat_id, thumbs_up, tags, comment` | void | participant; outcome done or ≥24 h after meetup; `check_text` | — |

**Safety**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `create_report` | `target_type, target_id, reason, details` | `{id}` | resolves `target_user_id` + `evidence` snapshot; `ALREADY_REPORTED`; 3 open reports from distinct reporters aged >7 d hold a Quad post or reply (0227) | 20/day |
| `get_my_report` | `id` | `{status, timeline[]}` (generic outcome only) | reporter | — |
| `block_user` / `unblock_user` | `user_id` | void | not self; blocks chats | 50/day |
| `create_appeal` | `subject_type, subject_id, reason_choice, body` | `{id}` | own subject; `ALREADY_APPEALED` | 5/day |

**Notifications**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `get_notifications` | `cursor` | list | — | — |
| `mark_notifications_read` | `ids bigint[]?` | void | null = all | — |
| `unread_count` | — | int (the caller's unread notifications; the bell badge, DEC 120) | — | — |
| `update_notification_prefs` | `prefs jsonb` | prefs | known keys only | — |
| `register_push_token` | `token, platform, app_version` | void | `ExponentPushToken[…]` format; upsert `last_seen_at` | 20/day |
| `disable_push_token` | `token` | void | — | — |

**Feed likes and comments (`0233`, DEC 121):** every write calls `require_active` and the post must be on the caller's campus (else `NOT_FOUND`).

| RPC | Args | Returns | Rules | Rate |
|---|---|---|---|---|
| `like_listing` | `listing_id, liked` | `{like_count, liked}` | idempotent; likes notify the owner in the bell only (grouped, no push) | `listing_like` 300/h |
| `get_listing_comments` | `listing_id, sort 'top'\|'new', cursor` | `{items[] (each with first 2 replies), next_cursor, comment_count, like_count, liked, comments_enabled, can_comment, is_owner, title, kind}` | hides blocked people both ways; held shows only to its author | 600/h |
| `get_comment_replies` | `comment_id, cursor` | `{items[], next_cursor}` | oldest first, 50 a page, keyset `{created_at,id}` | shares 600/h |
| `create_listing_comment` | `listing_id, body ≤500, parent_id?, client_id` | `{status live\|held\|blocked, reason, comment}` | idempotent on `client_id`; a reply to a reply joins the top comment; `FORBIDDEN:closed` / `FORBIDDEN:comments_off`; contact details block, review words hold (system report) | `listing_comment` 30/h |
| `like_listing_comment` | `comment_id, liked` | `{like_count, liked}` | live comments only; bell only | `listing_like` 300/h |
| `delete_listing_comment` | `comment_id` | void | the author or the post's author; keeps the row (`deleted`, body cleared) | — |
| `set_listing_comments` | `listing_id, enabled` | bool | the post's author only | — |

`create_report` takes `target_type 'listing_comment'` (Quad reasons); 3 settled reporters hold the comment. `admin_resolve_report` on a comment: dismiss puts a held comment back, any other action removes it.

**[R1.1] Quad RPCs:** `get_quad_status`, `get_my_quad_mutes` (DEC 77), `get_quad_feed`, `get_quad_thread`, `create_quad_post`, `create_quad_reply`, `vote_quad`, `vote_poll`, `hide_quad_author`, `unhide_quad`, `get_my_quad_hides`, `set_quad_replies`, `delete_quad_post`, `get_my_quad`, `mute_keyword`, `unmute_keyword`, `accept_quad_rules`. `get_quad_feed(sort, cursor)` pages by keyset: pass back `next_cursor` as is (opaque; an old `{offset}` still works; DEC 101).
- Contracts are as in `docs/archive/blueprint-v0/backend.md` §4.
- The feed rank is computed at read (BE-08).
- They return `FEATURE_OFF` unless `campuses.quad_enabled`.
- They **never return author ids** (T-INT-QUAD-ANON).

## 4. Admin RPCs (`public.admin_*`, ADR-012)

Every admin RPC checks `require_admin(min)` (AAL2) and inserts exactly one `audit_log` row (actor, action, target, reason). All take a required `reason text`, except the read-only ones.

| RPC | Min role | Purpose | Release |
|---|---|---|---|
| `admin_overview(campus_id)` | moderator | open reports, KPIs | R1.0 |
| `admin_list_reports(filters, cursor)` / `admin_report_detail(id)` | moderator | queue + evidence | R1.0 |
| `admin_resolve_report(id, action, note)` | moderator (ban → owner) | `dismiss`, `remove_content`, `warn`, `strike`, `suspend(≤7d)`, `ban` | R1.0 |
| `admin_list_users(filters, cursor)` / `admin_user_detail(id)` | moderator | — | R1.0 |
| `admin_set_user_status(user_id, status, until, reason)` | moderator ≤7 d / owner | calls the `revoke-sessions` function | R1.0 |
| `admin_clear_strike(id)` / `admin_force_reverify(user_id)` | moderator | — | R1.0 |
| `admin_change_email(user_id, new_email)` / `admin_change_email(user_id, new_email, reason)` | owner | recovery (PM-03); calls the `admin-change-email` function. The console uses the reason overload (0209): the reason (3+ characters) goes to the audit row | R1.0 |
| `admin_set_listing_status(id, status)` | moderator | approve held, remove, restore | R1.0 |
| `admin_read_reported_chat(report_id)` | moderator | returns messages only if the report targets that chat or a message in it | R1.0 |
| `admin_decide_appeal(id, decision, note)` | moderator | restore + clear strike or uphold | R1.0 |
| `admin_update_campus(id, patch)` | owner | status, threshold, dials | R1.0 |
| `admin_upsert_domain(domain, campus_id, kind)` / `admin_delete_domain` | owner | — | R1.0 |
| `admin_upsert_safe_spot(...)` | owner | designation requires `designated_on` for police | R1.0 |
| `admin_set_config(key, value)` | owner | flags, min versions, `rules_version`, maintenance | R1.0 |
| `admin_list_audit(filters, cursor)` | moderator | — | R1.0 |
| `admin_list_appeals(filters, cursor)` | moderator | open appeals queue (DEC 69) | R1.0 |
| `admin_list_campuses()` / `admin_get_config()` | moderator | campus setup and flags, read-only for moderators (DEC 69) | R1.0 |
| `admin_whoami()` | any signed-in user | `{admin, role, campus_id, aal, name}` for the console gate (DEC 69) | R1.0 |
| `admin_metrics_funnel` / `_retention` / `_liquidity` / `_safety` | moderator | — | R1.1 (UI); views in R1.0 |
| `admin_invite_admin(email, role, campus)` / `admin_remove_admin` | owner | — | R1.1 |
| `admin_create_announcement(...)` | owner | max 1 per 7 d per campus | R1.1 |
| `admin_upsert_banned_word` / `admin_delete_banned_word` | owner | — | R1.1 (UI); R1.0 via migration |
| `admin_approve_quad` / `admin_remove_quad` / `admin_reveal_quad_author(post, case_ref, reason)` | moderator / owner (reveal: re-MFA, 5/day, receipt email) | — | R1.1 |

### 4.1 Admin v2 RPCs (`0207`, `0208`; DEC 93)

Same rules as above: `require_admin` (AAL2), moderators scoped to their campus (a moderator passing another campus gets `NOT_ADMIN`; `campus_id` null means "my campus" for a moderator and "all campuses" for the owner), every write takes a `reason` (3+ characters, else `INVALID:reason`) and writes exactly one `audit_log` row. Errors: `NOT_ADMIN`, `NOT_FOUND`, `INVALID:<field>`.

**Access log.** Every read that shows one named student writes an `audit_log` row: action `person.view`, target (`user`, id), reason `view`, `meta.tab` (`overview`, `activity`, `timeline`, `offers`, `listings`, `chats`, `meetups`, `reports`). `admin_person` always logs; the tab reads log unless the same admin already has a `person.view` row for that person in the last 30 minutes. `admin_listing_activity` logs `listing.activity_view` (target `listing`). `admin_support_detail` logs `support.view`. Lists, overview, search and `admin_person_access_log` don't log.

**No message text, ever.** Chats and messages appear as counts and times only; reading words still needs `admin_read_reported_chat`.

**Common shapes.** `Person = {id, display_name, initial}` (null when the account is gone). `ListingBrief = {id, title, price_cents, status, photo}` (`photo` is the first thumb key, or null). `CampusBrief = {id, name, short_name, slug, status}`. Emails: the full address for the owner, `a••••@domain` for moderators. Offset-paged lists take `cursor int` (0, 50, ...) and return `next_cursor` (null at the end); keyset lists take/return `cursor {at, id}`.

| RPC (args) | Min role | Returns |
|---|---|---|
| `admin_overview_v2(campus_id uuid = null)` | moderator | `{campus_id, timezone, generated_at, kpis, needs_attention, campuses}`. `kpis`: `students {value, new_7d, series[14]}` (members not banned, waitlisted included), `active_today {value, same_day_last_week, series[14]}` (from `activity_days`), `listings_live {value, new_7d, series[14]}` (active or hold), `offers_today {value, same_day_last_week, series[14]}` (same time of day last week), `deals_7d {value, agreed_cents, prev_7d, series[14]}`, `open_reports {value, priority, oldest_at}`. Series are daily counts, oldest first, in the campus time zone (America/New_York when all campuses). `needs_attention`: `{reports: [{id, reason, priority, target_type, campus: CampusBrief, created_at}] (10 oldest open), held_listings, quad_held, support_open, appeals_open}`. `campuses: [{id, name, short_name, slug, status, is_demo, students (not banned, not waitlisted), waitlist (waitlisted members + untold waitlist requests), unlock_threshold, live_listings, deals_7d}]` |
| `admin_activity_feed(campus_id uuid = null, kinds text[] = null, user_id uuid = null, listing_id uuid = null, since timestamptz = null, until timestamptz = null, cursor jsonb = null, "limit" int = 50)` | moderator | `{items: Event[], next_cursor: {at, id} \| null}`, newest first, limit 1 to 200. `Event = {id, kind, at, person: Person, other: Person \| null, listing: ListingBrief \| null, campus_id, details, platform}`. Kinds: `signup`, `listing_posted`, `swiped_left`, `saved`, `unsaved`, `offer_made`, `offer_countered`, `offer_accepted`, `offer_declined`, `chat_opened`, `message_sent`, `meetup_set`, `meetup_confirmed`, `meetup_checked_in`, `meetup_no_show`, `deal_done`, `listing_viewed`, `searched`, `opened_from`, `app_open`, `deck_shown`. No `kinds` = all but `deck_shown`. `details` by kind: offers `{offer_id, amount_cents, asking_cents, round, status?}`; chats `{chat_id, agreed_cents}`; messages `{chat_id, message_kind}`; meetups `{meetup_id, starts_at, place, status?}`; no-show `{meetup_id, status}`; deal `{agreed_cents, asking_cents, chat_id}`; posted `{price_cents, kind, status}`; saved `{price_at_save}`; app events `{source?, dwell_ms?, query?, app_version?}`; signup `{year}`. `person` is who acted (for offer answers: the side that answered; for deals: the seller). `user_id` matches the person or the other side, and logs a `person.view` (tab `activity`). Offers keep one row per offer, so a counter shows the latest amount |
| `admin_person(user_id uuid)` | moderator (their campus) | `{person, counts, affinity, hourly, blocks}`. `person`: `{id, display_name, first_name, initial, status, status_reason, paused_until, year, avatar_path, campus: CampusBrief, email, email_masked, joined_at, last_active_at, last_platform, last_app_version, age_method, adult_confirmed_at, verified_until, invited_by: Person, strikes, no_shows, admin_role, push_on, tips_on}`. `counts`: `{swipes, left, saves, offers_made, offers_received, deals, listings, chats, meetups, rating {up, down}, reports_on_them, reports_by_them, blocks_made, blocks_received}`. `affinity`: `[{category_id, slug, name, n, share}]` (share of right swipes, that is saves and offers, in whole percent). `hourly`: 24 counts, campus local hour, last 30 days. `blocks`: `{made: [Person & {at}], received: [Person & {at}]}`. Always logs |
| `admin_person_timeline(user_id uuid, kinds text[] = null, cursor jsonb = null, "limit" int = 50)` | moderator | same as `admin_activity_feed` for one person |
| `admin_person_offers(user_id uuid, cursor int = 0)` | moderator | `{items: [{id, role: buyer\|seller, other: Person, listing: ListingBrief, amount_cents, asking_cents, status, round, last_actor, created_at, responded_at, expires_at}], next_cursor}` |
| `admin_person_listings(user_id uuid, cursor int = 0)` | moderator | `{items: [ListingBrief & {kind, created_at, sold_at, views, saves, offers, left, reports}], next_cursor}` (not deleted) |
| `admin_person_chats(user_id uuid, cursor int = 0)` | moderator | `{items: [{id, role, other: Person, listing: {id, title, price_cents} (chat snapshot), agreed_cents, status, message_count, their_message_count, archived, last_message_at, created_at, closed_at, buyer_outcome, seller_outcome, reported}], next_cursor}`. No text |
| `admin_person_meetups(user_id uuid, cursor int = 0)` | moderator | `{items: [{id, chat_id, role, other: Person, listing: {id, title}, starts_at, status, place, spot_id, proposed_by_them, confirmed_at, their_check_in, other_check_in, no_shows: [{id, by_them, status, created_at}], created_at}], next_cursor}` |
| `admin_person_reports(user_id uuid)` | moderator | `{against: [{id, reason, status, priority, target_type, target_id, reporter: Person, action_taken, created_at, resolved_at}], by_them: [{id, reason, status, target_type, target_id, about: Person, created_at, resolved_at}], strikes: [{id, reason, report_id, created_at, expires_at, cleared_at}], appeals: [{id, subject_type, status, created_at, decided_at}], no_shows: [{id, meetup_id, status, by_them, other: Person, created_at}]}` |
| `admin_person_access_log(user_id uuid, cursor bigint = null)` | moderator | `{items: [{id, at, actor: Person, action, reason, case_ref, meta}], next_cursor: bigint \| null}`: every `audit_log` row with target (`user`, id), newest first, 100 per page. Not logged |
| `admin_listing_activity(listing_id uuid)` | moderator | `{listing, funnel, swipes, who_swiped, offers, views, price_history, comparison}`. `listing`: `ListingBrief & {kind, condition, description, category {id, slug, name}, seller: Person, campus: CampusBrief, created_at, bumped_at, sold_at, buyer: Person, expires_at, views, saves, offers, spots: [name], reports}`. `funnel`: `{shown (distinct people with deck_shown), viewed, saved, offered (distinct buyers), sold (bool)}`. `swipes`: `{right (distinct people who saved or offered), left, hidden}`. `who_swiped`: `[{person, direction: offered\|saved\|left, at, dwell_ms, viewed_first, offer: {id, amount_cents, status, round} \| null, saved}]` (one row per person, strongest direction). `offers`: `[{id, buyer, amount_cents, status, round, last_actor, created_at, responded_at}]`. `views`: `[{person, at, dwell_ms, source, platform}]` (latest 100). `price_history`: `[{old_cents, new_cents, at}]`. `comparison`: `{right_rate, category_right_rate, category_swipes}` (percent with one decimal or null; the category rate covers the same campus and category, listings posted in the last 90 days). Logs `listing.activity_view` |
| `admin_list_users_v2(filters jsonb = '{}', cursor int = 0)` | moderator | `{items: [{id, display_name, initial, status, campus: CampusBrief, email, year, avatar_path, swipes, offers, deals, reports, strike_count, noshow_count, joined_at, last_active_at, last_platform}], total, next_cursor}`. Filters: `q` (name contains; the owner can also match an exact email, DEC 69(c)), `status`, `campus_id`, `year`, `sort` = `last_active` (default) \| `joined` \| `name` \| `reports` (else `INVALID:sort`) |
| `admin_list_audit_v2(filters jsonb = '{}', cursor bigint = null)` | moderator | `{items: [{id, at, actor: Person, action, target_type, target_id, target_label, campus_id, reason, case_ref, meta}], next_cursor}`. Filters: `actor_id`, `action` (prefix), `target_type`, `target_id`, `since`, `until`. 100 per page; moderators see their campus's rows |
| `admin_search(q text)` | moderator | `{people: [Person & {status, campus, email}], listings: [ListingBrief & {campus}], reports: [{id, reason, status, target_type, created_at}]}`, 8 each. People by name (owner: or exact email), listings by title, reports by id prefix. `q` 2 to 80 characters |
| `admin_list_support(status text = 'open', campus_id uuid = null, cursor int = 0)` | moderator (requests whose email domain is their campus) | `{items: [{id, email, topic, status, campus: CampusBrief \| null, created_at, handled_at, replied_at, reply_count, preview}], next_cursor}`, oldest first. `status`: `open` \| `answered` \| `closed` \| `all` |
| `admin_support_detail(id uuid)` | moderator | the item above with `body, staff_note, updated_at, updated_by: Person, person: Person \| null` (the account with that email) instead of `preview`. Logs `support.view` |
| `admin_update_support(id uuid, status text, reason text, note text = null, reply text = null)` | moderator | the detail shape. `reply` (up to 2000) queues a `support_reply` email to the request's address and moves `open` to `answered`; `note` (up to 1000) is a staff note. Audit `support.update` `{status, replied}` |
| `admin_waitlist_demand()` | moderator (own campus's domains) | `{schools: [{domain, school_guess, campus: (CampusBrief & {unlock_threshold}) \| null, requests, members_waiting, total, newest_at}], total_requests}`, most demand first. Requests = waitlist sign-ups not yet told; members = waitlisted accounts with that domain |
| `admin_open_campus(campus_id uuid, reason text)` | owner | `{opened, members_activated}`; waitlist campuses only (`INVALID:status`). Same path as the automatic unlock: members let in, `campus_unlocked` pushes, `campus_open` emails. Audit `campus.open` |
| `admin_create_campus(name, short_name, slug, timezone, domain text, status text = 'waitlist', spot jsonb = null, reason text = null)` | owner | `{id, slug, spot_id}`. Validates name (3 to 100), short name (2 to 40), slug (`^[a-z0-9-]{2,40}$`, `INVALID:slug_taken`), a real time zone, domain format and `INVALID:domain_taken`; status `waitlist` \| `live` \| `paused`. `spot`: `{name, lat, lng, description?, hours?, designation?, designated_on?}` becomes the default Meetup spot. Audit `campus.create` |
| `admin_list_meetups(campus_id uuid = null, "when" text = 'upcoming', cursor int = 0)` | moderator | `{items: [{id, chat_id, starts_at, status, place, spot_id, campus_id, buyer: Person, seller: Person, listing: {id, title}, confirmed_at, buyer_here_at, seller_here_at, no_show_reports}], next_cursor}`. `upcoming`: proposed or confirmed from 2 h ago, soonest first; `past`: newest first |
| `admin_noshow_summary(campus_id uuid = null)` | moderator | `{totals: {open, confirmed, rejected} (180 d), people: [Person & {status, noshow_count, reports_open, reports_confirmed, last_at}]}` (top 50) |
| `admin_ratings_summary(campus_id uuid = null)` | moderator | `{totals: {up, down}, low_rated: [Person & {status, up, down, total, pct_up}] (3+ ratings and under 70% up), recent_down: [{id, rater, ratee, tags, comment, chat_id, created_at}] (20)}` |
| `admin_age_blocks_summary(campus_id uuid = null, days int = 30)` | moderator | `{total, all_time, by_campus: [{campus: CampusBrief \| null, n}], by_day: [{day, campus_id, n}]}`. No hashes |
| `admin_list_deletions_exports(cursor int = 0)` | owner | `{counts: {deletions_30d, underage_30d, stuck, exports_30d, exports_failed_30d}, deletions: [{id, user_id, person, campus, underage, status, stuck, started_at, finished_at}], exports: [{id, person, status, created_at, expires_at}], next_cursor}`. `stuck` = still running after 1 h |
| `admin_system_health()` | owner | `{generated_at, email: {pending, oldest_pending_at, sent_24h, failed_24h, failed_total, recent_errors: [{id, template, to (masked), state, attempts, error, at}]}, push: {tickets_24h, errors_24h, pending, recent_errors: [{id, status, error, at}]}, cron: [{jobname, schedule, active, last_run: {status, start_time, end_time, message} \| null, failures_24h}], storage: {db_bytes, db_limit_bytes (500 MB), tables: [{name, bytes, rows_estimate}] (12 largest)}, reports: {open, oldest_open_at}, deletions_stuck}` |
| `admin_list_review_accounts()` | owner | `[{email, note, user_id, has_account, last_sign_in_at, campus}]` |
| `admin_upsert_review_account(email, note, reason text)` / `admin_delete_review_account(email, reason text)` | owner | void. Addresses are stored lowercase; the sign-up hook admits them; a note containing "reviewer" marks the reviewer for `demo_autoplay` (the others are the Demo University bots). Audit `review_account.upsert` / `.delete` |
| `admin_bulk_set_listing_status(ids uuid[], status text, reason text)` | moderator (all ids on their campus, else `NOT_ADMIN`) | `{changed, changed_ids, skipped_ids}`. 1 to 200 ids (`INVALID:ids`). `removed` (any but deleted or removed; winds down offers and chats), `held_review` (from active or hold), `active` (from held_review or removed). One audit row `listing.bulk_<status>` with `meta {ids, skipped, count}` |
| `admin_list_banned_hashes(cursor int = 0)` | owner | `{items: [{email_hash, created_at, person: (Person & {status}) \| null}], total, next_cursor}` |
| `admin_upsert_banned_hash(email, reason text)` / `admin_delete_banned_hash(email_hash, reason text)` | owner | `{email_hash, added}` / void. Added by email (hashed with the pepper, never stored plain). Audit `banned_hash.add` / `.delete` |
| `admin_upsert_category(id smallint, name text, sort smallint, reason text, slug text = null, parent_id smallint = null)` | owner | the category row. Rename, reorder, move; a new id needs a slug; an existing slug never changes. No hide yet (the app reads `categories` directly). Audit `category.create` / `.update` |

**Alerts.** Priority-1 reports (threat, self_harm, minor_safety) email every owner at once (`priority_report`, `trg_reports_ai`, 0011). The `report_queue_check` job (every 30 min) emails every owner a `report_queue` message `{open, oldest_hours}` when the oldest open report is older than 4 hours, at most once per 4 hours.

## 5. Edge Functions (`supabase/functions/<name>/index.ts`)

| Name | Trigger / auth | Input → Output | Rules |
|---|---|---|---|
| `upload-url` | POST, user JWT | `{kind:'listing'\|'avatar'\|'share', target_id, files:[{idx, variant, type, size}]}` → `[{key, url, headers}]` | `can_upload` check; sizes and types per DATA_MODEL §6; **signs content-length + content-type** (SEC-02); ≤16 files; 60/h. `chat`/`quad` kinds in R1.1 |
| `send-push` | cron (service) | — → `{sent, skipped}` | claims ≤500 due rows with `for update skip locked` → `sending`; prefs, quiet hours (campus TZ), cap 6/day non-urgent, time-sensitive bypass; batches of 100 to Expo; tickets; `DeviceNotRegistered` → disable token; resets stuck `sending` > 10 min |
| `push-receipts` | cron | — | check tickets > 15 min old; disable bad tokens |
| `send-email` | cron | — | claims ≤50 outbox rows (skip locked); global 150/day counting rows in flight, `priority_report` first, `campus_open` last (DEC 109); templates; provider by `EMAIL_PROVIDER` (`gmail_smtp` port 465 \| `resend`) |
| `delete-account` | POST, user JWT (or internal `mode=underage`) | `{confirm:'DELETE'}` → `{ok}` | 1) move photo keys referenced by open reports to `onlyswap-private/evidence/` (BE-02); 2) delete R2 prefixes `c/*/u/{uid}/`, listing folders of own listings, and the person's archived chats `onlyswap-private/archive/chats/{chat}.json` (B-03, DEC 119); 3) close own open chats with a system message; 4) if banned → `banned_hashes`; 5) `auth.admin.deleteUser`; 6) queue `account_deleted` (not underage); 7) PostHog person delete via API; 3/day |
| `export-data` | POST, user JWT | → `{status:'queued'}` | JSON of profile, listings, offers, messages, ratings, saved, prefs, activity events (DEC 119) → private bucket → 7-day presigned link by email; 1/day |
| `revoke-sessions` | internal (service) | `{user_id}` | `auth.admin.signOut(user_id, 'global')` (ARC-01) |
| `admin-change-email` | internal (service, called by the admin RPC via pg_net) | `{user_id, new_email}` | `auth.admin.updateUserById(email, email_confirm:false)` → user confirms with a code |
| `waitlist-request` | POST, anon | `{email, turnstile_token?}` → `{ok}` | Turnstile on web; IP limit 5/h; uniform response (SEC-12) |
| `support-request` | POST, anon | `{email, topic, body, turnstile_token}` → `{ok}` | Turnstile; 3/h/IP; emails owner |
| `cleanup-drafts` | internal (service, called by the `prune` cron job via pg_net) | `{}` → `{ok, drafts, objects, failed}` | orphan reservations (never posted, > 24 h): delete `c/{campus}/l/{id}/` in R2, then `forget_reservations`; a failed delete keeps the row for the next run (P5-SELL-07) |
| `campus-unlock` | internal | `{campus_id}` | queue pushes + `campus_open` emails (drip) |
| `health` | GET, anon | → `{db:'ok'}` | UptimeRobot |
| `test-inbox` | **staging only** | `?email=` → `{code}` | secret header; CI asserts absent in prod |

## 6. Cron (`0090_cron.sql`)

Every job that calls a function has an exists-guard (ARC-05).

| Job | Schedule (UTC) | Action |
|---|---|---|
| `notify_push` | `* * * * *` | if due pending rows exist → `send-push` |
| `push_receipts` | `*/15 * * * *` | `push-receipts` |
| `email_drain` | `*/5 * * * *` | if pending outbox → `send-email` |
| `expire_offers` | `*/5 * * * *` | pending/countered past `expires_at` → expired |
| `expire_listings` | `*/10 * * * *` | food past `expires_at`; 60-day sale/free/wanted → expired |
| `meetup_reminders` | `*/5 * * * *` | confirmed, starting in 25–35 min, not reminded |
| `deal_checks` | `*/15 * * * *` | confirmed meetups started ≥2 h → `deal_check` |
| `noshow_autoconfirm` | `0 * * * *` | open reports > 24 h without an appeal → confirm; `noshow_count++`; pause at threshold |
| `stale_listings` | `0 21 * * *` | 7 d, 0 offers, not nudged → `listing_stale` (tips pref only) |
| `reverify_reminders` | `0 14 * * *` | `verified_until` in 14 d / 1 d → push + email |
| `reverify_enforce` | `30 14 * * *` | `verified_until` < today → status reverify |
| `pause_lift` | `*/10 * * * *` | `paused_until` passed → active |
| `refresh_stats` | `*/10 * * * *` | profile_stats (concurrently) |
| `refresh_hints` | `0 * * * *` / `0 9 * * *` | trending terms hourly; price hints daily |
| `prune` | `30 9 * * *` | retention table in DATA_MODEL §5; draft R2 cleanup (via function) |
| `archive_chats` | `0 10 * * *` | closed > 90 d → archive JSON to R2 → delete messages |
| `strike_expiry` | `0 11 * * *` | expired strikes → count-- |
| `reset_stuck_sends` | `*/5 * * * *` | `sending` > 10 min → `pending` (push + email) |
| `demo_autoplay` | `* * * * *` | Demo University bot (reviewers) |
| `rating_reveal` | `0 * * * *` | one-sided ratings reaching 7 days (0205) |
| `prune_activity` | `45 9 * * *` | `activity_events` > 90 d, `account_deletions` > 365 d (DEC 93) |
| `prune_cron_history` | `50 9 * * *` | `cron.job_run_details` > 7 d (unfinished runs kept; DEC 110) |
| `report_queue_check` | `*/30 * * * *` | oldest open report > 4 h → `report_queue` email to owners, at most once per 4 h (DEC 93) |

## 7. Notification catalog — R1.0 (21 types)

| Type | Group | TS* | Pref | Push text (preview-safe) | Dedupe key |
|---|---|---|---|---|---|
| offer_new | offers | ✓ | offers | "Maya offered $35 on your mini fridge" | `offer_new:{offer}:{round}` |
| offer_accepted | offers | ✓ | offers | "Devin accepted your offer. Say hi and plan the pickup." | `offer_accepted:{offer}` |
| offer_countered | offers | ✓ | offers | "Devin countered at $38 on the mini fridge" | `offer_countered:{offer}:{round}` |
| offer_declined | offers | | offers | "Your offer on the desk chair wasn't accepted" / the wind-down reason: "This item sold to someone else", "This listing was removed" or "The seller removed this listing" (DEC 99) | `offer_declined:{offer}` |
| offer_expired | offers | | offers | "Your $30 offer on the desk chair expired" | `offer_expired:{offer}` |
| message_new | messages | | messages | previews on: "Aisha: can we do 4:30?"; off: "New message from Aisha" | `message_new:{chat}:{minute}` |
| meetup_proposed | meetups | ✓ | meetups | "Aisha suggested 4:30 PM at the Rec Center" | `meetup_proposed:{meetup}` |
| meetup_confirmed | meetups | ✓ | meetups | "Meetup set: today 4:30 PM" | `meetup_confirmed:{meetup}` |
| meetup_reminder | meetups | ✓ (ignores quiet hours) | meetups | "Meet Aisha at the Rec Center at 4:30 PM" | `meetup_reminder:{meetup}` |
| meetup_status | meetups | ✓ | meetups | "Aisha is here" / "Aisha is running 10 min late" | `meetup_status:{meetup}:{event}` |
| meetup_changed | meetups | ✓ | meetups | "Aisha moved your meetup to 5:00 PM" / "Aisha cancelled the meetup" | `meetup_changed:{meetup}:{n}` |
| deal_check | meetups | | meetups | "Did the monitor sell?" | `deal_check:{chat}` |
| rate_prompt | meetups | | meetups | "How was swapping with Aisha?" | `rate_prompt:{chat}` |
| saved_search_match | alerts | | saved_search | "New: Trek bike for $95 (matches 'bike')" | `ssm:{search}:{listing}` |
| price_drop | alerts | | price_drop | "Desk chair you saved is now $30" | `price_drop:{listing}:{cents}` |
| watch_available | alerts | | saved_search | "The lamp is available again" | `watch:{listing}:{date}` |
| listing_stale | selling | | **tips (opt-in)** | "No offers on your lamp yet. Drop the price?" | `stale:{listing}` |
| listing_removed | selling | | always (moderation) | "OnlySwap removed Desk lamp. Reason: {admin reason}" (DEC 96; from admin_set_listing_status, admin_bulk_set_listing_status, admin_resolve_report remove_content; `data.listing_id`) | `listing_removed:{listing}:{txid}` |
| listing_restored | selling | | always | "Desk lamp is live again." (an admin put a removed listing back) | `listing_restored:{listing}:{txid}` |
| report_update | safety | | always | "We reviewed your report" | `report:{id}:{status}` |
| appeal_decided | account | | always | "Your appeal was reviewed" | `appeal:{id}` |
| account_notice | account | | always | "Your account is paused until Oct 2" | `acct:{user}:{event}:{date}` |
| reverify_due | account | | always | "Confirm you're still a student" | `reverify:{user}:{date}` |

\*TS = time-sensitive (iOS `interruptionLevel`; needs the entitlement, MOB-02).

**Global rules:**
- Max 6 non-time-sensitive pushes per user per day.
- Quiet hours (campus TZ, default 23:00–08:00) skip non-TS pushes; they stay in the in-app list.
- Android channels = groups.
- Tap routes come from `data.url`.

**[R1.1] additions:** `wanted_match`, `campus_unlocked` (with the waitlist and Around campus, DEC-13), `quad_reply`, `quad_milestone`, `announcement_safety`, `announcement_news` (tips), `free_food` (pref `free_food`), `rating_revealed`.

**Feed comments (DEC 121), group `comments`, pref `comments` (on by default):** `listing_comment` (to the post's author) and `comment_reply` (to the comment's author) push, deduped per post per hour; `listing_like` and `comment_like` are bell only (`push_state 'skipped'`), one unread row per target updated in place. All four open `/listing/[id]/comments`.

## 8. Workers and Pages Functions

| Name | Path | Logic |
|---|---|---|
| `workers/media` | `media.<acct>.workers.dev/*` (Plan B `img.<domain>`) | GET R2 key under allowlisted prefixes (`c/`, `share/`); `Cache-Control: public, max-age=31536000, immutable`; `X-Content-Type-Options: nosniff`; type from extension; 404 otherwise; best-effort per-IP limit (SEC-05) |
| `apps/site/functions/l/[id].ts` | `/l/:id` | `get_listing_public_card` → HTML with OG + a blurred sign-in wall; `noindex` |
| `apps/site/functions/m/[token].ts` | `/m/:token` | `get_meetup_share` → status page, auto-refresh 60 s, `no-store`, `noindex` |
| `apps/site/functions/i/[code].ts` | `/i/:code` | `get_invite` → landing + store badges + install referrer `invite={code}` |
