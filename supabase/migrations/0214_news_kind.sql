-- Campus news posts (DEC 98): a new listing kind. Postgres can't use a new enum
-- value in the transaction that adds it, so it gets its own migration; 0215
-- adds the columns and RPCs.

alter type public.listing_kind add value if not exists 'news';
