// P14-MON-01 Edge Function error reporting.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildEnvelope, envelopeUrl, parseDsn, report, withMonitoring } from './monitor.ts';

const DSN = 'https://abc123@o42.ingest.us.sentry.io/4507';

test('parses a DSN', () => {
  const d = parseDsn(DSN)!;
  assert.deepEqual(d, {
    host: 'o42.ingest.us.sentry.io',
    projectId: '4507',
    publicKey: 'abc123',
    protocol: 'https',
  });
  assert.equal(
    envelopeUrl(d),
    'https://o42.ingest.us.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7',
  );
  assert.equal(parseDsn(''), null);
  assert.equal(parseDsn('not a url'), null);
  assert.equal(parseDsn('https://o.ingest.sentry.io/1'), null);
});

test('the envelope scrubs emails and carries only the error', () => {
  const env = buildEnvelope(new Error('no user kim@osu.edu'), {
    fn: 'send-push',
    environment: 'staging',
    eventId: 'e1',
    now: new Date('2027-01-01T00:00:00Z'),
  });
  const [header, item, event] = env
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(header.event_id, 'e1');
  assert.equal(item.type, 'event');
  assert.equal(event.exception.values[0].value, 'no user [email]');
  assert.equal(event.tags.function, 'send-push');
  assert.equal(event.request, undefined);
  assert.equal(event.user, undefined);
});

test('report is off without a DSN and sends one envelope with one', async () => {
  assert.equal(await report(new Error('x'), { dsn: undefined, fn: 'f', environment: 'e' }), false);
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(
    await report(new Error('x'), { dsn: DSN, fn: 'f', environment: 'e', fetch: f }),
    true,
  );
  assert.equal(calls.length, 1);
});

test('withMonitoring turns a crash into a plain 500', async () => {
  const handler = withMonitoring(
    'health',
    () => {
      throw new Error('boom');
    },
    { get: () => undefined },
  );
  const res = await handler(new Request('https://x/'));
  assert.equal(res.status, 500);
  assert.equal(await res.text(), '{"error":"UNKNOWN"}');
  const ok = withMonitoring('health', () => new Response('ok'), { get: () => undefined });
  assert.equal(await (await ok(new Request('https://x/'))).text(), 'ok');
});
