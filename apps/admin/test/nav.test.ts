// Sidebar groups and the active item (approved mock).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isActive, NAV } from '../src/nav.ts';

test('T-UNIT-ADMIN-NAV groups in the mock order', () => {
  assert.deepEqual(
    NAV.map((g) => g.label),
    ['Monitor', 'People and items', 'Safety', 'Setup'],
  );
  const paths = NAV.flatMap((g) => g.items.map((i) => i.to));
  assert.equal(new Set(paths).size, paths.length, 'no duplicate entries');
  assert.ok(paths.includes('/reports') && paths.includes('/settings'));
  assert.deepEqual(
    NAV.map((g) => g.items.map((i) => i.label)),
    [
      ['Overview', 'Activity', 'Metrics', 'Waitlist'],
      ['People', 'Listings'],
      ['Reports', 'Support', 'Appeals', 'Quad', 'Meetups', 'Audit log'],
      ['Campuses', 'Announcements', 'Settings'],
    ],
  );
  const counted = NAV.flatMap((g) => g.items.filter((i) => i.count).map((i) => i.label));
  for (const l of ['Reports', 'Support', 'Appeals', 'Quad']) assert.ok(counted.includes(l), l);
});

test('T-UNIT-ADMIN-NAV active item', () => {
  assert.equal(isActive('/', '/'), true);
  assert.equal(isActive('/', '/reports'), false);
  assert.equal(isActive('/reports', '/reports/abc'), true);
  assert.equal(isActive('/settings', '/settings/words'), true);
  assert.equal(isActive('/people', '/peoplex'), false);
});
