-- G-02 (DEC 105): a +tag on the school address is the same person. The hash
-- drops it, so a ban or an age block can't be dodged with name+1@school, and
-- a second account on an alias of an existing one is refused (T-INT-AUTH-ALIAS).
begin;
select plan(11);
select tests.create_fixtures();
update public.profiles set email_hash = private.email_hash('a@osu.edu') where id = tests.uid('A');
insert into public.banned_hashes (email_hash) values (private.email_hash('gone@osu.edu'));
insert into public.age_blocks (email_hash) values (private.email_hash('kid@osu.edu'));

create function pg_temp.before(email text) returns text language sql as $$
  select coalesce(private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', email)))
                  #>> '{error,message}', 'allow')
$$;

-- The hash ----------------------------------------------------------------------------------------
select is(private.email_hash('Sam+books@OSU.edu'), private.email_hash('sam@osu.edu'), 'a +tag is dropped');
select is(private.email_hash('  sam+a+b@osu.edu '), private.email_hash('sam@osu.edu'), 'everything after the first + goes');
select isnt(private.email_hash('s.am@osu.edu'), private.email_hash('sam@osu.edu'), 'dots still count (school mail is not Gmail)');
select isnt(private.email_hash('+x@osu.edu'), private.email_hash('@osu.edu'), 'a leading + is kept, never an empty name');
select is(private.email_hash('sam@osu.edu'),
  encode(sha256(convert_to('sam@osu.edu' || private.secret('email_hash_pepper'), 'UTF8')), 'hex'),
  'an address with no +tag hashes as before (stored hashes stay valid)');

-- The sign-up hook --------------------------------------------------------------------------------
select is(pg_temp.before('gone+again@osu.edu'), 'BANNED', 'a banned student cannot come back on a +alias');
select is(pg_temp.before('kid+18@osu.edu'), 'AGE_BLOCKED', 'an age-blocked student cannot retry on a +alias');
select is(pg_temp.before('a+second@osu.edu'), 'EMAIL_ALIAS', 'a second account on an alias of an existing one is refused');
select is(pg_temp.before('newkid+market@osu.edu'), 'allow', 'a first account on a +address is fine');

-- Admin bans --------------------------------------------------------------------------------------
create function pg_temp.as_owner(q text) returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid('OWN'), 'aal2');
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
select is(pg_temp.as_owner($$select public.admin_upsert_banned_hash('sam+x@osu.edu', 'scam ring')::text$$) like 'ERROR%', false,
  'the owner bans an address written with a +tag');
select is(pg_temp.before('sam@osu.edu'), 'BANNED', 'the plain address is banned too');

select * from finish();
rollback;
