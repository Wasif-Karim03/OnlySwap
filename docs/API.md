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
| `LISTING_UNAVAILABLE` | not active / not open to offers |
| `OFFER_NOT_PENDING` | state changed |
| `ALREADY_REPORTED` | duplicate open report |
| `ALREADY_APPEALED` | appeal exists |
| `MEETUP_WINDOW` | action outside allowed time |
| `CHAT_CLOSED` / `CHAT_BLOCKED` | cannot send |
| `NOT_ADMIN` | admin check failed (role or AAL) |
| `SCHOOL_UNKNOWN` / `DOMAIN_BLOCKED` / `AGE_BLOCKED` / `BANNED` | auth hook rejections (surface via Auth error message) |
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
| `private.email_hash(email) → text` | sha256(lower(email) ‖ pepper from Vault) |
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
| `private.hook_before_user_created(event jsonb)` | Auth hook | 1. `email_hash` in `age_blocks` → `AGE_BLOCKED`. 2. In `banned_hashes` → `BANNED`. 3. Email in `review_accounts` → allow. 4. `campus_domains` lookup: missing → `SCHOOL_UNKNOWN`; `blocked` → `DOMAIN_BLOCKED`. 5. Allow. |
| `private.hook_custom_access_token(event jsonb)` | Auth hook | claims `campus_id`, `status`, `adult`, `admin_role` |
| `on_auth_user_created` | after insert `auth.users` | create profile (campus, status waitlist if campus not live, `verified_until`, `invited_by` from metadata `invite_code`), `notification_prefs` row |
| `on_auth_user_email_changed` | after update of email | re-resolve campus by domain (Change school, email-access recovery) |
| `trg_profiles_waitlist` | after insert profiles | members ≥ threshold and campus waitlist and not launch-controlled → `unlock_campus` |
| `trg_listings_ai` | after insert listings | queue `saved_search_match` (≤1 per search per 2 h), `wanted_match` (open wanted in the same category, ≤1 per poster per day), founding-seller flag |
| `trg_listings_price` | after update of `price_cents` | log change; drop ≥5% → `price_drop` to savers (dedupe `price_drop:{listing}:{new_cents}`) |
| `trg_listings_status` | after update of status | hold→active: `watch_available`; sold/deleted/removed: auto-decline open offers, close other chats with a system message (BE-11) |
| `trg_offers_notify` | after insert/update offers | `offer_new` / `offer_countered` / `offer_accepted` / `offer_declined` / `offer_expired` with `dedupe_key = type:{offer}:{round}` |
| `trg_messages_ai` | after insert messages | update chat `last_message_at`; `realtime.broadcast_changes('chat:'‖id)`; `realtime.send('user:'‖other, 'inbox')`; queue `message_new` (preview only if the recipient's `message_previews`; collapse via `dedupe_key = message_new:{chat}:{minute}`) |
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
| `get_feed` | `cursor jsonb, limit int=20` | `FeedItem[]` | excludes own, swiped 30 d, blocked, deleted; <5 results → `daily_counters.feed_exhausted++` | 120/h |
| `record_swipes` | `items jsonb` (≤50: `{listing_id, dir, at}`) | void | upsert; unknown ids ignored | 60/h |
| `undo_swipe` | `listing_id` | void | within 60 s | — |
| `save_listing` / `unsave_listing` | `listing_id` | `{save_count}` | not own; same campus | 200/day |
| `hide_listing` | `listing_id` | void | = permanent left | — |
| `watch_listing` | `listing_id` | void | listing on hold | — |
| `record_view` | `listing_id` | void | once/user/day | — |
| `get_listing` | `id` | `FeedItem & {access}`; `{id, access}` when not visible | access: buyer, owner, gone, blocked, other_campus (DEC 57) | 600/h |
| `get_campus_feed` | `kind text?, cursor` | items (free, wanted, food, new) | — | 120/h |
| `search_listings` | `q, filters, cursor` | listings | `websearch_to_tsquery`; trigram fallback; unknown filter keys → `INVALID:filters` | 120/h |
| `search_suggest` | `q` (≥2) | `[{type, label, count}]` | — | 600/h |
| `create_saved_search` / `update_saved_search` / `delete_saved_search` | … | row | max 20 | 30/day |
| `saved_search_new_counts` | — | `[{id, new_count}]` | — | — |
| `list_saved_searches` | — | `SavedSearch[]` | newest first (DEC 58) | — |
| `get_saved` | — | `(FeedItem & {price_at_save, saved_at})[]` | active, hold, sold (DEC 59) | — |
| `get_profile` | `user_id` | profile + listings + reviews, or `{id, access}` | access ok, me, blocked, gone (DEC 59) | 600/h |
| `price_hint` | `category_id` | `{p25,p50,p75}` or null | n≥5 | — |
| `check_text` | `text, scope` | `{result, term}` | inline UX only | 600/h |
| `reserve_listing_id` | — | `uuid` | — | 30/day |
| `create_listing` | `id, kind, title, description, category_id, condition, price_cents, open_to_offers, photos jsonb, meet_spot_ids, meet_note, availability, wanted_max_cents, wanted_ref, food_minutes, pickup_by` | listing | id must be reserved by the caller; **idempotent** (`on conflict (id) do nothing`, returns existing); photos 1–8 (sale/free), 0–1 (wanted/food); path prefix check; `BANNED_TERM`; review → `held_review`; price ≤ 200000; food ≤ 180 min; `pickup_by` (free only, today…+14 d) sets the expiry (DEC 54) | 20/day (3 in first 24 h); wanted 5/day; food 3/day |
| `update_listing` | `id, …` | listing | seller; not sold/deleted; price change logged | 50/day |
| `delete_listing` | `id` | void | **soft**: status `deleted`, `deleted_at`; auto-declines, closes chats | — |
| `relist_listing` | `id, price_cents` | listing | expired or fell-through; bump once / 7 d | — |
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
| `create_report` | `target_type, target_id, reason, details` | `{id}` | resolves `target_user_id` + `evidence` snapshot; `ALREADY_REPORTED` | 20/day |
| `get_my_report` | `id` | `{status, timeline[]}` (generic outcome only) | reporter | — |
| `block_user` / `unblock_user` | `user_id` | void | not self; blocks chats | 50/day |
| `create_appeal` | `subject_type, subject_id, reason_choice, body` | `{id}` | own subject; `ALREADY_APPEALED` | 5/day |

**Notifications**

| RPC | Args | Returns | Errors / rules | Limit |
|---|---|---|---|---|
| `get_notifications` | `cursor` | list | — | — |
| `mark_notifications_read` | `ids bigint[]?` | void | null = all | — |
| `unread_count` | — | int | — | — |
| `update_notification_prefs` | `prefs jsonb` | prefs | known keys only | — |
| `register_push_token` | `token, platform, app_version` | void | `ExponentPushToken[…]` format; upsert `last_seen_at` | 20/day |
| `disable_push_token` | `token` | void | — | — |

**[R1.1] Quad RPCs:** `get_quad_feed`, `get_quad_thread`, `create_quad_post`, `create_quad_reply`, `vote_quad`, `vote_poll`, `hide_quad_author`, `unhide_quad`, `get_my_quad_hides`, `set_quad_replies`, `delete_quad_post`, `get_my_quad`, `mute_keyword`, `unmute_keyword`, `accept_quad_rules`.
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
| `admin_change_email(user_id, new_email)` | owner | recovery (PM-03); calls the `admin-change-email` function | R1.0 |
| `admin_set_listing_status(id, status)` | moderator | approve held, remove, restore | R1.0 |
| `admin_read_reported_chat(report_id)` | moderator | returns messages only if the report targets that chat or a message in it | R1.0 |
| `admin_decide_appeal(id, decision, note)` | moderator | restore + clear strike or uphold | R1.0 |
| `admin_update_campus(id, patch)` | owner | status, threshold, dials | R1.0 |
| `admin_upsert_domain(domain, campus_id, kind)` / `admin_delete_domain` | owner | — | R1.0 |
| `admin_upsert_safe_spot(...)` | owner | designation requires `designated_on` for police | R1.0 |
| `admin_set_config(key, value)` | owner | flags, min versions, `rules_version`, maintenance | R1.0 |
| `admin_list_audit(filters, cursor)` | moderator | — | R1.0 |
| `admin_metrics_funnel` / `_retention` / `_liquidity` / `_safety` | moderator | — | R1.1 (UI); views in R1.0 |
| `admin_invite_admin(email, role, campus)` / `admin_remove_admin` | owner | — | R1.1 |
| `admin_create_announcement(...)` | owner | max 1 per 7 d per campus | R1.1 |
| `admin_upsert_banned_word` / `admin_delete_banned_word` | owner | — | R1.1 (UI); R1.0 via migration |
| `admin_approve_quad` / `admin_remove_quad` / `admin_reveal_quad_author(post, case_ref, reason)` | moderator / owner (reveal: re-MFA, 5/day, receipt email) | — | R1.1 |

## 5. Edge Functions (`supabase/functions/<name>/index.ts`)

| Name | Trigger / auth | Input → Output | Rules |
|---|---|---|---|
| `upload-url` | POST, user JWT | `{kind:'listing'\|'avatar'\|'share', target_id, files:[{idx, variant, type, size}]}` → `[{key, url, headers}]` | `can_upload` check; sizes and types per DATA_MODEL §6; **signs content-length + content-type** (SEC-02); ≤16 files; 60/h. `chat`/`quad` kinds in R1.1 |
| `send-push` | cron (service) | — → `{sent, skipped}` | claims ≤500 due rows with `for update skip locked` → `sending`; prefs, quiet hours (campus TZ), cap 6/day non-urgent, time-sensitive bypass; batches of 100 to Expo; tickets; `DeviceNotRegistered` → disable token; resets stuck `sending` > 10 min |
| `push-receipts` | cron | — | check tickets > 15 min old; disable bad tokens |
| `send-email` | cron | — | claims ≤50 outbox rows (skip locked); global 400/day; templates; provider by `EMAIL_PROVIDER` (`gmail_smtp` port 465 \| `resend`) |
| `delete-account` | POST, user JWT (or internal `mode=underage`) | `{confirm:'DELETE'}` → `{ok}` | 1) move photo keys referenced by open reports to `onlyswap-private/evidence/` (BE-02); 2) delete R2 prefixes `c/*/u/{uid}/`, listing folders of own listings; 3) close own open chats with a system message; 4) if banned → `banned_hashes`; 5) `auth.admin.deleteUser`; 6) queue `account_deleted` (not underage); 7) PostHog person delete via API; 3/day |
| `export-data` | POST, user JWT | → `{status:'queued'}` | JSON of profile, listings, offers, messages, ratings, saved, prefs → private bucket → 7-day presigned link by email; 1/day |
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

## 7. Notification catalog — R1.0 (21 types)

| Type | Group | TS* | Pref | Push text (preview-safe) | Dedupe key |
|---|---|---|---|---|---|
| offer_new | offers | ✓ | offers | "Maya offered $35 on your mini fridge" | `offer_new:{offer}:{round}` |
| offer_accepted | offers | ✓ | offers | "Devin accepted your offer. Say hi and plan the pickup." | `offer_accepted:{offer}` |
| offer_countered | offers | ✓ | offers | "Devin countered at $38 on the mini fridge" | `offer_countered:{offer}:{round}` |
| offer_declined | offers | | offers | "Your offer on the desk chair wasn't accepted" / "This sold to someone else" | `offer_declined:{offer}` |
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

## 8. Workers and Pages Functions

| Name | Path | Logic |
|---|---|---|
| `workers/media` | `media.<acct>.workers.dev/*` (Plan B `img.<domain>`) | GET R2 key under allowlisted prefixes (`c/`, `share/`); `Cache-Control: public, max-age=31536000, immutable`; `X-Content-Type-Options: nosniff`; type from extension; 404 otherwise; best-effort per-IP limit (SEC-05) |
| `apps/site/functions/l/[id].ts` | `/l/:id` | `get_listing_public_card` → HTML with OG + a blurred sign-in wall; `noindex` |
| `apps/site/functions/m/[token].ts` | `/m/:token` | `get_meetup_share` → status page, auto-refresh 60 s, `no-store`, `noindex` |
| `apps/site/functions/i/[code].ts` | `/i/:code` | `get_invite` → landing + store badges + install referrer `invite={code}` |
