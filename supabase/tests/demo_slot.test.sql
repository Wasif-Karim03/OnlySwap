-- 0034: the demo seller proposes daytime meetups.
begin;
select plan(4);
select is(private.demo_slot('2027-03-10 14:20:00-05', 'America/New_York'), '2027-03-10 16:00:00-05'::timestamptz, 'afternoon: two hours ahead');
select is(private.demo_slot('2027-03-10 23:20:00-05', 'America/New_York'), '2027-03-11 10:00:00-05'::timestamptz, 'late night: 10:00 next morning');
select is(private.demo_slot('2027-03-10 03:00:00-05', 'America/New_York'), '2027-03-10 10:00:00-05'::timestamptz, 'early morning: 10:00 the same day');
select is(private.demo_slot('2027-03-10 18:10:00-05', 'America/New_York'), '2027-03-10 20:00:00-05'::timestamptz, 'evening up to 20:00');
select * from finish();
rollback;
