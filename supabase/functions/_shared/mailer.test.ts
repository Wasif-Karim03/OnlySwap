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
  'support_reply',
  'report_queue',
  'photo_flag',
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
  const r = render('support_reply', { body: 'Try again <now>\nThanks', ref: 'abcd1234' }, SITE);
  assert.ok(r.text.includes('Try again <now>\nThanks'));
  assert.ok(r.text.includes('(ref abcd1234)'));
  assert.ok(r.html.includes('Try again &lt;now&gt;<br>Thanks'));
  assert.equal(
    render('report_queue', { open: 3, oldest_hours: 5 }, SITE).text.split('\n')[0],
    '3 open reports; the oldest has waited 5 hours.',
  );
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

test('photo_flag: red alert with who, what, when and the photo, never a sexual or minor photo', () => {
  const vars = {
    report_id: 'r1',
    reason: 'weapon',
    kind: 'listing',
    poster: 'Maya R.',
    what: 'Kitchen knife set',
    campus: 'Ohio Wesleyan',
    posted_at: 'Oct 27, 9:41 AM',
    flagged_at: 'Oct 27, 9:42 AM',
    photo_key: 'c/x/l/knife_full.webp',
  };
  const urls = { admin: 'https://admin.test', media: 'https://media.test' };
  const m = render('photo_flag', vars, SITE, urls);
  assert.match(m.subject, /^Red alert: listing flagged for a weapon$/);
  for (const s of [
    'Maya R.',
    'Kitchen knife set',
    'Oct 27, 9:41 AM',
    'https://admin.test/reports/r1',
  ])
    assert.ok(m.text.includes(s) && m.html.includes(s), s);
  assert.ok(m.html.includes('src="https://media.test/c/x/l/knife_full.webp"'));
  assert.ok(m.html.includes('#C8321C'), 'red hero');
  for (const reason of ['sexual', 'minor']) {
    const x = render('photo_flag', { ...vars, reason }, SITE, urls);
    assert.ok(!x.html.includes('knife_full.webp'), `${reason}: no photo in email`);
  }
  const quad = render('photo_flag', { ...vars, kind: 'quad', poster: null }, SITE, urls);
  assert.ok(quad.text.includes('Anonymous'), 'quad authors stay anonymous');
  assert.ok(
    render('photo_flag', vars, SITE).html.includes('https://onlyswap-admin.pages.dev/reports/r1'),
  );
});
