-- P3-DB-07: rate limits, banned-word check, PII check, names_student.
begin;
select plan(26);
select tests.create_fixtures();

-- hit(): fixed windows, retry time in the message (API §0 RATE_LIMITED:<action>:<retry_at>)
select tests.set_now('2027-03-14 09:10:00+00');
select tests.set_claims(tests.uid('A'));
select lives_ok($$select private.hit('offer', 2, interval '1 hour')$$, '1st of 2 allowed');
select lives_ok($$select private.hit('offer', 2, interval '1 hour')$$, '2nd of 2 allowed');
select throws_ok($$select private.hit('offer', 2, interval '1 hour')$$, 'P0001',
  'RATE_LIMITED:offer:2027-03-14T10:00:00Z', '3rd is refused with the reset time');
select tests.set_claims(tests.uid('B'));
select lives_ok($$select private.hit('offer', 2, interval '1 hour')$$, 'limits are per user');
select tests.set_now('2027-03-14 10:00:01+00');
select tests.set_claims(tests.uid('A'));
select lives_ok($$select private.hit('offer', 2, interval '1 hour')$$, 'a new window starts fresh');
select tests.set_claims(null);
select throws_ok($$select private.hit('offer', 2, interval '1 hour')$$, 'P0001', 'NOT_AUTHENTICATED', 'hit needs a user');

-- hit_ip(): keyed by a hash of the first x-forwarded-for address
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', true);
select lives_ok($$select private.hit_ip('waitlist', 1, interval '1 day')$$, 'first request from an IP');
select throws_ok($$select private.hit_ip('waitlist', 1, interval '1 day')$$, 'P0001', null, 'second is limited');
select set_config('request.headers', '{"x-forwarded-for":"198.51.100.4"}', true);
select lives_ok($$select private.hit_ip('waitlist', 1, interval '1 day')$$, 'another IP has its own limit');
select is(
  (select count(distinct user_id)::int from public.rate_counters where action = 'ip:waitlist'),
  2, 'one hashed key per IP (the address itself is not stored)'
);

-- check_text: normalization and scopes (API §1)
select is(private.check_text('Selling my old desk lamp', 'listing'), 'ok', 'clean text is ok');
select is(private.check_text('VAPE for sale', 'listing'), 'block:vape', 'case-insensitive word match');
select is(private.check_text('v4pe pen barely used', 'listing'), 'block:vape pen', 'leetspeak, longest term wins');
select is(private.check_text('weeeeed', 'listing'), 'block:weed', 'squashed repeats');
select is(private.check_text('Fake-ID available', 'listing'), 'block:fake id', 'punctuation between words');
select is(private.check_text('Calculator + exam answers', 'listing'), 'review:exam answers', 'review terms hold for review (X14)');
select is(private.check_text('Beer pong table', 'listing'), 'block:beer', 'double letters are kept ("beer")');
select is(private.check_text('Weedwacker for the lawn', 'listing'), 'ok', 'whole words only');
select is(private.check_text('I sell vapes', 'rating'), 'ok', 'terms apply only in their scopes');
select is(private.check_text('Café crème mug', 'listing'), 'ok', 'accents do not cause false hits');
select is(private.check_text(null, 'listing'), 'ok', 'empty text is ok');
select cmp_ok(
  (select fired_count from public.banned_words where pattern = 'vape' and match = 'word'), '>=', 1,
  'fired_count is bumped'
);

-- pii_check (Quad anonymity, T-INT-QUAD-01)
select is(private.pii_check('call me 614-555-0199'), 'pii:phone', 'phone number');
select is(private.pii_check('mail maya@osu.edu'), 'pii:email', 'email address');
select is(private.pii_check('see www.example.com'), 'pii:url', 'link');
select is(private.pii_check('in room 214 of Baker'), 'pii:room', 'room number');

select * from finish();
rollback;
