// P12-ADM-02 guard and helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ageLabel,
  announceableCampuses,
  auditWindow,
  changeEmailError,
  dateLabel,
  deltaLabel,
  mediaUrl,
  moneyLabel,
  needsSuspendDays,
  needsUntil,
  pageStack,
  reasonError,
  sparkPath,
  timeAgo,
  whenLabel,
  allowedActions,
  announcementFormError,
  bannedWordFormError,
  barPct,
  canReveal,
  charCounter,
  dayLabel,
  defaultRange,
  errorMessage,
  formatHours,
  formatPct,
  gate,
  holdReasonLabel,
  inviteFormError,
  knownError,
  latestWith,
  maxUntil,
  nextAnnouncementAt,
  pooledRate,
  previousWeekStart,
  rangeError,
  rateLimitRetryAt,
  regexError,
  retryIn,
  revealFormError,
  sessionExpired,
  SESSION_MS,
  targetLabel,
  targetStatus,
  TARGETS,
  toCsv,
} from '../src/logic.ts';

test('the guard: sign in, then admin, then MFA', () => {
  assert.equal(gate(false, null), 'login');
  assert.equal(gate(true, { admin: false }), 'denied');
  assert.equal(gate(true, { admin: true, role: 'owner', aal: 'aal1' }), 'mfa');
  assert.equal(gate(true, { admin: true, role: 'moderator', aal: 'aal2' }), 'ok');
});

test('sessions last 8 hours', () => {
  assert.equal(sessionExpired(0, SESSION_MS), false);
  assert.equal(sessionExpired(0, SESSION_MS + 1), true);
  assert.equal(sessionExpired(null, 0), true);
});

test('moderators cannot ban and remove only content', () => {
  assert.ok(!allowedActions('moderator', 'user').includes('ban'));
  assert.ok(allowedActions('owner', 'user').includes('ban'));
  assert.ok(!allowedActions('owner', 'user').includes('remove_content'));
  assert.ok(allowedActions('moderator', 'listing').includes('remove_content'));
  assert.equal(maxUntil('owner', new Date(0)), null);
  assert.equal(maxUntil('moderator', new Date(0))!.getTime(), 7 * 86_400_000);
});

test('CSV quoting', () => {
  assert.equal(
    toCsv([{ a: 'x,y', b: 'say "hi"', c: { k: 1 } }], ['a', 'b', 'c']),
    'a,b,c\n"x,y","say ""hi""","{""k"":1}"',
  );
});

test('error text', () => {
  assert.match(errorMessage({ message: 'NOT_ADMIN' }), /admin account/);
  assert.equal(errorMessage({ message: 'weird' }), 'weird');
});

test('T-UNIT-ADMIN-QUAD hold reasons in plain words', () => {
  assert.equal(holdReasonLabel('names_student'), 'Names a student');
  assert.equal(holdReasonLabel('new_account_photo'), 'New account photo');
  assert.equal(holdReasonLabel('downvoted'), 'Hidden by votes');
  assert.equal(holdReasonLabel('reports'), '3+ reports');
  assert.equal(holdReasonLabel('term:sketchy'), 'Review word: sketchy');
  assert.equal(holdReasonLabel(null), '');
  assert.equal(holdReasonLabel('other'), 'other');
});

test('T-UNIT-ADMIN-QUAD only the owner with MFA can reveal', () => {
  assert.equal(canReveal({ admin: true, role: 'owner', aal: 'aal2' }), true);
  assert.equal(canReveal({ admin: true, role: 'moderator', aal: 'aal2' }), false);
  assert.equal(canReveal({ admin: true, role: 'owner', aal: 'aal1' }), false);
  assert.equal(canReveal({ admin: false, role: 'owner', aal: 'aal2' }), false);
});

test('T-UNIT-ADMIN-QUAD reveal form needs case ref, reason and code', () => {
  assert.match(revealFormError('ab', 'safety', '123456')!, /case reference/);
  assert.match(revealFormError('CASE-1', '  x ', '123456')!, /reason/);
  assert.match(revealFormError('CASE-1', 'threat', '12345')!, /6-digit/);
  assert.equal(revealFormError('CASE-1', 'threat', ' 123456 '), null);
});

test('T-UNIT-ADMIN-QUAD rate limit and MFA errors', () => {
  const m = 'RATE_LIMITED:quad_reveal:2026-10-05T00:00:00Z';
  assert.equal(rateLimitRetryAt(m), '2026-10-05T00:00:00Z');
  assert.equal(rateLimitRetryAt('RATE_LIMITED'), null);
  assert.equal(rateLimitRetryAt('NOT_ADMIN'), null);
  assert.match(errorMessage({ message: m }), /^Limit reached\. Try again after /);
  assert.match(errorMessage({ message: 'FORBIDDEN:mfa_required' }), /authenticator/);
  assert.equal(errorMessage({ message: 'FORBIDDEN' }), "That isn't allowed.");
});

test('T-UNIT-ADMIN-QUAD age labels', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  assert.equal(ageLabel('2026-10-04T11:59:30Z', now), 'now');
  assert.equal(ageLabel('2026-10-04T11:48:00Z', now), '12m');
  assert.equal(ageLabel('2026-10-04T07:00:00Z', now), '5h');
  assert.equal(ageLabel('2026-10-01T12:00:00Z', now), '3d');
});

test('T-UNIT-ADMIN-METRICS percent and hours formatting', () => {
  assert.equal(formatPct(42.5), '42.5%');
  assert.equal(formatPct(40), '40%');
  assert.equal(formatPct('33.3'), '33.3%');
  assert.equal(formatPct(0), '0%');
  assert.equal(formatPct(null), 'n/a');
  assert.equal(formatPct(undefined), 'n/a');
  assert.equal(formatHours(5.5), '5.5 h');
  assert.equal(formatHours(24), '24 h');
  assert.equal(formatHours(null), 'n/a');
  assert.equal(pooledRate(1, 3), 33.3);
  assert.equal(pooledRate(0, 0), null);
  assert.equal(pooledRate(5, 10), 50);
});

test('T-UNIT-ADMIN-METRICS target comparison (PRD 5.2)', () => {
  assert.equal(targetStatus(40, TARGETS.activation), 'met');
  assert.equal(targetStatus(39.9, TARGETS.activation), 'missed');
  assert.equal(targetStatus('25', TARGETS.d7_retention), 'met');
  assert.equal(targetStatus(5.9, TARGETS.hours_to_first_offer), 'met');
  assert.equal(targetStatus(6, TARGETS.hours_to_first_offer), 'missed');
  assert.equal(targetStatus(10, TARGETS.no_show_rate), 'missed');
  assert.equal(targetStatus(0, TARGETS.reports_per_100_swaps), 'met');
  assert.equal(targetStatus(50, TARGETS.swaps_per_week), 'met');
  assert.equal(targetStatus(null, TARGETS.activation), 'none');
  assert.equal(targetStatus('', TARGETS.activation), 'none');
  assert.equal(targetLabel(TARGETS.activation, '%'), 'Target ≥ 40%');
  assert.equal(targetLabel(TARGETS.p90_hours_to_resolve, ' h'), 'Target < 24 h');
});

test('T-UNIT-ADMIN-METRICS bars, days, weeks and ranges', () => {
  assert.equal(barPct(5, 10), 50);
  assert.equal(barPct(0, 10), 0);
  assert.equal(barPct(3, 0), 0);
  assert.equal(barPct(20, 10), 100);
  assert.equal(dayLabel('2026-09-28'), 'Sep 28');
  assert.deepEqual(defaultRange(new Date('2026-10-04T15:00:00Z')), {
    from: '2026-09-07',
    to: '2026-10-04',
  });
  assert.equal(rangeError('2026-09-07', '2026-10-04'), null);
  assert.match(rangeError('2026-10-05', '2026-10-04')!, /on or before/);
  assert.match(rangeError('2025-01-01', '2026-10-04')!, /a year/);
  assert.match(rangeError('', '2026-10-04')!, /Pick/);
  // 2026-10-04 is a Sunday; its week starts Mon 09-28, so last full week is 09-21.
  assert.equal(previousWeekStart('2026-10-04'), '2026-09-21');
  assert.equal(previousWeekStart('2026-09-28'), '2026-09-21');
  const rows = [
    { week: 'b', v: null },
    { week: 'a', v: 3 },
  ];
  assert.equal(latestWith(rows, 'v')?.week, 'a');
  assert.equal(latestWith([{ week: 'x', v: null }], 'v'), null);
});

test('T-UNIT-ADMIN-ANN character counters', () => {
  assert.deepEqual(charCounter('  Hello  ', 60), { count: 5, over: false, label: '5/60' });
  assert.equal(charCounter('x'.repeat(61), 60).over, true);
  assert.equal(charCounter('x'.repeat(60), 60).over, false);
  assert.equal(charCounter('é🙂', 60).count, 2);
});

test('T-UNIT-ADMIN-ANN form checks', () => {
  const ok = {
    campusId: 'c',
    title: 'Finals week',
    body: 'Library hours',
    pinnedHours: 24,
    reason: 'term news',
  };
  assert.equal(announcementFormError(ok), null);
  assert.match(announcementFormError({ ...ok, campusId: '' })!, /campus/);
  assert.match(announcementFormError({ ...ok, title: '  ' })!, /title/);
  assert.match(announcementFormError({ ...ok, title: 'x'.repeat(61) })!, /60/);
  assert.match(announcementFormError({ ...ok, body: 'x'.repeat(201) })!, /200/);
  assert.match(announcementFormError({ ...ok, pinnedHours: 169 })!, /0 to 168/);
  assert.match(announcementFormError({ ...ok, pinnedHours: -1 })!, /0 to 168/);
  assert.equal(announcementFormError({ ...ok, pinnedHours: 0 }), null);
  assert.match(announcementFormError({ ...ok, reason: 'ok' })!, /reason/);
});

test('T-UNIT-ADMIN-ANN next allowed time and retry formatting', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const rows = [
    { campus_id: 'a', created_at: '2026-10-01T12:00:00Z' },
    { campus_id: 'a', created_at: '2026-09-20T12:00:00Z' },
    { campus_id: 'b', created_at: '2026-09-20T12:00:00Z' },
  ];
  assert.equal(nextAnnouncementAt(rows, 'a', now), '2026-10-08T12:00:00.000Z');
  assert.equal(nextAnnouncementAt(rows, 'b', now), null);
  assert.equal(nextAnnouncementAt(rows, 'c', now), null);
  assert.equal(retryIn('2026-10-08T12:00:00Z', now), 'in 4 days');
  assert.equal(retryIn('2026-10-06T17:00:00Z', now), 'in 2 days 5 hours');
  assert.equal(retryIn('2026-10-04T15:10:00Z', now), 'in 3 hours 10 minutes');
  assert.equal(retryIn('2026-10-04T13:00:00Z', now), 'in 1 hour');
  assert.equal(retryIn('2026-10-04T12:00:30Z', now), 'in 1 minute');
  assert.equal(retryIn('2026-10-04T11:00:00Z', now), 'now');
  assert.equal(
    rateLimitRetryAt('RATE_LIMITED:announcement:2026-10-08T12:00:00Z'),
    '2026-10-08T12:00:00Z',
  );
});

test('T-UNIT-ADMIN-TEAM invite form and known errors', () => {
  const ok = {
    email: 'sam@school.edu',
    role: 'moderator' as const,
    campusId: 'c',
    reason: 'new mod',
  };
  assert.equal(inviteFormError(ok), null);
  assert.match(inviteFormError({ ...ok, email: 'sam' })!, /email/);
  assert.match(inviteFormError({ ...ok, campusId: '' })!, /campus/);
  assert.equal(inviteFormError({ ...ok, role: 'owner', campusId: '' }), null);
  assert.match(inviteFormError({ ...ok, reason: ' x ' })!, /reason/);
  const known = { 'INVALID:email': 'No account.' };
  assert.equal(knownError({ message: 'INVALID:email' }, known), 'No account.');
  assert.equal(
    knownError({ message: 'INVALID:self' }, known),
    'Something in the form needs a fix.',
  );
});

test('T-UNIT-ADMIN-WORDS regex and form validation', () => {
  assert.equal(regexError('fake ?ids?'), null);
  assert.equal(regexError('\\bvenmo\\b'), null);
  assert.match(regexError('(unclosed')!, /compile/);
  assert.match(regexError('[a-')!, /compile/);
  assert.match(regexError('(?<n>x)')!, /Named groups/);
  assert.match(regexError('/abc/i')!, /slashes/);
  const ok = { pattern: 'scam', match: 'word' as const, scopes: ['listing'], reason: 'spam wave' };
  assert.equal(bannedWordFormError(ok), null);
  assert.match(bannedWordFormError({ ...ok, pattern: 'a' })!, /2 to 100/);
  assert.match(bannedWordFormError({ ...ok, pattern: 'x'.repeat(101) })!, /2 to 100/);
  assert.match(bannedWordFormError({ ...ok, pattern: 'two words' })!, /phrase/);
  assert.equal(bannedWordFormError({ ...ok, pattern: 'two words', match: 'phrase' }), null);
  assert.match(bannedWordFormError({ ...ok, pattern: '(bad', match: 'regex' })!, /compile/);
  assert.match(bannedWordFormError({ ...ok, scopes: [] })!, /at least one/);
  assert.match(bannedWordFormError({ ...ok, reason: '' })!, /reason/);
});

test('T-UNIT-ADMIN-V2 bug fixes: days only for Suspend, Until only for Pause and Suspend', () => {
  assert.equal(needsSuspendDays('suspend'), true);
  for (const a of ['dismiss', 'remove_content', 'warn', 'strike', 'ban'])
    assert.equal(needsSuspendDays(a), false);
  assert.equal(needsUntil('paused'), true);
  assert.equal(needsUntil('suspended'), true);
  for (const s of ['active', 'banned', 'reverify']) assert.equal(needsUntil(s), false);
});

test('T-UNIT-ADMIN-V2 change email needs an address and a reason', () => {
  assert.equal(changeEmailError('nope', 'Lost inbox'), 'Enter the new school email.');
  assert.equal(changeEmailError('a@school.edu', ''), 'Add a reason of at least 3 characters.');
  assert.equal(changeEmailError('a@school.edu', 'Lost inbox'), null);
  assert.equal(reasonError('ok'), 'Add a reason of at least 3 characters.');
  assert.equal(reasonError(' fine '), null);
});

test('T-UNIT-ADMIN-V2 announcements never offer the demo campus', () => {
  const list = [
    { id: 'a', is_demo: false },
    { id: 'd', is_demo: true },
  ];
  assert.deepEqual(
    announceableCampuses(list).map((c) => c.id),
    ['a'],
  );
});

test('T-UNIT-ADMIN-V2 audit time filter and keyset paging', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  assert.deepEqual(auditWindow('24h', now), { since: '2026-10-10T12:00:00.000Z' });
  assert.deepEqual(auditWindow('7d', now), { since: '2026-10-04T12:00:00.000Z' });
  assert.deepEqual(auditWindow('all', now), {});
  const custom = auditWindow('custom', now, '2026-10-01', '2026-10-02');
  // whole local days, the end day included
  assert.equal(Date.parse(custom.until!) - Date.parse(custom.since!), 2 * 86_400_000);
  assert.deepEqual(auditWindow('custom', now), {});
  assert.deepEqual(pageStack([], 'next', 900), [900]);
  assert.deepEqual(pageStack([900], 'next', 800), [900, 800]);
  assert.deepEqual(pageStack([900, 800], 'prev'), [900]);
  assert.deepEqual(pageStack([900], 'next', null), [900]);
  assert.deepEqual(pageStack([900, 800], 'reset'), []);
});

test('T-UNIT-ADMIN-V2 time labels', () => {
  const now = new Date(2026, 9, 11, 10, 45).getTime();
  assert.equal(whenLabel(new Date(2026, 9, 11, 10, 41).toISOString(), now), 'Today 10:41');
  assert.equal(whenLabel(new Date(2026, 9, 10, 21, 2).toISOString(), now), 'Yesterday 21:02');
  assert.equal(whenLabel(new Date(2026, 9, 7, 14, 30).toISOString(), now), 'Oct 7 14:30');
  assert.equal(whenLabel(null, now), '');
  assert.equal(timeAgo(new Date(now - 12_000).toISOString(), now), '12 s ago');
  assert.equal(timeAgo(new Date(now - 3 * 60_000).toISOString(), now), '3 min ago');
  assert.equal(timeAgo(new Date(now - 5 * 3_600_000).toISOString(), now), '5 h ago');
  assert.equal(timeAgo(new Date(now - 30 * 3_600_000).toISOString(), now), 'Yesterday');
  assert.equal(timeAgo(new Date(now - 3 * 86_400_000).toISOString(), now), '3 days ago');
  assert.equal(dateLabel(new Date(2026, 8, 14, 12).toISOString(), now), 'Sep 14');
  assert.equal(dateLabel(new Date(2025, 8, 14, 12).toISOString(), now), 'Sep 14, 2025');
});

test('T-UNIT-ADMIN-V2 KPI change lines and sparklines', () => {
  assert.deepEqual(deltaLabel(112, 100, 'last Fri'), { text: '+12% vs last Fri', dir: 'up' });
  assert.deepEqual(deltaLabel(90, 100, 'last week'), { text: '-10% vs last week', dir: 'down' });
  assert.deepEqual(deltaLabel(5, 5, 'last week'), { text: 'Same as last week', dir: 'flat' });
  assert.deepEqual(deltaLabel(4, 0, 'last week'), { text: '+4 vs last week', dir: 'up' });
  assert.deepEqual(deltaLabel(4, null, 'last week'), { text: '', dir: 'flat' });
  assert.equal(sparkPath([1, 2, 3], 120, 30), 'M0.0 28.0 L60.0 15.0 L120.0 2.0');
  assert.equal(sparkPath([], 120, 30), 'M0 15 L120 15');
  assert.equal(sparkPath([4, 4], 120, 30), 'M0.0 15.0 L120.0 15.0');
});

test('T-UNIT-ADMIN-V2 media URLs and money', () => {
  assert.equal(
    mediaUrl('https://m.example/', '/c/1/l/2/t.webp'),
    'https://m.example/c/1/l/2/t.webp',
  );
  assert.equal(mediaUrl('', 'c/1.webp'), '');
  assert.equal(mediaUrl('https://m.example', null), '');
  assert.equal(moneyLabel(4500), '$45');
  assert.equal(moneyLabel(294000), '$2,940');
  assert.equal(moneyLabel(450), '$4.50');
  assert.equal(moneyLabel(0, true), 'Free');
  assert.equal(moneyLabel(null), '');
});
