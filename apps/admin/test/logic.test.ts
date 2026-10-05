// P12-ADM-02 guard and helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ageLabel,
  allowedActions,
  canReveal,
  errorMessage,
  gate,
  holdReasonLabel,
  maxUntil,
  rateLimitRetryAt,
  revealFormError,
  sessionExpired,
  SESSION_MS,
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
