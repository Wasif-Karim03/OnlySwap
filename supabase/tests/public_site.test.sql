-- S37/S38: public site RPCs (P13-WEB-02, P13-WEB-06). Anonymous callers only see
-- campus progress, active meetup spots, and cards for shared, live listings.
begin;
select plan(10);
select tests.create_fixtures();

create function pg_temp.anon(q text) returns text language plpgsql as $$
declare
  res text;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.9"}', true);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;

insert into public.listings (id, campus_id, seller_id, title, status, price_cents, share_image_path) values
  ('00000000-0000-4000-8000-0000000000c1', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1500, 'share/00000000-0000-4000-8000-0000000000c1.jpg'),
  ('00000000-0000-4000-8000-0000000000c2', tests.uid('OSU'), tests.uid('A'), 'Never shared', 'active', 900, null),
  ('00000000-0000-4000-8000-0000000000c3', tests.uid('OSU'), tests.uid('A'), 'Sold chair', 'sold', 900, 'share/00000000-0000-4000-8000-0000000000c3.jpg');

select ok(pg_temp.anon($$select public.public_campus_progress()::text$$) like '[{%', 'anon can read campus progress');
select is(pg_temp.anon($$select (public.public_campus_progress() -> 0 ? 'members')::text$$), 'true', 'with member counts');
select is(pg_temp.anon($$select (select count(*) from jsonb_array_elements(public.public_campus_progress()) e where e ? 'id')::text$$),
  '0', 'no internal ids');
select is(pg_temp.anon($$select public.get_listing_public_card('00000000-0000-4000-8000-0000000000c1') ->> 'title'$$), 'Desk lamp',
  'a shared, active listing has a card');
select is(pg_temp.anon($$select (public.get_listing_public_card('00000000-0000-4000-8000-0000000000c1') ? 'seller_id')::text$$), 'false',
  'the card names no one');
select is(pg_temp.anon($$select public.get_listing_public_card('00000000-0000-4000-8000-0000000000c2')::text$$), null,
  'an unshared listing has none');
select is(pg_temp.anon($$select public.get_listing_public_card('00000000-0000-4000-8000-0000000000c3')::text$$), null,
  'a sold listing has none');
select is(pg_temp.anon(format($$select jsonb_typeof(public.public_safe_spots(%L))$$, (select slug from public.campuses where id = tests.uid('OSU')))),
  'array', 'meetup spots by campus slug');
select is(pg_temp.anon($$select public.public_safe_spots('no-such-school')::text$$), '[]', 'unknown school: empty');

-- 60 per minute per IP
select ok(pg_temp.anon($$select count(public.get_listing_public_card('00000000-0000-4000-8000-0000000000c1'))::text from generate_series(1, 70)$$)
  like 'ERROR: RATE_LIMITED%', 'card lookups are rate limited');

select * from finish();
rollback;
