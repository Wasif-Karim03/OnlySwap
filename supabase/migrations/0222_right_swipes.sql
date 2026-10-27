-- 0222_right_swipes.sql · admin swipe counts follow-up, DEC 106.
-- The app sent a right swipe as 'left' (swipe_dir had no 'right'), so every
-- admin "passed" count (person page, listing activity, timeline, the data
-- export) also counted people who swiped right. Now a right swipe is stored
-- as 'right'; it keeps the card off the deck for 30 days like any swipe, and
-- the retention job removes it after 30 days like a left swipe. Older app
-- builds keep sending 'left' (no change for them). record_swipes needs no
-- change: it casts dir to swipe_dir and skips values it doesn't know.
-- prune_retention is copied from 0028 with only the swipes line changed.

alter type public.swipe_dir add value if not exists 'right';

create or replace function private.prune_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  res jsonb := '{}';
  n int;
begin
  delete from public.notifications where created_at < private.now() - interval '60 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('notifications', n);
  -- Left and right swipes go after 30 days (saves stay; 'infinity' rows are hides).
  delete from public.swipes where dir <> 'save' and created_at <> 'infinity' and created_at < private.now() - interval '30 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('swipes', n);
  delete from public.rate_counters where window_start < private.now() - interval '2 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('rate_counters', n);
  delete from public.activity_days where day < (private.now() - interval '400 days')::date;
  get diagnostics n = row_count; res := res || jsonb_build_object('activity_days', n);
  delete from public.age_blocks where created_at < private.now() - interval '365 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('age_blocks', n);
  delete from public.waitlist_requests where notified_at is not null or created_at < private.now() - interval '12 months';
  get diagnostics n = row_count; res := res || jsonb_build_object('waitlist_requests', n);
  delete from public.reports where status <> 'open' and resolved_at < private.now() - interval '180 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('reports', n);
  delete from public.push_tickets where created_at < private.now() - interval '30 days';
  delete from public.email_outbox where state in ('sent', 'failed') and coalesce(sent_at, send_after) < private.now() - interval '30 days';
  delete from public.data_exports where expires_at < private.now() - interval '1 day';
  return res;
end;
$$;
