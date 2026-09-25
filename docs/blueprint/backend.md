# backend.md — Backend blueprint (Supabase + Cloudflare)

**Roles used in policies:**

- `anon`: not signed in.
- `authenticated`: a signed-in user. Policies use `auth.uid()` and the JWT claims `campus_id`, `status` and `adult`, which the custom access token hook adds.
- **self / other user:** both are `authenticated`, told apart by an `auth.uid()` comparison.
- **admin:** `authenticated` + a row in `admins` + `aal = 'aal2'`, checked by `is_admin(role)`.
- `service_role`: Edge Functions and cron. It bypasses RLS.

**Where things live:**

- Migrations: `supabase/migrations/NNNN_name.sql`.
- Schemas:
  - `public`: app tables.
  - `private`: helpers and secrets, not exposed to the API.
  - `admin`: admin RPCs. Exposed, with every function checking `is_admin()`.

---

## 1. Extensions and enums (`0001_extensions_enums.sql`)

```sql
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

create type campus_status   as enum ('waitlist','live','paused');
create type user_status     as enum ('active','waitlist','reverify','paused','suspended','banned','deleted');
create type class_year      as enum ('freshman','sophomore','junior','senior','grad','other');
create type age_method      as enum ('os_signal','self_declared','review');
create type listing_kind    as enum ('sale','free','wanted','food');
create type listing_status  as enum ('active','hold','sold','removed','expired','held_review');
create type item_condition  as enum ('new','like_new','good','fair');
create type swipe_dir       as enum ('left','right','save');
create type offer_status    as enum ('pending','accepted','countered','declined','expired','withdrawn','auto_declined');
create type chat_status     as enum ('open','closed','blocked');
create type message_kind    as enum ('text','photo','system','meetup');
create type meetup_status   as enum ('proposed','confirmed','cancelled','completed','no_show');
create type report_target   as enum ('listing','user','chat','message','quad_post','quad_reply');
create type report_reason   as enum ('scam','not_allowed','stolen','counterfeit','misleading','harassment','threat','hate','sexual','calls_out_student','spam','self_harm','no_show','other');
create type report_status   as enum ('open','actioned','dismissed');
create type quad_kind       as enum ('text','photo','poll','checkin');
create type quad_status     as enum ('live','held','hidden','removed');
create type admin_role      as enum ('owner','moderator');
create type word_action     as enum ('block','review');
create type push_state      as enum ('pending','sent','skipped','failed');
create type notif_type      as enum ('offer_new','offer_accepted','offer_countered','offer_declined','offer_expired','message_new',
  'meetup_proposed','meetup_confirmed','meetup_reminder','meetup_here','meetup_late','meetup_changed','meetup_cancelled',
  'deal_check','rate_prompt','rating_revealed','saved_search_match','price_drop','watch_available','listing_stale',
  'wanted_match','free_food','quad_reply','quad_milestone','report_update','appeal_decided','account_notice',
  'campus_unlocked','announcement_safety','announcement_news','reverify_due');
```

---

## 2. Tables

For each table: columns, then constraints and indexes, then RLS. "none" means the operation is denied (no policy exists). "via RPC" means the operation is only possible through a `security definer` function.

### 2.1 Campus and identity

**`campuses`**
- **Columns:**
  - `id uuid pk default gen_random_uuid()`
  - `slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$')`
  - `name text not null`, `short_name text not null`
  - `timezone text not null default 'America/New_York'`
  - `status campus_status not null default 'waitlist'`
  - `unlock_threshold int not null default 500`, `unlocked_at timestamptz`
  - `founding_seller_limit int not null default 50`
  - `quad_enabled bool not null default true`
  - `quad_autohide_score int not null default -5`
  - `offers_per_hour int not null default 10`
  - `noshow_pause_threshold int not null default 2`
  - `reverify_months int not null default 12`
  - `free_food_push_daily_cap int not null default 3`
  - `is_demo bool not null default false`
  - `created_at timestamptz not null default now()`
- **RLS:**
  - anon: none, except the public RPC `public_campus_progress()`.
  - user: select own campus (`id = (auth.jwt()->>'campus_id')::uuid`).
  - admin: select all; update via `admin.update_campus`.

**`campus_domains`**
- **Columns:**
  - `domain text pk check (domain = lower(domain))`
  - `campus_id uuid not null references campuses on delete cascade`
  - `kind text not null check (kind in ('student','blocked'))`
  - `created_at timestamptz default now()`
- **RLS:** none for anyone. Lookups go through `lookup_school()` (security definer, which returns only the name and status).

**`profiles`**, one row per auth user. Created by trigger `on_auth_user_created`.
- **Columns:**
  - `id uuid pk references auth.users on delete cascade`
  - `campus_id uuid not null references campuses`
  - `email_hash text not null`, `status user_status not null default 'active'`
  - `first_name text check (char_length(first_name) between 1 and 30)`
  - `last_initial char(1)`
  - `display_name text generated always as (first_name || coalesce(' ' || last_initial || '.', '')) stored`
  - `year class_year`, `areas text[] default '{}'`, `bio text check (char_length(bio) <= 80)`
  - `avatar_path text`
  - `verified_until date not null`
  - `adult_confirmed_at timestamptz`, `age_method age_method`
  - `rules_accepted_at timestamptz`, `rules_version text`
  - `quad_rules_accepted_at timestamptz`
  - `invite_code text unique not null default private.new_invite_code()`
  - `invited_by uuid references profiles on delete set null`
  - `founding_seller_until timestamptz`
  - `theme text default 'system'`, `app_icon text default 'default'`
  - `analytics_opt_in bool not null default true`
  - `noshow_count int not null default 0`, `strike_count int not null default 0`
  - `paused_until timestamptz`, `status_reason text`
  - `seen_unlock_at timestamptz`, `last_active_at timestamptz`
  - `created_at timestamptz not null default now()`
- **Indexes:** `(campus_id, status)`, `(campus_id, created_at)` for waitlist position, `(verified_until)`.
- **RLS:**
  - self: select own row; update limited to `theme`, `app_icon` and `analytics_opt_in` (column grants). Everything else goes through `update_profile`.
  - other user, same campus: select only through the `public_profiles` view (`id, display_name, year, avatar_path, created_at, founding_seller_until`), excluding blocked pairs.
  - anon: none.
  - admin: select all.

**`review_accounts`**
- **Columns:** `email text pk`, `note text`.
- **RLS:** none. It's read only by the hook and by `lookup_school`.

**`age_blocks`**
- **Columns:** `email_hash text pk`, `created_at timestamptz default now()`. Rows are purged after 365 days.
- **RLS:** none.

**`waitlist_requests`** (unknown schools)
- **Columns:**
  - `id uuid pk`, `email_hash text not null`, `email_enc bytea not null` (pgcrypto `pgp_sym_encrypt` with a key from Vault)
  - `domain text not null`, `school_guess text`
  - `created_at timestamptz default now()`, `notified_at timestamptz`
- **Constraints:** `unique(email_hash)`.
- **RLS:** none. Inserts go through the `waitlist-request` function (service role). Rows are purged after 12 months.

**`admins`**
- **Columns:**
  - `user_id uuid pk references profiles on delete cascade`
  - `role admin_role not null`
  - `campus_id uuid references campuses` (null means all campuses)
  - `invited_by uuid`, `created_at timestamptz default now()`
- **RLS:** admin can select; owner writes via RPC.

**`app_config`**
- **Columns:** `key text pk`, `value jsonb not null`, `updated_at timestamptz`.
- **RLS:** anon and user can select keys in the public allowlist (`maintenance`, `min_version_ios`, `min_version_android`, `quad_enabled`, `chat_photos_enabled`); owner updates via RPC.

### 2.2 Listings

**`categories`**
- **Columns:** `id smallint pk`, `slug text unique`, `name text`, `parent_id smallint references categories`, `sort smallint`.
- **Seed:** Furniture, Tech (Monitors, Laptops, Audio, Gaming), Textbooks, Kitchen, Decor, Clothing, Bikes & Scooters, Sports, Music, Dorm essentials, Free stuff, Other.
- **RLS:** everyone can select.

**`listings`**
- **Columns:**
  - `id uuid pk`, `campus_id uuid not null`, `seller_id uuid not null references profiles on delete cascade`
  - `kind listing_kind not null default 'sale'`, `status listing_status not null default 'active'`
  - `title text not null check (char_length(title) between 3 and 80)`
  - `description text check (char_length(description) <= 1000)`
  - `category_id smallint references categories`
  - `condition item_condition`
  - `price_cents int not null default 0 check (price_cents between 0 and 200000)`
  - `open_to_offers bool not null default true`
  - `meet_spot_ids uuid[] not null default '{}'`, `meet_note text check (char_length(meet_note) <= 60)`
  - `availability text[] default '{}'`
  - `wanted_max_cents int`
  - `share_image_path text`
  - `view_count int not null default 0`, `save_count int not null default 0`, `offer_count int not null default 0`
  - `hold_offer_id uuid`
  - `buyer_id uuid references profiles on delete set null`
  - `sold_at timestamptz`, `sold_in_app bool`
  - `expires_at timestamptz` (food: now() + chosen duration, max 3h)
  - `bumped_at timestamptz not null default now()`
  - `search tsvector generated always as (setweight(to_tsvector('english', unaccent_immutable(title)),'A') || setweight(to_tsvector('english', unaccent_immutable(coalesce(description,''))),'B')) stored`
  - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- **Indexes:**
  - `gin(search)`
  - `gin(title gin_trgm_ops)`
  - `(campus_id, status, bumped_at desc)`
  - `(seller_id, status)`
  - `(campus_id, kind, status, created_at desc)`
  - `(category_id)`
  - partial `(expires_at) where kind='food' and status='active'`
- **RLS:**
  - user, same campus: select where `status in ('active','hold','sold')`, or `seller_id = auth.uid()` (any status), and the seller isn't blocked either way.
  - Insert, update and delete go only via RPC.
  - admin: select all.

**`listing_photos`**
- **Columns:**
  - `id uuid pk`, `listing_id uuid not null references listings on delete cascade`
  - `idx smallint not null check (idx between 0 and 7)`
  - `path text not null`, `thumb_path text not null`
  - `width int`, `height int`, `blurhash text`
- **Constraints:** `unique(listing_id, idx)`.
- **RLS:** select if the parent listing is selectable (EXISTS subquery); writes via RPC.

**`listing_price_changes`**
- **Columns:** `id bigint identity pk`, `listing_id uuid`, `old_cents int`, `new_cents int`, `changed_at timestamptz default now()`.
- **RLS:** none. It feeds the `price_drop` notifications.

**`swipes`**
- **Columns:** `user_id uuid`, `listing_id uuid`, `dir swipe_dir`, `created_at timestamptz default now()`.
- **Constraints and indexes:** `pk(user_id, listing_id)`, index `(listing_id)`. Rows older than 30 days are pruned, except `save`.
- **RLS:** self select; writes via RPC.

**`saves`**
- **Columns:** `user_id uuid references profiles on delete cascade`, `listing_id uuid references listings on delete cascade`, `price_at_save int`, `created_at timestamptz default now()`.
- **Constraints and indexes:** `pk(user_id, listing_id)`, index `(listing_id)`.
- **RLS:** self select; writes via RPC.

**`watches`** ("tell me if it's available again")
- **Columns:** `user_id`, `listing_id`, `created_at`.
- **Constraints:** pk on both.
- **RLS:** self.

**`saved_searches`**
- **Columns:**
  - `id uuid pk`, `user_id uuid not null references profiles on delete cascade`, `campus_id uuid not null`
  - `query text check (char_length(query) <= 80)`
  - `filters jsonb not null default '{}'` (validated keys: `category_ids`, `min_cents`, `max_cents`, `condition`, `free_only`)
  - `alerts bool not null default true`
  - `last_seen_at timestamptz default now()`, `last_notified_at timestamptz`
  - `created_at timestamptz default now()`
- **Constraints:** max 20 per user, enforced by trigger.
- **RLS:** self select; writes via RPC.

### 2.3 Offers, chats, meetups, ratings

**`offers`**
- **Columns:**
  - `id uuid pk`, `listing_id uuid not null references listings on delete cascade`
  - `buyer_id uuid not null references profiles on delete cascade`, `seller_id uuid not null`
  - `amount_cents int not null check (amount_cents between 0 and 200000)`
  - `note text check (char_length(note) <= 140)`, `quick_notes text[] default '{}'`
  - `status offer_status not null default 'pending'`
  - `round smallint not null default 1 check (round between 1 and 4)`
  - `last_actor text not null default 'buyer' check (last_actor in ('buyer','seller'))`
  - `decline_reason text`
  - `expires_at timestamptz not null default now() + interval '48 hours'`
  - `responded_at timestamptz`, `created_at timestamptz default now()`
- **Constraints and indexes:**
  - partial unique `(listing_id, buyer_id) where status in ('pending','countered')`
  - `(seller_id, status)`, `(buyer_id, status)`
  - partial `(expires_at) where status in ('pending','countered')`
- **RLS:** select if `auth.uid() in (buyer_id, seller_id)`; writes via RPC.

**`chats`**
- **Columns:**
  - `id uuid pk`, `listing_id uuid not null references listings on delete cascade`
  - `offer_id uuid unique not null references offers`
  - `buyer_id uuid not null`, `seller_id uuid not null`
  - `status chat_status not null default 'open'`
  - `last_message_at timestamptz default now()`
  - `buyer_read_at timestamptz`, `seller_read_at timestamptz`
  - `buyer_hidden bool default false`, `seller_hidden bool default false`
  - `buyer_muted bool default false`, `seller_muted bool default false`
  - `buyer_outcome text`, `seller_outcome text`
  - `closed_at timestamptz`, `archived_at timestamptz`
  - `created_at timestamptz default now()`
- **Indexes:** `(buyer_id, last_message_at desc)`, `(seller_id, last_message_at desc)`.
- **RLS:** participants can select; admin through `admin.read_reported_chat` only.

**`messages`**
- **Columns:**
  - `id bigint generated always as identity pk`
  - `chat_id uuid not null references chats on delete cascade`
  - `sender_id uuid references profiles on delete set null`
  - `kind message_kind not null default 'text'`
  - `body text check (char_length(body) <= 1000)`
  - `photo_path text`, `meta jsonb`
  - `client_id uuid`
  - `created_at timestamptz default now()`
- **Constraints and indexes:** `unique(chat_id, client_id)`, index `(chat_id, id desc)`.
- **RLS:** participants can select; insert via `send_message` only. Realtime broadcast comes from a trigger.

**`safe_spots`**
- **Columns:**
  - `id uuid pk`, `campus_id uuid not null`
  - `name text not null`, `description text`, `hours text`
  - `lat double precision not null`, `lng double precision not null`
  - `is_safe_zone bool not null default false`, `is_default bool not null default false`
  - `active bool not null default true`, `sort smallint default 0`
- **RLS:** same campus can select where active; anon only via `public_safe_spots(slug)`; admin writes via RPC.

**`meetups`**
- **Columns:**
  - `id uuid pk`, `chat_id uuid not null references chats on delete cascade`
  - `spot_id uuid references safe_spots`, `custom_place text check (char_length(custom_place) <= 60)`
  - `starts_at timestamptz not null`
  - `status meetup_status not null default 'proposed'`
  - `proposed_by uuid not null`, `confirmed_at timestamptz`
  - `buyer_here_at timestamptz`, `seller_here_at timestamptz`
  - `late_user uuid`, `late_minutes smallint`
  - `cancelled_by uuid`, `cancel_reason text`
  - `previous_starts_at timestamptz`
  - `reminder_sent_at timestamptz`, `deal_check_sent_at timestamptz`
  - `share_token text unique`, `share_created_by uuid`, `share_expires_at timestamptz`
  - `created_at timestamptz default now()`
- **Indexes:** partial `(starts_at) where status='confirmed'`, `(chat_id)`.
- **RLS:** participants can select; writes via RPC.

**`noshow_reports`**
- **Columns:** `id uuid pk`, `meetup_id uuid references meetups`, `reporter_id uuid`, `reported_id uuid`, `note text`, `status text default 'open'`, `created_at timestamptz default now()`.
- **Constraints:** `unique(meetup_id, reporter_id)`.
- **RLS:** reporter can select own rows; admin can select all.

**`ratings`**
- **Columns:**
  - `id uuid pk`, `chat_id uuid not null references chats on delete cascade`
  - `rater_id uuid not null`, `ratee_id uuid not null`
  - `thumbs_up bool not null`, `tags text[] default '{}'`
  - `comment text check (char_length(comment) <= 200)`
  - `created_at timestamptz default now()`
- **Constraints:** `unique(chat_id, rater_id)`.
- **RLS:** rater can select own rows. Everyone in the campus reads through the `ratings_visible` view, which shows a rating only when both sides have rated or 7 days have passed. Rater name is dropped if the rater's account is deleted.

**`blocks`**
- **Columns:** `blocker_id uuid`, `blocked_id uuid`, `created_at timestamptz default now()`.
- **Constraints:** `pk(blocker_id, blocked_id)`.
- **RLS:** blocker can select own rows; writes via RPC. The helper `private.is_blocked(a,b)` is used in other policies.

### 2.4 Quad

**`quad_posts`**
- **Columns:**
  - `id uuid pk`, `campus_id uuid not null`, `author_id uuid not null references profiles on delete cascade`
  - `kind quad_kind not null default 'text'`
  - `body text not null check (char_length(body) between 1 and 500)`
  - `photo_path text`, `place text`
  - `score int not null default 0`, `reply_count int not null default 0`
  - `status quad_status not null default 'live'`, `hold_reason text`
  - `replies_enabled bool not null default true`
  - `expires_at timestamptz` (check-ins: 3h)
  - `hot_rank double precision`, maintained by trigger with the formula `score / (hours_since + 2)^1.5`
  - `created_at timestamptz default now()`
- **Indexes:** `(campus_id, status, hot_rank desc)`, `(campus_id, status, created_at desc)`, `(campus_id, status, score desc)`, `(author_id)`.
- **RLS:** **no direct select for users**, so `author_id` can never be read. Users read through `get_quad_feed` and `get_quad_thread` (security definer), which return an alias. Admin can select.

**`quad_replies`**
- **Columns:**
  - `id uuid pk`, `post_id uuid not null references quad_posts on delete cascade`
  - `author_id uuid not null references profiles on delete cascade`
  - `body text not null check (char_length(body) between 1 and 300)`
  - `alias_no smallint not null` (0 = OP)
  - `score int default 0`, `status quad_status default 'live'`
  - `created_at timestamptz default now()`
- **Indexes:** `(post_id, created_at)`.
- **RLS:** same as posts (no direct select).

**`quad_votes`**
- **Columns:** `user_id uuid`, `target_type text check (target_type in ('post','reply'))`, `target_id uuid`, `value smallint check (value in (-1,1))`, `created_at timestamptz default now()`.
- **Constraints:** `pk(user_id, target_type, target_id)`.
- **RLS:** self can select; writes via RPC.

**`quad_poll_options`**
- **Columns:** `id uuid pk`, `post_id uuid references quad_posts on delete cascade`, `label text check (char_length(label) between 1 and 40)`, `idx smallint`, `votes int default 0`.
- **RLS:** via feed RPC.

**`quad_poll_votes`**
- **Columns:** `post_id uuid`, `user_id uuid`, `option_id uuid`.
- **Constraints:** `pk(post_id, user_id)`.
- **RLS:** via RPC.

**`quad_hides`**
- **Columns:** `user_id uuid`, `hidden_author_id uuid`, `source_post_id uuid`, `created_at timestamptz default now()`.
- **Constraints:** `pk(user_id, hidden_author_id)`.
- **RLS:** none for select (it would leak the author). The Muted screen uses `get_my_quad_hides()`, which returns `source_post_id` and an excerpt only.

**`quad_mutes`**
- **Columns:** `user_id uuid`, `keyword text check (char_length(keyword) between 2 and 30)`.
- **Constraints:** `pk(user_id, keyword)`.
- **RLS:** self.

### 2.5 Safety

**`reports`**
- **Columns:**
  - `id uuid pk`, `campus_id uuid not null`, `reporter_id uuid references profiles on delete set null`
  - `target_type report_target not null`, `target_id text not null`
  - `target_user_id uuid` (resolved server-side, never returned to the reporter)
  - `reason report_reason not null`, `details text check (char_length(details) <= 500)`
  - `status report_status not null default 'open'`
  - `priority smallint not null default 2` (1 means threat or self-harm)
  - `assigned_to uuid`, `action_taken text`
  - `resolved_at timestamptz`, `created_at timestamptz default now()`
- **Constraints and indexes:** partial unique `(reporter_id, target_type, target_id) where status='open'`; index `(campus_id, status, priority, created_at)`.
- **RLS:** the reporter can select own rows but not `target_user_id`, so reads go through the `my_reports` view. Admin can select all.

**`strikes`**
- **Columns:** `id uuid pk`, `user_id uuid`, `reason text`, `report_id uuid`, `created_by uuid`, `expires_at timestamptz default now() + interval '180 days'`, `cleared_at timestamptz`, `created_at timestamptz default now()`.
- **RLS:** self can select; admin can write.

**`appeals`**
- **Columns:**
  - `id uuid pk`, `user_id uuid not null`
  - `subject_type text check (subject_type in ('strike','listing','quad_post','suspension'))`, `subject_id text not null`
  - `reason_choice text`, `body text check (char_length(body) <= 500)`
  - `status text default 'open' check (status in ('open','upheld','overturned'))`
  - `decided_by uuid`, `decision_note text`, `decided_at timestamptz`
  - `created_at timestamptz default now()`
- **Constraints:** `unique(subject_type, subject_id)`.
- **RLS:** self can select own; insert via RPC; admin can decide.

**`banned_words`**
- **Columns:**
  - `id uuid pk`, `pattern text not null`
  - `match text not null default 'word' check (match in ('word','phrase','regex'))`
  - `scopes text[] not null` (any of `listing`, `quad`, `profile`, `chat_on_report`)
  - `action word_action not null`
  - `fired_count int default 0`, `overturned_count int default 0`
  - `created_by uuid`, `created_at timestamptz default now()`
- **RLS:** none for users (`check_text` RPC only); admin can manage.

**`audit_log`**
- **Columns:**
  - `id bigint identity pk`, `actor_id uuid`, `action text not null`
  - `target_type text`, `target_id text`, `campus_id uuid`
  - `reason text`, `case_ref text`, `meta jsonb`
  - `created_at timestamptz default now()`
- **Rules:** append only. A trigger raises on update or delete, and `revoke update, delete from authenticated, service_role`. Retention is 2 years.
- **RLS:** admin can select; insert only from definer functions.

**`rate_counters`**
- **Columns:** `user_id uuid`, `action text`, `window_start timestamptz`, `count int`.
- **Constraints:** `pk(user_id, action, window_start)`. Pruned daily.
- **RLS:** none.

**`support_requests`**
- **Columns:** `id uuid pk`, `email text`, `topic text`, `body text`, `created_at timestamptz default now()`, `handled_at timestamptz`.
- **RLS:** none; the function inserts and emails the owner.

### 2.6 Notifications and ops

**`notifications`**
- **Columns:**
  - `id bigint identity pk`, `user_id uuid not null references profiles on delete cascade`
  - `type notif_type not null`, `grp text not null` (Offers, Messages, Meetups, Alerts, Selling, Quad, Safety, Campus, Account)
  - `title text not null`, `body text not null`, `data jsonb not null default '{}'` (deep link, thumb path)
  - `time_sensitive bool not null default false`
  - `push_state push_state not null default 'pending'`, `push_after timestamptz not null default now()`
  - `read_at timestamptz`, `created_at timestamptz default now()`
- **Indexes:** `(user_id, created_at desc)`, partial `(push_after) where push_state='pending'`. Rows older than 60 days are pruned.
- **RLS:** self can select; update of `read_at` via RPC.

**`notification_prefs`**
- **Columns:**
  - `user_id uuid pk`
  - on by default: `offers`, `messages`, `meetups`, `saved_search`, `price_drop` (all `bool default true`)
  - off by default: `quad_replies bool default false`, `free_food bool default false`, `tips bool default false`, `message_previews bool default false`
  - `quiet_start time default '23:00'`, `quiet_end time default '08:00'`
- **RLS:** self can select; updates via RPC.

**`push_tokens`**
- **Columns:**
  - `id uuid pk`, `user_id uuid references profiles on delete cascade`
  - `token text unique not null`, `platform text check (platform in ('ios','android'))`
  - `app_version text`
  - `created_at timestamptz default now()`, `last_seen_at timestamptz`, `disabled_at timestamptz`
- **RLS:** self can select; writes via RPC.

**`push_tickets`**
- **Columns:** `id bigint identity pk`, `token_id uuid`, `notification_id bigint`, `ticket_id text`, `status text`, `error text`, `created_at timestamptz default now()`, `checked_at timestamptz`.
- **RLS:** none.

**`announcements`**
- **Columns:**
  - `id uuid pk`, `campus_id uuid`
  - `type text check (type in ('safety','news','update'))`
  - `title text check (char_length(title) <= 60)`, `body text check (char_length(body) <= 200)`
  - `send_push bool`, `created_by uuid`
  - `created_at timestamptz default now()`, `sent_at timestamptz`, `pinned_until timestamptz`
- **RLS:** same campus can select where `pinned_until > now()`; admin inserts via RPC.

**`data_exports`**
- **Columns:** `id uuid pk`, `user_id uuid`, `status text`, `path text`, `expires_at timestamptz`, `created_at timestamptz default now()`.
- **RLS:** self can select.

**`email_outbox`**
- **Columns:**
  - `id bigint identity pk`, `to_email text not null`
  - `template text not null` (`campus_open`, `account_paused`, `reverify_due`, `account_deleted`, `data_export`, `admin_reveal_receipt`, `support_request`)
  - `vars jsonb`, `send_after timestamptz default now()`
  - `sent_at timestamptz`, `error text`, `attempts smallint default 0`
- **RLS:** none; the service role drains it (400/day cap).

### 2.6b Small support tables (added in self-audit)
- `listing_reservations`: `id uuid pk`, `user_id`, `created_at`, `used_at`. Rows are purged after 24h. **RLS:** none (RPC only).
- `banned_hashes`: `email_hash text pk`, `created_at`. Stops banned users from re-registering after deletion; checked in `hook_before_user_created`. **RLS:** none.
- `activity_days`: `user_id`, `day date`, pk on both. Upserted by `private.require_active()` once per user per day and pruned after 400 days. It powers the retention metrics. **RLS:** none.
- `daily_counters`: see §2.7.
- `common_first_names`: `name text pk`. Seeded with about 5,000 common US first names from the public-domain SSA baby-names dataset. It's used by `private.names_student`. **RLS:** none.
- RPC `update_profile_flags(analytics_opt_in bool)`: self only; lets the analytics toggle change without a full profile update.
- RPC `can_upload(kind text, target_id uuid) → {campus_id}`: called by the `upload-url` function. It checks ownership: the listing is the caller's, or `target_id` came from `reserve_listing_id` for new listings, the caller is in that chat, the post is the caller's, or the upload is their own avatar.
- `private.unaccent_immutable(text)`: an immutable SQL wrapper around `unaccent`, needed for the generated `search` column.

### 2.7 Views
- **`public_profiles`**: public columns plus `profile_stats`. Security invoker, filtered to the viewer's campus and not blocked.
- **`profile_stats`** (materialized, refreshed every 10 min):
  - `user_id`, `swaps_count` (sold with buyer, or bought)
  - `thumbs_up`, `thumbs_total`
  - `median_reply_minutes`
  - `active_listings`
- **`ratings_visible`**: ratings where both sides have rated, or `created_at < now() - 7 days`.
- **`campus_progress`**: `campus_id`, `status`, `threshold`, `members` (profiles count), `founding_left`.
- **`price_hints`** (materialized, daily): `campus_id`, `category_id`, `p25`, `p50`, `p75`, `n`, over sold in the last 180 days.
- **`campus_trending_terms`** (materialized, hourly): the top 8 terms from titles of listings with the most saves in the last 7 days. No search logs are stored.
- **`my_reports`**: the reporter's reports without `target_user_id`.
- **`admin.metrics_*`**: funnel from profiles → swipes → offers → accepted → meetups → sold; retention by signup week from `profiles.last_active_at` and a daily `activity_days(user_id, day)` table (tiny, 1 row per user-day); liquidity (feed exhaustion is computed from `get_feed` returning fewer than 5 items, logged as a counter in `daily_counters`).
- **`daily_counters`** (table): `campus_id`, `day date`, `key text`, `value int`, `pk(campus_id, day, key)`. This replaces raw events (G5).

---

## 3. Auth hooks and triggers

| Name | Type | Logic |
|---|---|---|
| `private.hook_before_user_created(event jsonb)` | Auth Hook (Postgres) | 1. domain = split_part(lower(email),'@',2). 2. if `email_hash` in `age_blocks` → reject `AGE_BLOCKED`; if in `banned_hashes` → reject `BANNED`. 3. if email in `review_accounts` → allow. 4. `campus_domains` lookup: missing → reject `SCHOOL_UNKNOWN`; kind `blocked` → reject `DOMAIN_BLOCKED`. 5. allow. |
| `private.hook_custom_access_token(event jsonb)` | Auth Hook (Postgres) | adds claims `campus_id`, `status`, `adult` (bool), `admin_role` (null/owner/moderator) from `profiles`/`admins`. |
| `on_auth_user_created` | trigger on `auth.users` after insert | insert `profiles` (campus from domain or demo campus for review accounts, `verified_until = now() + campus.reverify_months`, status `waitlist` if campus not live), `notification_prefs` default row; set `invited_by` from `raw_user_meta_data.invite_code`. |
| `trg_profiles_waitlist_count` | after insert on profiles | if campus status waitlist and members ≥ threshold → `private.unlock_campus(campus_id)`. |
| `trg_listings_after_insert` | after insert | queue `saved_search_match` (matching saved searches in same campus, alerts on, not own, max 1 per search per 2 h), `wanted_match` for kind sale vs open wanted posts, `free_food` push fan-out for kind food (respect cap/prefs), founding seller flag (first N distinct sellers). |
| `trg_listings_price_update` | after update of price_cents | insert `listing_price_changes`; if drop ≥5% queue `price_drop` to savers (prefs). |
| `trg_listings_status_update` | after update of status | hold→active: notify `watches`; sold/removed: auto-decline pending offers, close chats except buyer's. |
| `trg_offers_notify` | after insert/update | queue `offer_new`, `offer_countered`, `offer_accepted`, `offer_declined`, `offer_expired` to the other party. |
| `trg_messages_after_insert` | after insert | update `chats.last_message_at`; `realtime.broadcast_changes('chat:'||chat_id, …)`; queue `message_new` to other participant unless muted/hidden; push body = preview only if recipient `message_previews` else "New message from Aisha". |
| `trg_meetups_notify` | after insert/update | proposed/confirmed/changed/cancelled/here/late notifications. |
| `trg_quad_votes` | after insert/update/delete | update score, hot_rank; if post score ≤ campus autohide → status hidden + report auto-created (priority 2); milestone 50/100 → `quad_milestone` (if `quad_replies` pref). |
| `trg_quad_replies_after_insert` | after insert | `reply_count++`, queue `quad_reply` to OP (prefs), broadcast nothing. |
| `trg_reports_after_insert` | after insert | ≥3 open reports on same target within 24 h → auto-hide target (listing status `held_review`, post `hidden`); priority 1 reasons email owner immediately (`email_outbox`). |
| `trg_audit_immutable` | before update/delete on audit_log | raise. |
| `trg_updated_at` | before update on listings etc. | `updated_at = now()`. |

---

## 4. RPCs (Postgres functions, `security definer`, `set search_path = public, private`)

Every user RPC starts with `perform private.require_active()`, which checks the session, `status='active'`, `adult`, `rules_accepted_at` and `campus_id`. Rate limits use `private.hit(action, limit, window)`, which raises `RATE_LIMITED:<action>:<retry_at>`. Every text input goes through `private.check_text(text, scope)`, which returns `ok`, `block:<reason>` or `review:<reason>`.

The first list is the RPCs anyone can call. The table after it is the signed-in user RPCs.

**Public (anon)**

| Function | Input → Output | Validation / errors | Rate limit |
|---|---|---|---|
| `lookup_school(domain text)` | → `{campus_id, name, status, is_review}` or null | lowercase, max 100 chars | 30/min per IP (via `private.hit_ip` using `request.headers` x-forwarded-for) |
| `public_campus_progress()` | → list `{slug, name, status, members, threshold}` | — | cached view |
| `public_safe_spots(slug)` | → spots | — | — |
| `get_listing_public_card(id)` | → `{title, price_cents, campus_name, share_image_path}` only if `share_image_path` not null and status active | — | — |
| `get_meetup_share(token)` | → `{a_name, b_name, spot, starts_at, statuses, status}` if not expired | invalid → null | 60/min per IP |
| `get_invite(code)` | → `{first_name, campus_name, members, threshold}` | — | — |

| Function | Input → Output | Validation / errors | Rate limit |
|---|---|---|---|
| `confirm_age(method age_method, is_adult bool default null, birth_date date default null)` | → `{adult bool}` | self_declared requires date; computes age in campus TZ; under 18 → insert `age_blocks`, return false (client then calls delete) | 3/day |
| `update_profile(first_name, last_initial, year, areas, bio, avatar_path)` | → profile | names regex; bio check_text(profile); avatar path must start `u/{uid}/` | 20/day |
| `accept_rules(version text)` | → void | version must equal current | — |
| `accept_quad_rules()` | → void | — | — |
| `my_waitlist_position()` | → `{position, members, threshold}` | — | — |
| `get_feed(cursor jsonb, limit int default 20)` | → listings with first photo, seller mini, save_count, is_saved | excludes own, swiped (30 d), blocked, hidden; ranking `bumped_at` recency × (1 + ln(1+save_count)) with 20% randomized exploration; increments `daily_counters.feed_exhausted` when < 5 returned | 120/h |
| `record_swipes(items jsonb)` | items `[{listing_id, dir, at}]` max 50 → void | ignores unknown listings | 60/h calls |
| `undo_swipe(listing_id)` | → void | only last 60 s | — |
| `save_listing(listing_id)` / `unsave_listing(listing_id)` | → `{save_count}` | same campus, not own | 200/day |
| `hide_listing(listing_id)` | → void | = left swipe permanent | — |
| `watch_listing(listing_id)` | → void | listing on hold | — |
| `record_view(listing_id)` | → void | once per user/day | — |
| `search_listings(q text, filters jsonb, cursor jsonb)` | → listings | q ≤ 80; `websearch_to_tsquery`; trigram fallback if <3 results | 120/h |
| `search_suggest(q text)` | → `[{type:'term'|'category'|'saved', label, count}]` | min 2 chars | 600/h |
| `create_saved_search(query, filters, alerts)` / `update_saved_search(id, alerts)` / `delete_saved_search(id)` | | max 20 | 30/day |
| `saved_search_new_counts()` | → `[{id, new_count}]` | — | — |
| `price_hint(category_id)` | → `{p25,p50,p75}` or null if n<5 | — | — |
| `check_text(text, scope)` | → `{result, reason}` | for inline UX only | 600/h |
| `reserve_listing_id()` | → uuid (stored in `rate_counters`-like `listing_reservations` 24 h) | | 30/day |
| `create_listing(id uuid, kind, title, description, category_id, condition, price_cents, open_to_offers, photos jsonb, meet_spot_ids, meet_note, availability, wanted_max_cents, food_until)` | → listing | photos 1–8 for sale/free (0–1 food/wanted), paths must be `c/{campus}/l/{id}/`; check_text block → `BANNED:<term>`; review → status `held_review`; price ≤ 200000; food until ≤ 3 h; new-account limits | 20/day (3/day first 24 h); wanted 5/day; food 3/day |
| `update_listing(id, …)` | → listing | seller only; not sold | 50/day |
| `delete_listing(id)` | → void | cancels offers, closes chats | — |
| `relist_listing(id, price_cents)` | → listing | expired/active; bump once per 7 days | — |
| `mark_sold(id, buyer_id uuid null)` | → void | buyer must be a chat participant | — |
| `listing_stats(id)` / `listing_offers(id)` | seller only | | |
| `make_offer(listing_id, amount_cents, note, quick_notes)` | → offer | not own, listing active & open, not blocked, amount ≤ 200000, check_text(note); existing pending → update amount (round unchanged) | `campus.offers_per_hour`/h (default 10); first 24 h: 5/day; paused if noshow_count ≥ threshold → `OFFERS_PAUSED` |
| `accept_offer(offer_id)` | → `{chat_id}` | seller (or buyer when last_actor=seller counter); status pending/countered; locks listing `for update`; sets listing hold + `hold_offer_id`; auto-declines others with note; creates chat + system messages | — |
| `counter_offer(offer_id, amount_cents, note)` | → offer | round < 4; alternates actor | 30/day |
| `decline_offer(offer_id, reason text)` | → void | party-appropriate | — |
| `withdraw_offer(offer_id)` | → void | buyer, pending/countered | — |
| `get_inbox()` | → `{incoming[], outgoing[], chats[]}` | | |
| `get_messages(chat_id, before bigint, limit 50)` | → messages | participant | |
| `send_message(chat_id, kind, body, photo_path, client_id)` | → message | participant, chat open, not blocked; photo requires `chat_photos_enabled` and path `c/{campus}/chat/{chat_id}/`; no check_text (no scanning) except links → strips nothing, stores as-is | 60/min, 1000/day |
| `mark_chat_read(chat_id)` / `set_chat_mute(chat_id, muted)` / `hide_chat(chat_id)` | | | |
| `propose_meetup(chat_id, spot_id, custom_place, starts_at)` | → meetup | starts_at between now+15 min and now+14 d; cancels previous proposed | 20/day |
| `confirm_meetup(meetup_id)` | | other party | |
| `checkin_meetup(meetup_id)` | | within −60/+60 min of start | |
| `running_late(meetup_id, minutes smallint)` | | 5/10/15/30 | |
| `cancel_meetup(meetup_id, reason)` | | | |
| `create_meetup_share(meetup_id)` | → `{token, url}` | token = 22 char base62; expires starts_at + 24 h | 10/day |
| `report_noshow(meetup_id, note)` | → void | ≥ start + 20 min, other party not checked in; increments `noshow_count` of reported after 2nd independent report confirmed OR admin confirm (auto-confirm if reported never responds in 24 h) | |
| `confirm_deal(chat_id, outcome text)` | outcome in (`done`,`not_yet`,`fell_through`) | fell_through → listing back to active | |
| `submit_rating(chat_id, thumbs_up, tags, comment)` | | participant, deal done or 24 h after meetup; check_text(comment, 'profile') | |
| `create_report(target_type, target_id, reason, details)` | → report id | resolves `target_user_id`; for quad targets resolves author server-side; dup → `ALREADY_REPORTED` | 20/day |
| `get_my_report(id)` | → status timeline | reporter only | |
| `block_user(user_id)` / `unblock_user(user_id)` | | not self; closes open chats as `blocked` | 50/day |
| `create_appeal(subject_type, subject_id, reason_choice, body)` | | own subject; one per subject | 5/day |
| `get_quad_feed(sort text, cursor jsonb)` | → posts `{id, body, kind, photo_path, score, reply_count, my_vote, is_mine, created_at, poll}` | quad_enabled; excludes hidden authors via `quad_hides`, muted keywords, status≠live (except own held shows "Under review") | 240/h |
| `get_quad_thread(post_id)` | → post + replies with `alias_no`, `is_op`, `is_mine` | alias: OP author → 0; otherwise the author's existing `alias_no` in this thread, else `max(alias_no)+1` (computed in `create_quad_reply`) | |
| `create_quad_post(kind, body, photo_path, poll jsonb, place)` | → `{id, status, reason}` | quad rules accepted; check_text(quad): PII regex (phone/email/room/links/handles) → `blocked:pii`; `private.names_student(body)` heuristic (first name list ∩ tokens + rating verbs) → `held`; new account (<7 d) photo → `held`; poll 2–4 options | 10/h, 30/day |
| `create_quad_reply(post_id, body)` | → reply | same checks; replies enabled | 60/h |
| `vote_quad(target_type, target_id, value smallint)` | value −1/0/1 (0 removes) | not own | 600/h |
| `vote_poll(post_id, option_id)` | | once | |
| `hide_quad_author(post_id)` / `unhide_quad(source_post_id)` / `get_my_quad_hides()` | | never returns author ids | |
| `set_quad_replies(post_id, enabled)` / `delete_quad_post(post_id)` | own | | |
| `get_my_quad()` | → own posts/replies with status | | |
| `mute_keyword(keyword)` / `unmute_keyword(keyword)` | | max 50 | |
| `get_notifications(cursor)` / `mark_notifications_read(ids bigint[] null)` / `unread_count()` | | | |
| `update_notification_prefs(prefs jsonb)` | | known keys only | |
| `register_push_token(token, platform, app_version)` / `disable_push_token(token)` | | token format `ExponentPushToken[...]` | 20/day |
| `complete_reverify()` | | called after fresh OTP session (`auth.jwt()->>'amr'` contains otp within 10 min) → `verified_until += months`, status active | |
| `change_campus()` | | fresh OTP on a new domain email via `auth.updateUser({email})`; trigger on email change moves campus, closes listings | |
| `my_counts()` | → `{active_listings, saved, wanted, offers_open}` | | |
| `get_campus_feed(kind, cursor)` | → mixed feed | | |

**Admin RPCs** (`admin` schema). Every one of them checks `private.require_admin(min_role)` (admins row + `aal2`) and inserts into `audit_log`:

`overview`, `list_users`, `user_detail`, `set_user_status(user_id, status, until, reason)` (moderator max 7 d; ban owner only), `clear_strike`, `force_reverify`, `resolve_report(id, action, note)` (`dismiss|remove_content|warn|strike|suspend|ban`), `set_listing_status`, `approve_quad`, `remove_quad`, `reveal_quad_author(post_id, case_ref, reason)` (owner only; 5 per day; email receipt), `read_reported_chat(report_id)` (returns messages only if the report targets that chat or a message in it), `decide_appeal(id, decision, note)`, `update_campus`, `upsert_domain`, `delete_domain`, `upsert_safe_spot`, `invite_admin(email, role, campus_id)` (owner), `remove_admin`, `create_announcement(campus_id, type, title, body, send_push)` (1 per 7 days per campus, enforced), `upsert_banned_word`, `delete_banned_word`, `set_config(key, value)` (owner), `metrics_funnel(campus_id, from, to)`, `metrics_retention(campus_id)`, `metrics_liquidity(campus_id)`, `list_audit(filters)`.

---

## 5. Edge Functions (`supabase/functions/*`, Deno)

| Name | Trigger | Input | Output | Validation & errors | Rate limit |
|---|---|---|---|---|---|
| `upload-url` | HTTP POST (user JWT) | `{kind:'listing'|'avatar'|'chat'|'quad'|'share', target_id, files:[{idx, size, type:'image/webp'|'image/jpeg', variant:'full'|'thumb'}]}` | `[{key, url, headers}]` presigned PUT (5 min) | JWT valid; `require_active` via RPC `can_upload(kind,target_id)`; size ≤ 2 MB full / 200 KB thumb / 500 KB share; content-type allowlist; ≤ 16 files; key = `c/{campus}/{kind}/{target}/{uuid}_{variant}.webp` | 60/h per user |
| `send-push` | cron (pg_net every minute) | none | `{sent, skipped}` | selects ≤ 500 `notifications` pending & due; per user applies prefs, quiet hours (campus TZ; time_sensitive bypass), daily cap 6 non-urgent, groups; batches 100 to `https://exp.host/--/api/v2/push/send` with `EXPO_ACCESS_TOKEN`; stores tickets; `DeviceNotRegistered` → disable token | — |
| `push-receipts` | cron every 15 min | — | — | checks tickets older than 15 min, disables bad tokens | — |
| `send-email` | cron every 5 min | — | — | drains `email_outbox` (max 50/run, 400/day global), renders `_shared/email-templates/*.ts` (plain + HTML), SMTP 465 (Plan A) or Resend (Plan B) chosen by env `EMAIL_PROVIDER` | — |
| `delete-account` | HTTP POST (user JWT) or internal (`mode=underage`) | `{confirm:'DELETE'}` | `{ok}` | deletes R2 prefixes `u/{uid}/`, listings photos, chat photos sent; anonymizes ratings given; reports kept 180 d with reporter nulled; `auth.admin.deleteUser(uid)` (cascade); queues `account_deleted` email (not for underage); for banned users stores `email_hash` in `banned_hashes` | 3/day |
| `export-data` | HTTP POST (user JWT) | — | `{status:'queued'}` | builds JSON (profile, listings+photo URLs, offers, messages, ratings, quad posts/replies, saved, prefs) → R2 `exports/{uid}/{id}.json` → presigned GET 7 days → `email_outbox(data_export)` | 1/day |
| `waitlist-request` | HTTP POST (anon) | `{email, turnstile_token?}` | `{ok}` | web requires Turnstile verify; app requires `x-app-attest` header = app build signature (best-effort) + IP rate limit; stores hash + encrypted email | 5/h per IP |
| `support-request` | HTTP POST (anon) | `{email, topic, body, turnstile_token}` | `{ok}` | Turnstile; body ≤ 2000 | 3/h per IP |
| `campus-unlock` | called by `private.unlock_campus` via pg_net | `{campus_id}` | — | queues `campus_unlocked` notification to all members (push immediate), `campus_open` emails to `waitlist_requests` for that domain (drip 400/day) | — |
| `test-inbox` (**staging only**) | HTTP GET with a test secret header | `?email=e2e+n@e2e.onlyswap.test` | `{code}` | reads the latest OTP captured by the staging SMTP catch-all (Supabase local Inbucket/Mailpit locally; on staging the `e2e.onlyswap.test` domain routes through an Auth send-email hook that writes to `test_otps` instead of sending) | CI asserts it's absent from the prod function list |
| `health` | HTTP GET (anon) | — | `{db:'ok', time}` | runs `select 1` | UptimeRobot every 5 min |

Shared modules in `_shared/`: `supabaseAdmin.ts`, `r2.ts` (aws4fetch presign, delete prefix), `expoPush.ts`, `mailer.ts`, `turnstile.ts`, `cors.ts`, `rateLimit.ts` (calls `private.hit`), `templates/`.

## 5b. Cloudflare Workers / Pages Functions

| Name | Path | Trigger | Logic | Limits |
|---|---|---|---|---|
| `workers/media` | `media.<acct>.workers.dev/*` (Plan B `img.<domain>`) | GET | reads R2 binding key; only prefixes `c/`, `share/`; immutable cache headers; `ETag`; 404 otherwise; no listing of objects | 100k req/day free (Plan A) |
| `workers/web-edge/functions/l/[id].ts` | `/l/:id` | GET | fetch `get_listing_public_card` via Supabase REST (anon key) → HTML with `og:title` ("$40 · Mini fridge"), `og:image` (share image), `apple-itunes-app` meta, blurred sign-in wall | counts toward Workers 100k/day |
| `.../m/[token].ts` | `/m/:token` | GET | `get_meetup_share` → HTML, `Cache-Control: no-store`, auto-refresh meta 60 s, `noindex` | |
| `.../i/[code].ts` | `/i/:code` | GET | `get_invite` → HTML + store badges; sets invite code in store campaign param / Android install referrer (`&referrer=invite%3D{code}`) | |
| `workers/mailer` (fallback, G11) | internal | POST with shared secret | SMTP via `cloudflare:sockets` | 100k/day |

---

## 6. Storage (Cloudflare R2)

Buckets:

- **`onlyswap-media`** (public read through the media Worker only):
  - `c/{campus_id}/l/{listing_id}/{uuid}_full.webp`: max 2 MB, 1080 px long edge, WebP q≈0.72.
  - `…_thumb.webp`: max 200 KB, 400 px.
  - `c/{campus_id}/u/{user_id}/avatar_{uuid}.webp`: 512 px, max 300 KB.
  - `c/{campus_id}/chat/{chat_id}/{uuid}_full.webp`: served through the Worker only with a signed query (`?sig=` HMAC, 1 h), because chat photos are private.
  - `c/{campus_id}/quad/{post_id}/{uuid}_full.webp`.
  - `share/{listing_id}.jpg`: 1200×630, max 500 KB.
- **`onlyswap-private`**: `exports/{uid}/{id}.json` (presigned GET only; lifecycle deletes after 8 days).
- **`onlyswap-backups`**: `db/{date}.sql.age` (lifecycle deletes after 30 days).

**Image processing.** All of it happens on the client (`expo-image-manipulator` on mobile, canvas on web):

- resize
- WebP encode
- EXIF stripped by re-encoding
- blurhash computed with `blurhash` JS on the 32 px thumbnail

The server never transcodes. Lifecycle rules:

- delete `c/*/l/{draft}` objects with no listing row after 24 h (daily cron through `r2.ts` list-by-prefix compare)
- sold listings older than 180 days keep the thumbnail only

**Realtime authorization.** RLS on `realtime.messages` for private Broadcast:

```sql
create policy chat_participants on realtime.messages for select to authenticated
using ( realtime.topic() like 'chat:%' and exists (select 1 from chats c where c.id = substr(realtime.topic(),6)::uuid and auth.uid() in (c.buyer_id, c.seller_id)) );
create policy own_inbox on realtime.messages for select to authenticated
using ( realtime.topic() = 'user:' || auth.uid()::text );
```

Channels:

- `chat:{chat_id}`: message insert, meetup changes.
- `user:{uid}`: inbox badge updates for new offers and messages.

The client subscribes only while the screen is focused.

---

## 7. Push and email trigger catalog

| Event | Notification type | Group | Time-sensitive | Pref | Push text (preview-safe) | Email |
|---|---|---|---|---|---|---|
| offer created | offer_new | Offers | yes | offers | "Maya offered $35 on your mini fridge" | — |
| offer accepted | offer_accepted | Offers | yes | offers | "Devin accepted your offer. Say hi and plan the pickup." | — |
| counter | offer_countered | Offers | yes | offers | "Devin countered at $38 on the mini fridge" | — |
| declined / expired | offer_declined / offer_expired | Offers | no | offers | "Your $30 offer on the desk chair expired" | — |
| new message | message_new | Messages | no | messages | previews on: "Aisha: can we do 4:30?" / off: "New message from Aisha" | — |
| meetup proposed/confirmed/changed/cancelled | meetup_* | Meetups | yes | meetups | "Aisha moved your meetup to 5:00 PM" | — |
| T−30 min | meetup_reminder | Meetups | yes | meetups (bypasses quiet hours) | "Meet Aisha at the Rec Center at 4:30 PM" | — |
| other checked in / late | meetup_here / meetup_late | Meetups | yes | meetups | "Aisha is at the meetup spot" | — |
| +2 h after meetup | deal_check | Meetups | no | meetups | "Did the monitor sell to Aisha?" | — |
| deal done | rate_prompt | Meetups | no | meetups | "How was swapping with Aisha?" | — |
| both rated / 7 d | rating_revealed | Meetups | no | meetups | "Your rating from Aisha is in" | — |
| saved search match | saved_search_match | Alerts | no | saved_search | "New: Trek bike for $95 (matches 'bike')" | — |
| price drop ≥5% | price_drop | Alerts | no | price_drop | "Desk chair you saved is now $30" | — |
| hold → available | watch_available | Alerts | no | saved_search | "The lamp is available again" | — |
| wanted match | wanted_match | Selling | no | offers | "Someone wants a mini fridge. You have one listed." | — |
| listing 7 d no offers | listing_stale | Selling | no | **tips (opt-in)** | "No offers on your lamp in 7 days. Drop the price?" | — |
| free food | free_food | Campus | no | free_food (opt-in) | "Free pizza at Dreese Lab until 7 PM" | — |
| quad reply / milestone | quad_reply / quad_milestone | Quad | no | quad_replies | "Someone replied to your post" | — |
| report resolved | report_update | Safety | no | always | "We reviewed your report and took action" | — |
| appeal decided | appeal_decided | Account | no | always | "Your appeal was reviewed" | — |
| suspension / ban | account_notice | Account | no | always | "Your account is paused until Oct 2" | account_paused |
| campus unlocked | campus_unlocked | Campus | no | always (they asked by joining) | "Ohio State is open. Start swiping." | campus_open (waitlist_requests) |
| announcement safety | announcement_safety | Safety | no | always | admin text | — |
| announcement news/update | announcement_news | Campus | no | **tips (opt-in)** | admin text | — |
| re-verify T−14 d / T−1 d | reverify_due | Account | no | always | "Confirm you're still at Ohio State" | reverify_due |
| account deleted | — | — | — | — | — | account_deleted |
| data export ready | — | — | — | — | — | data_export |

Global rules: max 6 non-time-sensitive pushes/user/day; quiet hours in campus TZ; collapse keys per chat (`message_new`) so a burst shows one notification; Android channels = groups; iOS `interruptionLevel` `time-sensitive` only where marked.

---

## 8. Cron jobs (`supabase/migrations/0090_cron.sql`, `cron.schedule`)

| Job | Schedule | Action |
|---|---|---|
| `notify_push` | `* * * * *` | `net.http_post(send-push)` |
| `push_receipts` | `*/15 * * * *` | `net.http_post(push-receipts)` |
| `email_drain` | `*/5 * * * *` | `net.http_post(send-email)` |
| `expire_offers` | `*/5 * * * *` | pending/countered past `expires_at` → expired |
| `expire_food` | `*/10 * * * *` | food listings past `expires_at` → expired; check-ins → removed |
| `meetup_reminders` | `*/5 * * * *` | confirmed meetups starting in 25–35 min, `reminder_sent_at` null |
| `deal_checks` | `*/15 * * * *` | meetups started ≥2 h ago → `deal_check` |
| `noshow_autoconfirm` | `0 * * * *` | open no-show reports 24 h unanswered → confirm, increment count |
| `rating_reveal` | `0 * * * *` | ratings reaching 7 d → notify |
| `stale_listings` | `0 21 * * *` (≈4 PM ET) | active sale listings 7 d old, 0 offers, not nudged → `listing_stale` (tips pref) |
| `listings_expire` | `0 8 * * *` | active listings 60 d old → expired (relist prompt) |
| `reverify_reminders` | `0 14 * * *` | verified_until in 14 d / 1 d |
| `reverify_enforce` | `30 14 * * *` | verified_until < today → status reverify |
| `pause_lift` | `*/10 * * * *` | paused_until passed → active |
| `refresh_stats` | `*/10 * * * *` | `refresh materialized view concurrently profile_stats` |
| `refresh_hints` | `0 9 * * *` | price_hints, campus_trending_terms (hourly `0 * * * *`) |
| `prune` | `30 9 * * *` | swipes >30 d (non-save), notifications >60 d, rate_counters >2 d, push_tickets >7 d, age_blocks >365 d, waitlist_requests >12 mo, daily draft photo cleanup trigger |
| `archive_chats` | `0 10 * * *` | chats closed >90 d → messages exported to R2 `archive/` then deleted (keeps DB <500 MB) |
| `strike_expiry` | `0 11 * * *` | strikes past expires_at → strike_count-- |

Also scheduled: `demo_autoplay` (`* * * * *`), Demo University only: the bot accepts pending offers after 10 s, sends the scripted reply, proposes a meetup and checks in after the reviewer checks in.

Staging only: `test_set_now(ts)` RPC and the `private.now()` override for time-travel tests (never created in production; the migration is guarded by `app.env`).

GitHub Actions (not in DB): `backup.yml` nightly 03:00 UTC; `keepalive.yml` daily (staging only, pre-launch); `ci.yml`; `release.yml`.

---

## 9. Seed data, demo/reviewer account, migrations

**`supabase/seed.sql`** (local and staging only)
- **Campuses:**
  - "Ohio State" (`osu`, domains `osu.edu`, `buckeyemail.osu.edu`; blocked `alumni.osu.edu`; status live)
  - "Demo University" (`demo`, domain `review.onlyswap.test`, `is_demo` true, live)
  - "Michigan" (`umich`, waitlist, 213 members simulated through a count override)
- Categories as listed in §2.2.
- Safe spots: 3 placeholder zones for OSU (flagged "verify with campus police") and 3 for Demo.
- Banned words: about 150 entries covering the expanded list (plan §19.5) with slang variants.
- 40 demo listings using bundled royalty-free photos uploaded by `scripts/seed-media.ts`, plus 12 Quad posts, 1 poll, 3 users.

**`scripts/seed-review.ts`** (runs against production once, service role)
- Creates `appreview@review.onlyswap.test` and `playreview@review.onlyswap.test` with passwords from 1Password (not in the repo), `email_confirm: true`.
- Inserts them into `review_accounts` and sets `adult_confirmed_at` with `age_method='review'` and rules accepted.
- Creates the Demo University bot seller `Devin (demo)`.
- The cron job `demo_autoplay` runs every minute on the demo campus only:
  - accepts pending offers to bot listings after 10 s
  - sends the scripted reply "hi! can you do 4:30 at the Rec Center?"
  - proposes a meetup
  - after a reviewer checks in, the bot checks in and marks it done
- The demo campus is excluded from metrics.

**Migration strategy**
- Forward-only SQL files, numbered `0001`–`0099` for the schema and `01xx` for later changes.
- `supabase db diff` is used only as a helper; files are hand-reviewed.
- Every migration is tested locally with `supabase db reset` + pgTAP.
- CI applies migrations to **staging** on merge to `main` (`supabase db push --linked`) and to **production** only on a release tag, after a backup snapshot (`backup.yml` workflow_call).
- Destructive changes (drop or rename) take two releases: add the new thing and backfill, deploy the app, then drop.
- Generated types: `supabase gen types typescript --linked > packages/shared/src/db.ts`. CI checks it for drift.
