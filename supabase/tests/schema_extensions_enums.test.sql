-- P3-DB-01: extensions, enums, private schema and its two early helpers.
begin;
select plan(28);

select has_extension('pg_trgm', 'pg_trgm installed');
select has_extension('unaccent', 'unaccent installed');
select has_extension('pgcrypto', 'pgcrypto installed');
select has_extension('pg_cron', 'pg_cron installed');
select has_extension('pg_net', 'pg_net installed');
select hasnt_extension('pg_graphql', 'pg_graphql is disabled (BE-13)');

select enum_has_labels('public', 'campus_status', array['waitlist','live','paused'], 'campus_status labels');
select enum_has_labels('public', 'user_status', array['active','waitlist','reverify','paused','suspended','banned'], 'user_status labels');
select enum_has_labels('public', 'class_year', array['freshman','sophomore','junior','senior','grad','other'], 'class_year labels');
select enum_has_labels('public', 'age_method', array['os_signal','self_declared','review'], 'age_method labels');
select enum_has_labels('public', 'listing_kind', array['sale','free','wanted','food'], 'listing_kind labels');
select enum_has_labels('public', 'listing_status', array['active','hold','sold','expired','held_review','removed','deleted'], 'listing_status labels');
select enum_has_labels('public', 'item_condition', array['new','like_new','good','fair'], 'item_condition labels');
select enum_has_labels('public', 'swipe_dir', array['left','save'], 'swipe_dir labels');
select enum_has_labels('public', 'offer_status', array['pending','countered','accepted','declined','expired','withdrawn','auto_declined'], 'offer_status labels');
select enum_has_labels('public', 'chat_status', array['open','closed','blocked'], 'chat_status labels');
select enum_has_labels('public', 'message_kind', array['text','system','meetup','photo'], 'message_kind labels');
select enum_has_labels('public', 'meetup_status', array['proposed','confirmed','cancelled','completed','no_show'], 'meetup_status labels');
select enum_has_labels('public', 'report_status', array['open','actioned','dismissed'], 'report_status labels');
select enum_has_labels('public', 'admin_role', array['owner','moderator'], 'admin_role labels');
select enum_has_labels('public', 'push_state', array['pending','sending','sent','skipped','failed'], 'push_state labels');
select enum_has_labels('public', 'spot_designation', array['public','police'], 'spot_designation labels');

select has_schema('private', 'private schema exists');
select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'anon and authenticated cannot use the private schema'
);

select is(private.unaccent_immutable('Café Crème'), 'Cafe Creme', 'unaccent_immutable strips accents');
select is(
  (select provolatile from pg_proc where oid = 'private.unaccent_immutable(text)'::regprocedure),
  'i'::"char",
  'unaccent_immutable is immutable (usable in generated columns)'
);
select matches(private.new_invite_code(), '^[A-HJKMNP-Z2-9]{8}$', 'invite codes are 8 chars with no look-alikes');
select ok(
  (select count(distinct c) from (select private.new_invite_code() as c from generate_series(1, 200)) s) = 200,
  '200 invite codes are all different'
);

select * from finish();
rollback;
