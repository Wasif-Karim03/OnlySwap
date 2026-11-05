-- 0258_rides_phrases.sql · QA-M17: "rides" as a single word held honest listings
-- ("Trek bike, rides great"). Rideshare offers are matched as phrases instead,
-- still with action 'review' on listings and the Quad.
delete from public.banned_words where pattern = 'rides' and match = 'word';

insert into public.banned_words (pattern, match, scopes, action)
select v.pattern, 'phrase', '{listing,quad}', 'review'
from (values
  ('need a ride'),
  ('giving rides'),
  ('offering rides'),
  ('ride to the airport'),
  ('ride to campus')
) as v(pattern)
where not exists (
  select 1 from public.banned_words b where b.pattern = v.pattern and b.match = 'phrase'
);
