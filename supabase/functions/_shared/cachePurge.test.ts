// LR-02 cache purge for deleted media (node --experimental-strip-types --test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalMediaUrl,
  purgeConfigFromEnv,
  purgeKeys,
  type PurgeConfig,
} from './cachePurge.ts';

const env = (vars: Record<string, string>) => ({ get: (name: string) => vars[name] });
const cfg: PurgeConfig = { zoneId: 'Z1', token: 'tok', mediaUrl: 'https://media.test/' };

function fakeFetch(respond: () => Response = () => Response.json({ success: true })) {
  const calls: { url: string; init?: RequestInit; files: string[] }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init, files: (JSON.parse(String(init?.body)) as { files: string[] }).files });
    return respond();
  };
  return { f, calls };
}

test('purge config needs the zone, the token and the media URL', () => {
  const all = { CF_ZONE_ID: 'Z1', CF_CACHE_PURGE_TOKEN: 'tok', MEDIA_URL: 'https://media.test' };
  assert.deepEqual(purgeConfigFromEnv(env(all)), {
    zoneId: 'Z1',
    token: 'tok',
    mediaUrl: 'https://media.test',
  });
  assert.equal(purgeConfigFromEnv(env({ ...all, CF_ZONE_ID: '' })), null);
  assert.equal(
    purgeConfigFromEnv(env({ MEDIA_URL: 'https://media.test', CF_ZONE_ID: 'Z1' })),
    null,
  );
  assert.equal(purgeConfigFromEnv(env({ CF_ZONE_ID: 'Z1', CF_CACHE_PURGE_TOKEN: 'tok' })), null);
});

test('the canonical URL is the media URL plus the key (the Worker cache key)', () => {
  assert.equal(
    canonicalMediaUrl('https://media.test/', 'c/1/l/L/a_full.webp'),
    'https://media.test/c/1/l/L/a_full.webp',
  );
  assert.equal(
    canonicalMediaUrl('https://media.test', 'share/L.jpg'),
    'https://media.test/share/L.jpg',
  );
});

test('65 keys go out as 30, 30 and 5 with the bearer token', async () => {
  const { f, calls } = fakeFetch();
  const keys = Array.from({ length: 65 }, (_, i) => `c/1/l/L/${i}_full.webp`);
  assert.equal(await purgeKeys(cfg, keys, f), 65);
  assert.deepEqual(
    calls.map((c) => c.files.length),
    [30, 30, 5],
  );
  assert.equal(calls[0]?.url, 'https://api.cloudflare.com/client/v4/zones/Z1/purge_cache');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, 'Bearer tok');
  assert.equal(calls[0]?.files[0], 'https://media.test/c/1/l/L/0_full.webp');
});

test('chat keys are never sent (they are never cached)', async () => {
  const { f, calls } = fakeFetch();
  assert.equal(await purgeKeys(cfg, ['c/1/chat/C/a_full.webp', 'c/1/quad/Q/a_full.webp'], f), 1);
  assert.deepEqual(calls[0]?.files, ['https://media.test/c/1/quad/Q/a_full.webp']);
  const none = fakeFetch();
  assert.equal(await purgeKeys(cfg, ['c/1/chat/C/a_full.webp'], none.f), 0);
  assert.equal(none.calls.length, 0);
});

test('a non-2xx answer or success false throws', async () => {
  const bad = fakeFetch(() => new Response('no', { status: 403 }));
  await assert.rejects(purgeKeys(cfg, ['c/1/l/L/a.webp'], bad.f), /purge 403/);
  const unsure = fakeFetch(() => Response.json({ success: false }));
  await assert.rejects(purgeKeys(cfg, ['c/1/l/L/a.webp'], unsure.f), /not successful/);
});

test('RV-02 the signal goes to every request and no batch starts after it fired', async () => {
  const { f, calls } = fakeFetch();
  const ac = new AbortController();
  const keys = Array.from({ length: 35 }, (_, i) => `c/1/l/L/${i}_full.webp`);
  assert.equal(await purgeKeys(cfg, keys, f, ac.signal), 35);
  assert.ok(calls.every((c) => c.init?.signal === ac.signal));
  ac.abort();
  const after = fakeFetch();
  await assert.rejects(purgeKeys(cfg, keys, after.f, ac.signal), /purge stopped/);
  assert.equal(after.calls.length, 0);
});
