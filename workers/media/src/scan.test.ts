// DEC 152: the media Worker's photo screening route.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { handle, resetRateLimit, type Env } from './handler.ts';
import {
  parseVerdict,
  scanKey,
  SCAN_MODEL,
  type Ai,
  toScanJpeg,
  SCAN_WIDTH,
  type Images,
} from './scan.ts';

const PHOTO = 'c/osu/l/L1/abc_full.webp';
const calls: { model: string; input: Record<string, unknown> }[] = [];
let reply: (input: Record<string, unknown>) => unknown = () => ({ response: '{"verdict":"ok"}' });
const ai: Ai = {
  run: async (model, input) => {
    calls.push({ model, input });
    return reply(input);
  },
};
const env = (over: Partial<Env> = {}): Env => ({
  MEDIA: {
    get: async (key) => (key === PHOTO ? { body: 'IMG', size: 3, httpEtag: '"1"' } : null),
  },
  AI: ai,
  SCAN_KEY: 'scan-secret',
  ...over,
});
const scan = (body: unknown, e: Env = env(), auth = 'Bearer scan-secret') =>
  handle(
    new Request('https://media.onlyswap.test/internal/scan', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    e,
  );

beforeEach(() => {
  resetRateLimit();
  calls.length = 0;
  reply = () => ({ response: '{"verdict":"ok"}' });
});

test('parseVerdict reads ok, flag and anything else as retry', () => {
  assert.deepEqual(parseVerdict('{"verdict":"ok"}'), { verdict: 'ok' });
  assert.deepEqual(parseVerdict('Sure. {"verdict":"flag","reason":"Weapon"}'), {
    verdict: 'flag',
    reason: 'weapon',
  });
  assert.deepEqual(parseVerdict('{"verdict":"flag","reason":"weird"}'), {
    verdict: 'flag',
    reason: 'other',
  });
  assert.deepEqual(parseVerdict('I cannot tell'), { verdict: 'retry' });
});

test('scanKey takes public photo keys only, never chat photos', () => {
  assert.equal(scanKey(PHOTO), PHOTO);
  assert.equal(scanKey('c/osu/q/Q1/x_full.jpg'), 'c/osu/q/Q1/x_full.jpg');
  assert.equal(scanKey('c/osu/chat/C1/x.webp'), null);
  assert.equal(scanKey('c/osu/../secret.webp'), null);
  assert.equal(scanKey('exports/u1.zip'), null);
  assert.equal(scanKey(42), null);
});

test('only the scan key may call it, and it is off until configured', async () => {
  assert.equal((await scan({ path: PHOTO }, env(), 'Bearer nope')).status, 401);
  assert.equal((await scan({ path: PHOTO }, env({ SCAN_KEY: undefined }))).status, 503);
  assert.equal((await scan({ path: PHOTO }, env({ AI: undefined }))).status, 503);
  assert.equal((await scan({ path: 'c/osu/chat/C1/x.webp' })).status, 400);
});

test('reads the photo from R2 and asks the vision model', async () => {
  reply = () => ({ response: '{"verdict":"flag","reason":"drugs"}' });
  const res = await scan({ path: PHOTO });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { verdict: 'flag', reason: 'drugs' });
  assert.equal(calls[0]?.model, SCAN_MODEL);
  assert.deepEqual(calls[0]?.input.image, [...new TextEncoder().encode('IMG')]);
});

test('a deleted photo passes without a model call', async () => {
  const res = await scan({ path: 'c/osu/l/L1/gone_full.webp' });
  assert.equal((await res.json()).verdict, 'ok');
  assert.equal(calls.length, 0);
});

test('accepts the model license once, then retries', async () => {
  let agreed = false;
  reply = (input) => {
    if (input.prompt === 'agree') {
      agreed = true;
      return { response: 'ok' };
    }
    if (!agreed)
      throw new Error('5016: Prior to using this model, you must submit the prompt agree');
    return { response: '{"verdict":"ok"}' };
  };
  const res = await scan({ path: PHOTO });
  assert.deepEqual(await res.json(), { verdict: 'ok' });
  assert.equal(agreed, true);
});

test('the daily allowance running out is a 429, other errors a retry', async () => {
  reply = () => {
    throw new Error('3036: You have used up your daily free allocation of 10,000 neurons');
  };
  assert.equal((await scan({ path: PHOTO })).status, 429);
  reply = () => {
    throw new Error('model crashed');
  };
  assert.deepEqual(await (await scan({ path: PHOTO })).json(), {
    verdict: 'retry',
    error: 'model crashed',
  });
});

test('photos are still served with GET', async () => {
  const res = await handle(new Request(`https://media.onlyswap.test/${PHOTO}`), env());
  assert.equal(res.status, 200);
});

// DEC 152 follow-up (2026-10-25): WebP photos reach the model as a JPEG.
test('toScanJpeg converts through the Images binding and falls back to the original', async () => {
  const seen: { t?: Record<string, unknown>; o?: { format: string } } = {};
  const images: Images = {
    input: () => ({
      transform: (t) => {
        seen.t = t;
        return {
          output: async (o) => {
            seen.o = o;
            return { response: () => new Response(new Uint8Array([9, 9])) };
          },
        };
      },
    }),
  };
  const original = new Uint8Array([1, 2, 3]);
  assert.deepEqual(
    [...(await toScanJpeg({ MEDIA: { get: async () => null }, IMAGES: images }, original))],
    [9, 9],
  );
  assert.equal(seen.o?.format, 'image/jpeg');
  assert.equal(seen.t?.width, SCAN_WIDTH);
  // No binding, or the binding failing (e.g. over the free allowance): the original.
  assert.equal(await toScanJpeg({ MEDIA: { get: async () => null } }, original), original);
  const broken: Images = {
    input: () => ({
      transform: () => ({
        output: async () => {
          throw new Error('9422');
        },
      }),
    }),
  };
  assert.equal(
    await toScanJpeg({ MEDIA: { get: async () => null }, IMAGES: broken }, original),
    original,
  );
});

test('an answer in words gets one follow-up asking for the JSON alone', async () => {
  calls.length = 0;
  let n = 0;
  reply = () => {
    n += 1;
    return n === 1
      ? { response: 'The photo shows a knife on a table.' }
      : { response: '{"verdict":"flag","reason":"weapon"}' };
  };
  assert.deepEqual(await (await scan({ path: PHOTO })).json(), {
    verdict: 'flag',
    reason: 'weapon',
  });
  assert.equal(calls.length, 2);
  const second = calls[1]!.input.messages as { role: string }[];
  assert.deepEqual(
    second.map((m) => m.role),
    ['system', 'user', 'assistant', 'user'],
  );
});

test('still no JSON after the follow-up: retry, with the words for the test script', async () => {
  reply = () => ({ response: 'A knife.' });
  const body = (await (await scan({ path: PHOTO })).json()) as { verdict: string; raw?: string };
  assert.equal(body.verdict, 'retry');
  assert.equal(body.raw, 'A knife.');
});

test('an answer Workers AI already parsed into an object is read as the verdict', async () => {
  reply = () => ({ response: { verdict: 'flag', reason: 'weapon' } });
  assert.deepEqual(await (await scan({ path: PHOTO })).json(), {
    verdict: 'flag',
    reason: 'weapon',
  });
  reply = () => ({ response: { verdict: 'ok' } });
  assert.deepEqual(await (await scan({ path: PHOTO })).json(), { verdict: 'ok' });
});
