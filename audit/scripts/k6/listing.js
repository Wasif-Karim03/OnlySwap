// Listing creation: reserve_listing_id then create_listing (photos are R2 paths; the R2 upload itself is NOT exercised:
// upload-url Edge Function is not served by the local stack, see README).
import { sleep } from 'k6';
import { rpc, API, headers, NUSERS, rnd, stages500to1000, thresholds } from './lib.js';
import http from 'k6/http';
const CAMPUS = '90000000-0000-4000-8000-000000000001';
export const options = { scenarios: { listing: { executor: 'ramping-vus', stages: stages500to1000(Number(__ENV.SCALE || 0.5)), gracefulRampDown: '10s' } }, thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };
export default function () {
  const u = rnd(1, NUSERS);
  const r = rpc(u, 'reserve_listing_id', {});
  if (r.ok) {
    const id = JSON.parse(r.res.body);
    const photos = [0, 1].map((i) => ({ path: `c/${CAMPUS}/l/${id}/p${i}_full.webp`, thumb_path: `c/${CAMPUS}/l/${id}/p${i}_thumb.webp`, width: 1080, height: 1080, blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }));
    rpc(u, 'create_listing', { id, kind: 'sale', title: 'k6 listing ' + id.slice(0, 6), description: 'load test', category_id: 1, condition: 'good', price_cents: 1500, open_to_offers: true, photos, meet_spot_ids: [], meet_note: null, availability: [] });
  }
  sleep(rnd(2, 4));
}
