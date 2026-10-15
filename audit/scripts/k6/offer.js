// make_offer on random active listings (and the accept/decline path is covered by audit/scripts/seed/races.sh).
// Many buyers hit the same listings: exercises the FOR SHARE -> UPDATE offer_count path (deadlock risk, see F-02).
// Env HOT=1 concentrates 80% of offers on 20 listings (a viral item).
import { sleep } from 'k6';
import { rpc, listings, NUSERS, rnd, pick, stages500to1000, thresholds } from './lib.js';
export const options = { scenarios: { offer: { executor: 'ramping-vus', stages: stages500to1000(Number(__ENV.SCALE || 0.5)), gracefulRampDown: '10s' } }, thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };
export default function () {
  const hot = __ENV.HOT === '1' && Math.random() < 0.8;
  const l = hot ? listings[rnd(0, 19)] : pick(listings);
  let b = rnd(1, NUSERS); if (b === l[1]) b = (b % NUSERS) + 1;
  rpc(b, 'make_offer', { listing_id: l[0], amount_cents: rnd(5, 40) * 100, note: 'k6 offer', quick_notes: [] });
  sleep(rnd(1, 3));
}
