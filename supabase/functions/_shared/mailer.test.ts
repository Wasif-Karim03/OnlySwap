// P9-MAIL-01 templates (snapshot-style) and P9-MAIL-02 drain.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleSendEmail, render, resendSender, type Template } from './mailer.ts';

const SITE = 'https://onlyswap.pages.dev';
const ALL: Template[] = [
  'campus_open',
  'account_paused',
  'reverify_due',
  'account_deleted',
  'data_export',
  'admin_reveal_receipt',
  'support_request',
  'priority_report',
];

test('every template renders a subject, text and html with the site footer', () => {
  for (const t of ALL) {
    const m = render(t, {}, SITE);
    assert.ok(m.subject.length > 5, t);
    assert.ok(m.text.endsWith(`OnlySwap · ${SITE}`), t);
    assert.ok(m.html.startsWith('<!doctype html>'), t);
    // House style: no em dashes, no exclamation marks, no emoji.
    assert.ok(!/[—!]/.test(m.subject + m.text), t);
  }
});

test('templates fill their values and escape html', () => {
  assert.equal(
    render('campus_open', { campus: 'Ohio State' }, SITE).subject,
    'OnlySwap is open at Ohio State',
  );
  const s = render(
    'support_request',
    { topic: 'bug', body: '<b>hi</b>\nthere', reply_to: 'a@osu.edu' },
    SITE,
  );
  assert.equal(s.replyTo, 'a@osu.edu');
  assert.ok(s.html.includes('&lt;b&gt;hi&lt;/b&gt;<br>there'));
  assert.ok(render('data_export', { url: 'https://x/y' }, SITE).text.includes('https://x/y'));
  assert.throws(() => render('nope' as Template, {}, SITE));
});

test('drain: sends, reports failures for retry, service key only', async () => {
  const sent: string[] = [];
  let finished: { id: number; ok: boolean }[] = [];
  const deps = {
    keys: ['k'],
    site: SITE,
    claim: async () => [
      { id: 1, to: 'a@osu.edu', template: 'account_deleted' as const, vars: {} },
      { id: 2, to: 'b@osu.edu', template: 'reverify_due' as const, vars: { due: '2027-04-01' } },
    ],
    send: async (to: string) => {
      if (to.startsWith('b')) throw new Error('smtp 421');
      sent.push(to);
    },
    finish: async (r: { id: number; ok: boolean }[]) => {
      finished = r;
    },
  };
  assert.equal(
    (await handleSendEmail({ method: 'POST', authorization: 'Bearer nope' }, deps)).status,
    401,
  );
  const res = await handleSendEmail({ method: 'POST', authorization: 'Bearer k' }, deps);
  assert.equal(res.body.sent, 1);
  assert.deepEqual(sent, ['a@osu.edu']);
  assert.deepEqual(
    finished.map((f) => [f.id, f.ok]),
    [
      [1, true],
      [2, false],
    ],
  );
});

test('Resend transport posts the mail', async () => {
  let body: Record<string, unknown> = {};
  const send = resendSender('re_test', 'OnlySwap <hi@x.dev>', (async (
    _u: string,
    init?: RequestInit,
  ) => {
    body = JSON.parse(String(init?.body));
    return new Response('{}', { status: 200 });
  }) as typeof fetch);
  await send('a@osu.edu', render('account_deleted', {}, SITE));
  assert.deepEqual(body.to, ['a@osu.edu']);
  assert.equal(body.from, 'OnlySwap <hi@x.dev>');
});
