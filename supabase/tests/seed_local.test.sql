-- P3-SEED-01: `supabase db reset` gives a usable local app (seed.sql).
-- Runs against the seeded database (no fixtures).
begin;
select plan(8);

select is((select string_agg(slug || ':' || status, ',' order by slug) from public.campuses),
  'demo:live,osu:live,umich:waitlist', 'three campuses: launch, reviewer, waitlist');
select is((select count(*)::int from public.listings where status = 'active'), 40, '40 active demo listings');
select is((select count(*)::int from public.profiles p
           where p.first_name is not null and p.adult_confirmed_at is not null and p.rules_accepted_at is not null), 6,
  'six onboarded users (fixture and reviewer accounts)');
select is((select status::text from public.profiles p join auth.users u on u.id = p.id where u.email = 'dana@umich.edu'),
  'waitlist', 'the umich user waits for their campus');
select is((select count(*)::int from public.notification_prefs), (select count(*)::int from public.profiles),
  'every profile has notification preferences');
select ok((select count(*) from public.safe_spots where active) >= 5, 'meetup spots on both live campuses');
select ok(exists (select 1 from auth.identities i join auth.users u on u.id = i.user_id
                  where u.email = 'appreview@review.onlyswap.test' and i.provider = 'email'),
  'reviewer has an email identity for password sign-in');
select is(
  (select private.hook_before_user_created('{"user":{"email":"newstudent@osu.edu"}}')),
  '{}'::jsonb, 'a new osu.edu address can sign up locally');

select * from finish();
rollback;
