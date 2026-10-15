// Quad: read feed/thread, vote, and post (server limit: 10 posts/hour/user).
import { sleep } from 'k6';
import { rpc, quadPosts, NUSERS, rnd, pick, uuidv4, stages500to1000, thresholds } from './lib.js';
export const options = { scenarios: { quad: { executor: 'ramping-vus', stages: stages500to1000(Number(__ENV.SCALE || 0.5)), gracefulRampDown: '10s' } }, thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };
export default function () {
  const u = rnd(1, NUSERS);
  rpc(u, 'get_quad_feed', { sort: pick(['hot', 'new']), cursor: null });
  const p = pick(quadPosts);
  rpc(u, 'get_quad_thread', { post_id: p });
  if (Math.random() < 0.5) rpc(u, 'vote_quad', { target_type: 'post', target_id: p, value: 1 });
  if (Math.random() < 0.15) rpc(u, 'create_quad_post', { kind: 'text', body: 'k6 post ' + Date.now(), photo_path: null, poll: null, place: 'Library', post_id: uuidv4() });
  sleep(rnd(1, 3));
}
