// Fires the R1.0 notification types through real flows and prints what each
// person got (P9-PUSH-04; TESTING Push). Local or staging:
//   ANON_KEY=... SERVICE_KEY=... [SUPABASE_URL=...] node --experimental-strip-types scripts/fire-all-notifications.ts
// The types that come from crons or the admin console (meetup_reminder,
// deal_check, listing_stale, reverify_due, account_notice, report_update,
// appeal_decided) are covered by pgTAP (push, meetups, deals, notify_cron);
// on staging they appear once their job runs.
// @ts-expect-error: plain JS helper module shared with the smokes
import { campusOf, check, done, listing, rpc, service, student, url } from './verify/lib.mjs';

type Session = { token: string; id: string };

const stamp = Date.now();
const seller: Session = await student(`fire-seller-${stamp}@osu.edu`, 'Sam');
const buyer: Session = await student(`fire-buyer-${stamp}@osu.edu`, 'Bea');
const other: Session = await student(`fire-other-${stamp}@osu.edu`, 'Cal');
const campus: string = await campusOf(seller);

// saved_search_match: Bea saves a search first.
await rpc('create_saved_search', { query: 'lamp' }, buyer.token);
const lamp: string = await listing(seller, campus, { title: 'Desk lamp', price_cents: 2000 });
const rug: string = await listing(seller, campus, { title: 'Rug', price_cents: 3000 });

// price_drop and watch_available
await rpc('save_listing', { listing_id: rug }, other.token);
await rpc('update_listing', { id: rug, price_cents: 2000 }, seller.token);

// offer_new → offer_countered → offer_accepted; offer_declined for Cal's offer
const o1 = (await rpc('make_offer', { listing_id: lamp, amount_cents: 1500 }, buyer.token)).body.id;
await rpc('make_offer', { listing_id: lamp, amount_cents: 1200 }, other.token);
await rpc('counter_offer', { offer_id: o1, amount_cents: 1800 }, seller.token);
const chat = (await rpc('accept_offer', { offer_id: o1 }, buyer.token)).body.chat_id;

// message_new, meetup_proposed, meetup_confirmed, meetup_status, meetup_changed
await rpc(
  'send_message',
  { chat_id: chat, body: 'Hi, still on for today?', client_id: crypto.randomUUID() },
  buyer.token,
);
const soon = new Date(Date.now() + 40 * 60_000).toISOString();
const m = (
  await rpc(
    'propose_meetup',
    { chat_id: chat, starts_at: soon, custom_place: 'Library steps' },
    seller.token,
  )
).body.id;
await rpc('confirm_meetup', { meetup_id: m }, buyer.token);
await rpc('checkin_meetup', { meetup_id: m }, buyer.token);
await rpc('running_late', { meetup_id: m, minutes: 10 }, seller.token);

// rate_prompt via a done deal
await rpc('confirm_deal', { chat_id: chat, outcome: 'done' }, seller.token);

// offer_expired: covered by the expire_offers cron (pgTAP); watch_available when a hold is lifted.
const res = await fetch(
  `${url}/rest/v1/notifications?select=user_id,type,title,body&user_id=in.(${seller.id},${buyer.id},${other.id})&order=id`,
  { headers: { apikey: service, authorization: `Bearer ${service}` } },
);
const rows = (await res.json()) as { user_id: string; type: string; title: string; body: string }[];
const name = (id: string) => (id === seller.id ? 'Sam' : id === buyer.id ? 'Bea' : 'Cal');
for (const r of rows)
  console.log(`${name(r.user_id).padEnd(4)} ${r.type.padEnd(20)} ${r.title} | ${r.body}`);

const types = new Set(rows.map((r) => r.type));
for (const t of [
  'saved_search_match',
  'price_drop',
  'offer_new',
  'offer_countered',
  'offer_accepted',
  'offer_declined',
  'message_new',
  'meetup_proposed',
  'meetup_confirmed',
  'meetup_status',
  'rate_prompt',
]) {
  check(types.has(t), `${t} fired`);
}
// Dedupe: each (user, type, key) once; the counter round notified once.
check(
  rows.filter((r) => r.type === 'offer_countered').length === 1,
  'offer_countered once (dedupe)',
);
// Preview-safe: message text is hidden unless the recipient turned previews on.
check(
  rows.some((r) => r.type === 'message_new' && r.body.startsWith('New message from')),
  'message_new hides the text by default',
);
done();
