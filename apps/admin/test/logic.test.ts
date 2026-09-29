// P12-ADM-02 guard and helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allowedActions,
  errorMessage,
  gate,
  maxUntil,
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
