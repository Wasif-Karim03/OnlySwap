#!/usr/bin/env bash
# DB-level race tests against the local loadtest campus. Uses real RPCs as authenticated users in concurrent psql sessions.
# Fixtures: seller 100, buyers 101-103, created fresh each test (removed by cleanup.sql with the rest of the campus).
PGURL=${PGURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
CAMP=90000000-0000-4000-8000-000000000001
u() { printf '50000000-0000-4000-8000-%012d' "$1"; }
P() { psql "$PGURL" -X -q -At "$@"; }
sess() { # user, sql  -> runs as that user in one session
  psql "$PGURL" -X -q -At -v ON_ERROR_STOP=0 <<SQL 2>&1
select set_config('request.jwt.claims','{"sub":"$(u $1)","role":"authenticated","aal":"aal2"}',false);
set role authenticated;
$2
SQL
}
newlisting() { # seller -> id (active sale, firm=false)
  P -c "insert into public.listings(id,campus_id,seller_id,kind,status,title,price_cents,category_id,expires_at) values (gen_random_uuid(),'$CAMP','$(u $1)','sale','active','race item',2000,1,now()+interval '30 days') returning id" | head -1
}
reset_rl() { P -c "delete from public.rate_counters where user_id::text like '50000000-%'" >/dev/null; }
reset_rl
echo "### F-01 two sellers-side accepts of two different offers on one listing, concurrent (20 rounds)"
win=0; both=0; none=0
for i in $(seq 1 20); do
  L=$(newlisting 100); reset_rl
  O1=$(sess 101 "select (public.make_offer('$L',1500,null,'{}')::jsonb->>'id');" | tail -1)
  O2=$(sess 102 "select (public.make_offer('$L',1600,null,'{}')::jsonb->>'id');" | tail -1)
  sess 100 "select 'A:'||(public.accept_offer('$O1')::text);" > /tmp/race_a.$$ &
  sess 100 "select 'B:'||(public.accept_offer('$O2')::text);" > /tmp/race_b.$$ &
  wait
  ok=$(cat /tmp/race_a.$$ /tmp/race_b.$$ | grep -c "chat_id")
  chats=$(P -c "select count(*) from public.chats where listing_id='$L'")
  [ "$ok" = 1 ] && [ "$chats" = 1 ] && win=$((win+1)) || { [ "$ok" = 2 ] && both=$((both+1)) || none=$((none+1)); }
done
echo "exactly-one-wins=$win both-won=$both neither=$none"
echo
echo "### F-02 first offers by many buyers on ONE listing concurrently (FOR SHARE then UPDATE offer_count): deadlock probe"
L=$(newlisting 100); reset_rl
cat > /tmp/race_offer.$$.sql <<SQL
\set b random(1000,4900)
begin;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-' || lpad(:b::text,12,'0') || '","role":"authenticated"}',true);
set local role authenticated;
select public.make_offer('$L', 1500, null, '{}');
commit;
SQL
pgbench -n -f /tmp/race_offer.$$.sql -c 24 -j 4 -t 20 --failures-detailed "$PGURL" 2>&1 | grep -E "transactions|failed|deadlock|latency average"
echo "offer_count on listing after run: $(P -c "select offer_count from public.listings where id='$L'") vs actual offers rows: $(P -c "select count(*) from public.offers where listing_id='$L'")"
echo
echo "### F-03 accept_offer (seller) vs withdraw_offer (buyer) interleaved: withdraw passes status check, then blocks on accept's row lock"
L=$(newlisting 100); reset_rl
O=$(sess 101 "select (public.make_offer('$L',1500,null,'{}')::jsonb->>'id');" | tail -1)
( sess 100 "begin; select 'accept:'||public.accept_offer('$O')::text; select pg_sleep(3); commit;" ) > /tmp/race_acc.$$ &
sleep 1
( sess 101 "select 'withdraw:ok' from (select public.withdraw_offer('$O')) x;" ) > /tmp/race_wd.$$ &
wait
cat /tmp/race_acc.$$ /tmp/race_wd.$$ | grep -E "accept|withdraw|ERROR" | cut -c1-120
P -c "select 'offer status='||o.status||' | listing status='||l.status||' | chat rows='||(select count(*) from public.chats c where c.offer_id=o.id) from public.offers o join public.listings l on l.id=o.listing_id where o.id='$O'"
echo
echo "### F-04 send_message with the same client_id from two concurrent sessions (10 rounds)"
CH=$(P -c "select id from public.chats where seller_id='$(u 4321)' and buyer_id::text like '50000000%' and status='open' limit 1")
bad=0
for i in $(seq 1 10); do
  CID=$(P -c "select gen_random_uuid()")
  sess 4321 "select (public.send_message('$CH','dup $i','$CID','text',null)::jsonb->>'id');" > /tmp/race_m1.$$ &
  sess 4321 "select (public.send_message('$CH','dup $i','$CID','text',null)::jsonb->>'id');" > /tmp/race_m2.$$ &
  wait
  n=$(P -c "select count(*) from public.messages where chat_id='$CH' and client_id='$CID'")
  a=$(tail -1 /tmp/race_m1.$$); b=$(tail -1 /tmp/race_m2.$$)
  [ "$n" = 1 ] && [ "$a" = "$b" ] || { bad=$((bad+1)); echo "round $i rows=$n a=$a b=$b"; }
done
echo "rounds with duplicate row or different ids/errors: $bad / 10"
echo
echo "### F-05 create_listing with the same reserved id from two concurrent sessions (10 rounds)"
errs=0; dup=0
for i in $(seq 1 10); do
  RID=$(sess 200 "select public.reserve_listing_id();" | tail -1)
  PH="[{\"path\":\"c/$CAMP/l/$RID/a.webp\",\"thumb_path\":\"c/$CAMP/l/$RID/t.webp\",\"width\":1,\"height\":1}]"
  CALL="select left(public.create_listing(id=>'$RID'::uuid, kind=>'sale', title=>'race listing $i', category_id=>1::smallint, condition=>'good', price_cents=>1500, open_to_offers=>true, photos=>'$PH'::jsonb)::text,12);"
  sess 200 "$CALL" > /tmp/race_l1.$$ &
  sess 200 "$CALL" > /tmp/race_l2.$$ &
  wait
  n=$(P -c "select count(*) from public.listings where id='$RID'")
  e=$(cat /tmp/race_l1.$$ /tmp/race_l2.$$ | grep -c ERROR)
  [ "$n" != 1 ] && dup=$((dup+1)); [ "$e" -gt 0 ] && { errs=$((errs+1)); [ $errs = 1 ] && cat /tmp/race_l1.$$ /tmp/race_l2.$$ | grep ERROR | head -1 | cut -c1-160; }
done
echo "rounds where listing row count != 1: $dup ; rounds where one caller got an error instead of the first result: $errs / 10"
echo
echo "### F-06 mark_sold (seller) in flight while buyer sends a message in the open chat"
L=$(newlisting 100); reset_rl
O=$(sess 101 "select (public.make_offer('$L',1500,null,'{}')::jsonb->>'id');" | tail -1)
sess 100 "select public.accept_offer('$O');" >/dev/null
CH=$(P -c "select id from public.chats where offer_id='$O'")
( sess 100 "begin; select public.mark_sold('$L','$(u 101)'); select pg_sleep(3); commit;" ) > /tmp/race_s1.$$ &
sleep 1
( sess 101 "select 'msg:'||(public.send_message('$CH','still here?',gen_random_uuid(),'text',null)::jsonb->>'id');" ) > /tmp/race_s2.$$ &
wait
cat /tmp/race_s2.$$ | cut -c1-120
echo "(by design the buyer's own chat stays open after mark_sold with buyer_id; other chats are closed)"
P -c "select 'chat status='||c.status||' | msgs after close='||(select count(*) from public.messages m where m.chat_id=c.id and m.sender_id is not null and m.created_at >= coalesce(c.closed_at, 'infinity')) from public.chats c where c.id='$CH'"
echo "later send (after commit):"; sess 101 "select public.send_message('$CH','after',gen_random_uuid(),'text',null);" | head -2 | cut -c1-120
rm -f /tmp/race_*.$$*
