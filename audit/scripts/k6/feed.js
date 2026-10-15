// Feed browse + swipe only: get_feed (keyset pages) then record_swipes batches of 10, plus get_listing.
import { sleep } from 'k6';
import { rpc, listings, NUSERS, rnd, pick, stages500to1000, thresholds } from './lib.js';
export const options = { scenarios: { feed: { executor: 'ramping-vus', stages: stages500to1000(Number(__ENV.SCALE || 0.5)), gracefulRampDown: '10s' } }, thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };
export default function () {
  const u = rnd(1, NUSERS);
  const r = rpc(u, 'get_feed', { cursor: null, limit: 20 });
  sleep(rnd(1, 3));
  const batch = [];
  for (let i = 0; i < 10; i++) batch.push({ listing_id: pick(listings)[0], dir: Math.random() < 0.8 ? 'left' : 'save', at: new Date().toISOString() });
  rpc(u, 'record_swipes', { items: batch });
  rpc(u, 'get_listing', { id: pick(listings)[0] });
  sleep(rnd(1, 3));
}
