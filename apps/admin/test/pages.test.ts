// Part B pages: pure helpers behind Activity, the student and listing pages,
// Add school, Waitlist, bulk listing actions, Support and System health.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACTIVITY_GROUPS,
  botState,
  cronStatus,
  deletionStatus,
  dwellLabel,
  eventDetails,
  exportStatus,
  meetupPill,
  mockAction,
  supportTopic,
  swipeDirection,
} from '../src/labels.ts';
import {
  activityArgs,
  activityCsvRows,
  activityWindow,
  appendPage,
  bulkResultText,
  bytesLabel,
  comparisonText,
  cronLabel,
  durationLabel,
  funnelRows,
  heatLevels,
  hourLabel,
  isMissingFunction,
  kindsArg,
  kindsSummary,
  mockBotState,
  newCampusArgs,
  newCampusError,
  peakHours,
  personTab,
  ratingLabel,
  rightLeft,
  slugFromName,
  supportEmailLine,
  swipeCounts,
  thresholdPct,
  timelineKinds,
  toCsv,
  toggleGroup,
  toggleItem,
  ACTIVITY_CSV_COLS,
  type NewCampusForm,
} from '../src/logic.ts';

const NOW = Date.parse('2026-10-11T15:30:00Z');

test('T-UNIT-ADMIN-ACT time presets', () => {
  assert.deepEqual(activityWindow('hour', NOW), {
    since: '2026-10-11T14:30:00.000Z',
    until: null,
  });
  assert.equal(activityWindow('7d', NOW).since, '2026-10-04T15:30:00.000Z');
  const today = activityWindow('today', NOW);
  const d = new Date(today.since!);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.ok(Date.parse(today.since!) <= NOW && NOW - Date.parse(today.since!) < 86_400_000);
  const custom = activityWindow('custom', NOW, '2026-10-01', '2026-10-02');
  assert.equal(
    Date.parse(custom.until!) - Date.parse(custom.since!),
    2 * 86_400_000,
    'both days included',
  );
  assert.deepEqual(activityWindow('custom', NOW), { since: null, until: null });
});

test('T-UNIT-ADMIN-ACT type filter to kinds', () => {
  assert.equal(kindsArg([]), null, 'none picked = server default (no deck cards)');
  assert.deepEqual(kindsArg(['saved', 'saved', 'signup']), ['saved', 'signup']);
  const swipes = ACTIVITY_GROUPS.find((g) => g.id === 'swipes')!;
  const on = toggleGroup([], swipes.kinds);
  assert.deepEqual(on.sort(), [...swipes.kinds].sort());
  assert.deepEqual(toggleGroup(on, swipes.kinds), [], 'second click clears the group');
  assert.deepEqual(toggleGroup(['saved'], swipes.kinds).sort(), [...swipes.kinds].sort());
  assert.equal(kindsSummary([], ACTIVITY_GROUPS), 'All');
  assert.equal(kindsSummary(on, ACTIVITY_GROUPS), 'Swipes');
  assert.equal(kindsSummary([...on, 'signup'], ACTIVITY_GROUPS), 'Swipes, Sign-ups');
  assert.equal(kindsSummary(['saved', 'offer_made'], ACTIVITY_GROUPS), '2 types');
  assert.deepEqual(toggleItem(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleItem(['b'], 'a'), ['b', 'a']);
  // every kind in a group is one the server knows
  const all = ACTIVITY_GROUPS.flatMap((g) => g.kinds);
  assert.equal(new Set(all).size, all.length, 'no kind in two groups');
  assert.equal(all.length, 20, 'deck cards are no longer recorded (DEC 100)');
});

test('T-UNIT-ADMIN-ACT filters to RPC args', () => {
  const args = activityArgs({
    campusId: '',
    kinds: [],
    userId: 'u1',
    listingId: null,
    range: 'hour',
    now: NOW,
  });
  assert.deepEqual(args, {
    campus_id: null,
    kinds: null,
    user_id: 'u1',
    listing_id: null,
    since: '2026-10-11T14:30:00.000Z',
    until: null,
    cursor: null,
    limit: 50,
  });
  const next = activityArgs({
    campusId: 'c1',
    kinds: ['saved'],
    userId: null,
    listingId: 'l1',
    range: '7d',
    now: NOW,
    cursor: { at: '2026-10-11T10:00:00Z', id: 'saved:x' },
  });
  assert.equal(next.campus_id, 'c1');
  assert.deepEqual(next.kinds, ['saved']);
  assert.deepEqual(next.cursor, { at: '2026-10-11T10:00:00Z', id: 'saved:x' });
});

test('T-UNIT-ADMIN-ACT paging and CSV', () => {
  assert.deepEqual(
    appendPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((x) => x.id),
    ['a', 'b', 'c'],
  );
  const rows = activityCsvRows(
    [
      {
        at: '2026-10-11T10:00:00Z',
        kind: 'offer_made',
        person: { id: 'u1', display_name: 'Maya R.' },
        listing: { id: 'l1', title: 'City bike, "blue"' },
        platform: 'ios',
        details: { amount_cents: 10000, asking_cents: 12000, round: 1 },
      },
      {
        at: '2026-10-11T09:00:00Z',
        kind: 'signup',
        person: null,
        listing: null,
        platform: null,
        details: null,
      },
    ],
    eventDetails,
  );
  assert.equal(rows[0]!.details, '$100 · asking $120');
  assert.equal(rows[1]!.student, 'Deleted account');
  const csv = toCsv(rows, ACTIVITY_CSV_COLS).split('\n');
  assert.equal(csv[0], 'time,student_id,student,action,listing_id,listing,details,device');
  assert.ok(csv[1]!.includes('"City bike, ""blue"""'));
});

test('T-UNIT-ADMIN-ACT details never show message text', () => {
  assert.equal(eventDetails('message_sent', { chat_id: 'c', message_kind: 'text' }), 'text locked');
  assert.equal(eventDetails('swiped_left', { dwell_ms: 1200 }), '1 s on the card');
  assert.equal(
    eventDetails('listing_viewed', { source: 'search', dwell_ms: 41000 }),
    'from search · 41 s on the page',
  );
  assert.equal(
    eventDetails('deal_done', { agreed_cents: 3000, asking_cents: 3000 }),
    '$30 in person',
  );
  assert.equal(eventDetails('meetup_set', { place: 'Library steps' }), 'Library steps');
  assert.equal(eventDetails('listing_posted', { price_cents: 0 }), 'Free');
  assert.equal(dwellLabel(65_000), '1 min 5 s');
  assert.equal(dwellLabel(null), '');
});

test('T-UNIT-ADMIN-LISTING funnel math', () => {
  const rows = funnelRows({ shown: 540, viewed: 402, saved: 24, offered: 6, sold: false });
  assert.deepEqual(
    rows.map((r) => [r.label, r.value, r.pct]),
    [
      ['Shown in deck', 540, 100],
      ['Viewed details', 402, 74],
      ['Saved', 24, 4],
      ['Offered', 6, 2],
      ['Sold', 0, 1],
    ],
  );
  assert.equal(funnelRows({ shown: 0, viewed: 0, saved: 0, offered: 0, sold: false })[0]!.pct, 1);
  assert.deepEqual(rightLeft({ right: 30, left: 108 }), { right: 22, left: 78 });
  assert.deepEqual(rightLeft({ right: 0, left: 0 }), { right: 0, left: 0 });
  assert.deepEqual(
    swipeCounts([{ direction: 'left' }, { direction: 'saved' }, { direction: 'left' }]),
    { all: 3, offered: 0, saved: 1, left: 2 },
  );
  assert.equal(swipeDirection('offered').label, 'Right (offer)');
});

test('T-UNIT-ADMIN-LISTING comparison only from server numbers', () => {
  assert.equal(comparisonText(null, 'Bikes', 'Ohio Wesleyan'), null);
  assert.equal(
    comparisonText(
      { right_rate: 22, category_right_rate: null, category_swipes: 0 },
      'Bikes',
      'OWU',
    ),
    null,
  );
  assert.deepEqual(
    comparisonText(
      { right_rate: 18.5, category_right_rate: 31, category_swipes: 400 },
      'Bikes',
      'Ohio Wesleyan',
    ),
    {
      line: 'Similar bikes at Ohio Wesleyan get 31% right swipes.',
      hint: 'This one gets 18.5%, well below that.',
    },
  );
  assert.equal(
    comparisonText(
      { right_rate: 21.7, category_right_rate: 31, category_swipes: 400 },
      'Bikes',
      'OWU',
    )!.hint,
    null,
    'under 10 points apart is no hint',
  );
  assert.equal(
    comparisonText(
      { right_rate: 12, category_right_rate: 31, category_swipes: 12 },
      'Bikes',
      'OWU',
    )!.hint,
    null,
    'too few swipes for a hint',
  );
  assert.equal(
    comparisonText({ right_rate: 30, category_right_rate: 31.5, category_swipes: 400 }, null, null)!
      .line,
    'Similar listings get 31.5% right swipes.',
  );
});

test('T-UNIT-ADMIN-PERSON tabs, timeline filter, heat strip', () => {
  assert.equal(personTab('offers'), 'offers');
  assert.equal(personTab('access'), 'access');
  assert.equal(personTab('nope'), 'timeline');
  assert.equal(personTab(undefined), 'timeline');
  assert.equal(timelineKinds('all', []), null);
  assert.deepEqual(timelineKinds('left', []), ['swiped_left']);
  assert.deepEqual(timelineKinds('left', ['signup']), ['signup'], 'type pick wins');
  const hourly = Array.from({ length: 24 }, (_, h) => (h === 20 ? 10 : h === 21 ? 8 : 0));
  const lv = heatLevels(hourly);
  assert.equal(lv.length, 24);
  assert.equal(lv[20], 1);
  assert.equal(lv[3], 0.06);
  assert.deepEqual(heatLevels([]), Array(24).fill(0.06));
  assert.equal(peakHours(hourly), 'Most active 8 pm to 10 pm');
  assert.equal(peakHours([]), 'No activity in the last 30 days');
  assert.equal(hourLabel(0), '12 am');
  assert.equal(hourLabel(12), '12 pm');
  assert.equal(hourLabel(23), '11 pm');
  assert.equal(ratingLabel({ up: 5, down: 0 }), '100% up');
  assert.equal(ratingLabel({ up: 0, down: 0 }), 'No ratings');
});

const form = (p: Partial<NewCampusForm> = {}): NewCampusForm => ({
  name: 'Kenyon College',
  short_name: 'Kenyon',
  slug: 'kenyon-college',
  timezone: 'America/New_York',
  domain: 'kenyon.edu',
  status: 'waitlist',
  spot_name: '',
  spot_description: '',
  spot_hours: '',
  spot_lat: '',
  spot_lng: '',
  reason: 'Waitlist demand',
  ...p,
});

test('T-UNIT-ADMIN-SCHOOL slug and Add school form', () => {
  assert.equal(slugFromName('Ohio Wesleyan University'), 'ohio-wesleyan-university');
  assert.equal(slugFromName("  St. Mary's College & Seminary "), 'st-mary-s-college-and-seminary');
  assert.equal(slugFromName('Université de Montréal'), 'universite-de-montreal');
  assert.ok(slugFromName('A'.repeat(80)).length <= 40);
  assert.ok(!slugFromName('x '.repeat(30)).endsWith('-'));
  assert.equal(newCampusError(form()), null);
  assert.match(newCampusError(form({ name: 'Ke' }))!, /school name/);
  assert.match(newCampusError(form({ slug: 'Bad Slug' }))!, /link name/);
  assert.match(newCampusError(form({ domain: 'kenyon' }))!, /domain/);
  assert.match(newCampusError(form({ spot_name: 'Library' }))!, /latitude/);
  assert.match(
    newCampusError(form({ spot_name: 'Library', spot_lat: '40.3', spot_lng: '200' }))!,
    /longitude/,
  );
  assert.match(newCampusError(form({ reason: 'x' }))!, /reason/);
  assert.equal(newCampusArgs(form()).spot, null);
  const args = newCampusArgs(
    form({
      domain: '@Kenyon.EDU ',
      spot_name: 'Library',
      spot_lat: '40.37',
      spot_lng: '-82.39',
      spot_hours: '8am to 10pm',
    }),
  );
  assert.equal(args.domain, 'kenyon.edu');
  assert.deepEqual(args.spot, { name: 'Library', lat: 40.37, lng: -82.39, hours: '8am to 10pm' });
  assert.equal(thresholdPct(312, 500), 62);
  assert.equal(thresholdPct(900, 500), 100);
  assert.equal(thresholdPct(5, 0), 0);
});

test('T-UNIT-ADMIN-TOOLS bulk result, support line, health labels', () => {
  assert.equal(bulkResultText('removed', { changed: 4, skipped_ids: [] }), 'Removed 4.');
  assert.match(
    bulkResultText('held_review', { changed: 3, skipped_ids: ['x'] }),
    /^Held 3\. 1 skipped/,
  );
  assert.equal(
    supportEmailLine('maya.r@owu.edu'),
    'Sends an email to maya.r@owu.edu from the OnlySwap support address.',
  );
  assert.match(supportEmailLine(null), /cannot be sent/);
  assert.equal(bytesLabel(186_000_000), '177 MB');
  assert.equal(bytesLabel(524_288_000), '500 MB');
  assert.equal(bytesLabel(2048), '2 KB');
  assert.equal(durationLabel('2026-10-11T10:00:00.000Z', '2026-10-11T10:00:00.120Z'), '120 ms');
  assert.equal(durationLabel('2026-10-11T10:00:00Z', '2026-10-11T10:00:02.4Z'), '2.4 s');
  assert.equal(durationLabel(null, null), '');
  assert.equal(cronLabel('* * * * *'), 'Every minute');
  assert.equal(cronLabel('*/15 * * * *'), 'Every 15 min');
  assert.equal(cronLabel('0 * * * *'), 'Every hour');
  assert.equal(cronLabel('30 9 * * *'), 'Daily 09:30 UTC');
  assert.equal(cronStatus('succeeded').label, 'OK');
  assert.equal(cronStatus(null).label, 'Not run yet');
  assert.deepEqual(deletionStatus({ status: 'started', stuck: true }), {
    label: 'Stuck',
    tone: 'red',
  });
  assert.equal(deletionStatus({ status: 'started' }).label, 'Running');
  assert.equal(deletionStatus({ status: 'done' }).label, 'Done');
  assert.equal(exportStatus('failed').tone, 'red');
  assert.equal(supportTopic('cant_access_email'), "Can't get into school email");
  assert.equal(
    meetupPill({ status: 'confirmed', buyer_here_at: 'x', seller_here_at: 'y' }).label,
    'Checked in',
  );
  assert.equal(meetupPill({ status: 'confirmed', no_show_reports: 1 }).label, 'No-show reported');
  assert.equal(meetupPill({ status: 'cancelled' }).label, 'Cancelled');
});

test('T-UNIT-ADMIN-STAGING the mock status function is missing on this server', () => {
  assert.equal(
    isMissingFunction(
      'Could not find the function public.admin_mock_status without parameters in the schema cache',
    ),
    true,
  );
  assert.equal(isMissingFunction('PGRST202'), true);
  assert.equal(
    isMissingFunction('You need an admin account with MFA, and the right role, for that.'),
    false,
  );
  assert.equal(isMissingFunction(null), false);
});

test('T-UNIT-ADMIN-STAGING mock bot state', () => {
  const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
  assert.equal(mockBotState(null, NOW), 'not_scheduled');
  assert.equal(mockBotState({ active: false, last_run: null }, NOW), 'paused');
  assert.equal(mockBotState({ active: true, last_run: null }, NOW), 'not_run');
  assert.equal(
    mockBotState({ active: true, last_run: { status: 'failed', start_time: at(1) } }, NOW),
    'failing',
  );
  assert.equal(
    mockBotState({ active: true, last_run: { status: 'succeeded', start_time: at(1) } }, NOW),
    'running',
  );
  assert.equal(
    mockBotState({ active: true, last_run: { status: 'succeeded', start_time: at(12) } }, NOW),
    'late',
  );
  assert.deepEqual(botState('failing'), { label: 'Last run failed', tone: 'red' });
  assert.deepEqual(botState('running'), { label: 'Running', tone: 'green' });
  assert.equal(mockAction('accept_offer'), 'Accepted an offer');
  assert.equal(mockAction('confirm_deal'), 'Answered "Did it sell?"');
  assert.equal(mockAction('new_thing'), 'New thing');
});
