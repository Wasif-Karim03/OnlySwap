#!/usr/bin/env bash
# Single-call latency of hot RPCs on the seeded loadtest campus (warm cache, 15 runs each, as an authenticated user).
PGURL=${PGURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
B=50000000-0000-4000-8000-000000000660   # buyer with chats
S=50000000-0000-4000-8000-000000004321   # seller with 34 offers/16 chats
A=50000000-0000-4000-8000-000000000001   # admin (owner)
LST=60000000-0000-4000-8000-000000016008
CHAT=085a2f86-2f8e-e108-3742-7f8b66a3a35b
HEAVY=0004af29-6245-067b-e6f8-f141e2221aa6
POST=37e5c176-01ba-7895-82bb-18c2318d8d9e
run() { # name user sql
  local out
  out=$(psql "$PGURL" -X -q -At <<SQL | grep -E '^Time:' | sed 's/Time: //; s/ ms//' | sort -n
select set_config('request.jwt.claims', '{"sub":"$2","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
\timing on
$3;$3;$3;$3;$3;$3;$3;$3;$3;$3;$3;$3;$3;$3;$3;
SQL
)
  # drop the first (warm-up), report median / max
  local n=$(echo "$out" | wc -l)
  local med=$(echo "$out" | sed -n "$(( (n+1)/2 ))p"); local max=$(echo "$out" | tail -1); local min=$(echo "$out" | head -1)
  printf '%-34s min %8s  median %8s  max %8s ms\n' "$1" "$min" "$med" "$max"
}
run get_feed_p1            $B "select public.get_feed(null,20) is not null"
run get_campus_feed_all    $B "select public.get_campus_feed('all',null) is not null"
run get_campus_feed_free   $B "select public.get_campus_feed('free',null) is not null"
run search_listings_q      $B "select public.search_listings('fridge','{}',null) is not null"
run search_listings_q_off200 $B "select public.search_listings('fridge','{}','{\"offset\":200}') is not null"
run search_listings_noq    $B "select public.search_listings(null,'{}',null) is not null"
run search_suggest         $B "select public.search_suggest('fri') is not null"
run get_listing            $B "select public.get_listing('$LST') is not null"
run my_listings_seller     $S "select public.my_listings() is not null"
run get_inbox_seller       $S "select public.get_inbox() is not null"
run get_inbox_buyer        $B "select public.get_inbox() is not null"
run get_chat               $B "select public.get_chat('$CHAT') is not null"
run get_messages_30        $B "select public.get_messages('$CHAT',null,30,null) is not null"
run get_notifications      $B "select public.get_notifications(null,30) is not null"
run get_quad_feed_hot      $B "select public.get_quad_feed('hot',null) is not null"
run get_quad_feed_new      $B "select public.get_quad_feed('new',null) is not null"
run get_quad_thread        $B "select public.get_quad_thread('$POST') is not null"
run get_me                 $B "select public.get_me() is not null"
run get_saved              $B "select public.get_saved() is not null"
run admin_overview_v2      $A "select public.admin_overview_v2(null) is not null"
run admin_list_reports     $A "select public.admin_list_reports('{}',0) is not null"
run admin_list_listings    $A "select public.admin_list_listings('{}',0) is not null"
run admin_list_users_v2    $A "select public.admin_list_users_v2('{}',0) is not null"
run admin_list_audit_v2    $A "select public.admin_list_audit_v2('{}',null) is not null"
run admin_search           $A "select public.admin_search('lt12') is not null"
