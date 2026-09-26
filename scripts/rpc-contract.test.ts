// T-CONTRACT-01 logic (P1-CI-03): node --experimental-strip-types --test scripts/rpc-contract.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareContracts, type RpcSignature } from './rpc-contract.ts';

const makeOffer: RpcSignature = {
  name: 'make_offer',
  args: 'listing_id uuid, amount_cents integer',
  returns: 'offers',
  security: 'definer',
  grants: ['authenticated', 'service_role'],
};

test('an unchanged contract passes', () => {
  assert.deepEqual(compareContracts([makeOffer], [makeOffer]), []);
});

test('adding a function without updating the snapshot fails as unrecorded', () => {
  const extra = { ...makeOffer, name: 'withdraw_offer', args: 'offer_id uuid' };
  const problems = compareContracts([makeOffer], [makeOffer, extra]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.kind, 'unrecorded');
});

test('changing arguments without _v2 is breaking', () => {
  const changed = { ...makeOffer, args: 'listing_id uuid, amount_cents integer, note text' };
  const problems = compareContracts([makeOffer], [changed]);
  assert.ok(problems.some((p) => p.kind === 'breaking' && p.name === 'make_offer'));
});

test('changing the return type or revoking a grant without _v2 is breaking', () => {
  assert.equal(
    compareContracts([makeOffer], [{ ...makeOffer, returns: 'uuid' }])[0]!.kind,
    'breaking',
  );
  assert.equal(
    compareContracts([makeOffer], [{ ...makeOffer, grants: ['service_role'] }])[0]!.kind,
    'breaking',
  );
});

test('removing a function without _v2 is breaking', () => {
  assert.equal(compareContracts([makeOffer], [])[0]!.kind, 'breaking');
});

test('a _v2 makes a change to the original allowed (it must still be recorded)', () => {
  const v2 = {
    ...makeOffer,
    name: 'make_offer_v2',
    args: 'listing_id uuid, amount_cents integer, note text',
  };
  const problems = compareContracts([makeOffer], [v2]);
  assert.deepEqual(
    problems.map((p) => p.kind),
    ['unrecorded'],
  );
  assert.deepEqual(compareContracts([makeOffer, v2], [makeOffer, v2]), []);
});

test('adding a grant is additive and fine', () => {
  const wider = { ...makeOffer, grants: ['anon', 'authenticated', 'service_role'] };
  assert.deepEqual(compareContracts([makeOffer], [wider]), []);
});
