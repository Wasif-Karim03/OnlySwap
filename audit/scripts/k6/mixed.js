// Realistic action mix, ramp to 500 VUs, sustain, spike to 1000. Each VU = one random seeded user per iteration.
// Env: EXCLUDE=search,quad drops those actions (to find the next bottleneck).
// Env: THINK_MIN/THINK_MAX seconds (default 1-3 = accelerated; use 8-15 for "real human" pacing), SCALE (stage length multiplier).
import { sleep } from 'k6';
import { rpc, listings, chats, quadPosts, NUSERS, rnd, pick, uuidv4, stages500to1000, thresholds, uid } from './lib.js';

const TMIN = Number(__ENV.THINK_MIN || 1), TMAX = Number(__ENV.THINK_MAX || 3);
export const options = {
  scenarios: { mixed: { executor: 'ramping-vus', startVUs: 0, stages: stages500to1000(Number(__ENV.SCALE || 1)), gracefulRampDown: '10s' } },
  thresholds: Object.assign({}, thresholds, ...['get_feed','record_swipes','get_campus_feed','search_listings','search_suggest','get_listing','get_inbox','get_notifications','get_chat','get_messages','send_message','make_offer','get_quad_feed','get_quad_thread','vote_quad'].map((r) => ({ [`rpc_duration{rpc:${r}}`]: ['max>=0'] }))),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function browse(u) {
  rpc(u, 'get_feed', { cursor: null, limit: 20 });
  sleep(rnd(1, 2));
  const batch = [];
  for (let i = 0; i < 10; i++) batch.push({ listing_id: pick(listings)[0], dir: Math.random() < 0.8 ? 'left' : 'save', at: new Date().toISOString() });
  rpc(u, 'record_swipes', { items: batch });
}
const ACTIONS = [
  [35, (u) => browse(u)],
  [10, (u) => rpc(u, 'get_campus_feed', { kind: pick(['all', 'free', 'wanted', 'food']), cursor: null })],
  [8, (u) => { rpc(u, 'search_suggest', { q: 'fri' }); rpc(u, 'search_listings', { q: pick(['fridge', 'lamp', 'bike', 'jacket']), filters: {}, cursor: null }); }],
  [10, (u) => rpc(u, 'get_listing', { id: pick(listings)[0] })],
  [8, (u) => { rpc(u, 'get_inbox', {}); rpc(u, 'get_notifications', { cursor: null, limit: 30 }); }],
  [8, (u) => { const c = pick(chats); rpc(c[1], 'get_chat', { chat_id: c[0] }); rpc(c[1], 'get_messages', { chat_id: c[0], before: null, limit: 30, after: null }); }],
  [8, (u) => { const c = pick(chats); const s = Math.random() < 0.5 ? c[1] : c[2]; rpc(s, 'send_message', { chat_id: c[0], body: 'k6 hello ' + Date.now(), client_id: uuidv4(), kind: 'text', photo_path: null }); }],
  [4, (u) => { const l = pick(listings); let b = rnd(1, NUSERS); if (b === l[1]) b = (b % NUSERS) + 1; rpc(b, 'make_offer', { listing_id: l[0], amount_cents: rnd(5, 40) * 100, note: null, quick_notes: [] }); }],
  [4, (u) => { rpc(u, 'get_quad_feed', { sort: pick(['hot', 'new']), cursor: null }); rpc(u, 'get_quad_thread', { post_id: pick(quadPosts) }); }],
  [3, (u) => rpc(u, 'vote_quad', { target_type: 'post', target_id: pick(quadPosts), value: pick([1, 1, -1, 0]) })],
];
const EXC = (__ENV.EXCLUDE || '').split(',');
const SKIP = { 2: 'search', 8: 'quad', 9: 'quad' };
for (const i of Object.keys(SKIP)) if (EXC.indexOf(SKIP[i]) >= 0) ACTIONS[i][0] = 0;
const TOTAL = ACTIONS.reduce((a, x) => a + x[0], 0);
export default function () {
  const u = rnd(1, NUSERS);
  let r = Math.random() * TOTAL;
  for (const [w, fn] of ACTIONS) { if ((r -= w) <= 0) { fn(u); break; } }
  sleep(TMIN + Math.random() * (TMAX - TMIN));
}
