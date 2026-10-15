-- 0228: index the foreign keys that had none (audit E-15, DEC 115).
-- Deleting an account sets profile FKs to null or cascades; without an index
-- each one is a seq scan (messages.sender_id was ~20 ms at 200k rows, linear).
-- Nullable columns get partial indexes: the null rows are never looked up.
-- FKs into campuses and categories stay unindexed: small reference tables
-- nobody deletes from at runtime.

create index messages_sender_id_idx on public.messages (sender_id) where sender_id is not null;
create index listings_hold_offer_id_idx on public.listings (hold_offer_id) where hold_offer_id is not null;
create index meetups_proposed_by_idx on public.meetups (proposed_by) where proposed_by is not null;
create index meetups_spot_id_idx on public.meetups (spot_id) where spot_id is not null;
create index noshow_reports_reporter_id_idx on public.noshow_reports (reporter_id) where reporter_id is not null;
create index noshow_reports_reported_id_idx on public.noshow_reports (reported_id) where reported_id is not null;
create index ratings_rater_id_idx on public.ratings (rater_id) where rater_id is not null;
create index quad_hides_hidden_author_id_idx on public.quad_hides (hidden_author_id);
create index quad_hides_source_post_id_idx on public.quad_hides (source_post_id) where source_post_id is not null;
create index quad_poll_votes_user_id_idx on public.quad_poll_votes (user_id);
create index quad_poll_votes_option_id_idx on public.quad_poll_votes (option_id);
