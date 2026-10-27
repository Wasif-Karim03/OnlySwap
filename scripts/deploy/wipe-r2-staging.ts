// Counts or deletes every object in the two STAGING R2 buckets (used by
// wipe-staging.command). Refuses any bucket whose name doesn't end in -staging.
//   node --experimental-strip-types scripts/deploy/wipe-r2-staging.ts count|delete
// Reads R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY from the environment.
import { createR2 } from '../../supabase/functions/_shared/r2.ts';

const BUCKETS = ['onlyswap-media-staging', 'onlyswap-private-staging'];
const mode = process.argv[2];
if (mode !== 'count' && mode !== 'delete') throw new Error('usage: count|delete');
for (const b of BUCKETS) if (!b.endsWith('-staging')) throw new Error(`refusing ${b}`);

const r2 = createR2({
  endpoint: process.env.R2_ENDPOINT!,
  region: 'auto',
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  mediaBucket: BUCKETS[0]!,
  privateBucket: BUCKETS[1]!,
});

for (const bucket of BUCKETS) {
  if (mode === 'count') {
    const keys = await r2.list(bucket, '');
    const by = new Map<string, number>();
    for (const k of keys) {
      const top = k.split('/').slice(0, 3).join('/');
      by.set(top, (by.get(top) ?? 0) + 1);
    }
    console.log(`${bucket}: ${keys.length} files`);
    for (const [p, n] of [...by].sort()) console.log(`  ${p}/  ${n}`);
  } else {
    const n = await r2.deletePrefix(bucket, '');
    console.log(`${bucket}: deleted ${n} files`);
  }
}
