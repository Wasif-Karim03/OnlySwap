// P14-OPS-03 usage report.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fmt, report } from './usage-report.ts';

const MB = 1024 * 1024;

test('under the lines: no alerts, every figure listed', () => {
  const { markdown, alerts } = report(
    {
      db_bytes: 120 * MB,
      mau: 800,
      emails_24h: 40,
      r2_media_bytes: 900 * MB,
      r2_private_bytes: 10 * MB,
    },
    new Date('2027-03-01T00:00:00Z'),
  );
  assert.deepEqual(alerts, []);
  assert.match(markdown, /usage, 2027-03-01/);
  assert.match(markdown, /Supabase database \| 120.0 MB \(24%\)/);
  assert.match(markdown, /R2 storage \(all buckets\) \| 910.0 MB/);
  assert.match(markdown, /Check by hand/);
});

test('at the alert line: named and non-zero exit material', () => {
  const { markdown, alerts } = report({ db_bytes: 360 * MB, emails_24h: 400 });
  assert.deepEqual(alerts, ['Supabase database', 'Emails in the last 24 h (Gmail ~500/day)']);
  assert.match(markdown, /\*\*Over the alert line:\*\*/);
  assert.match(
    markdown,
    /R2 storage \(all buckets\) \| not measured \| 10.00 GB \| 7.00 GB \| check/,
  );
});

test('formatting', () => {
  assert.equal(fmt(undefined, 'count'), 'not measured');
  assert.equal(fmt(1234, 'count'), '1,234');
  assert.equal(fmt(2 * 1024 * MB, 'bytes'), '2.00 GB');
});
