// Plain words and pill colors for database values (docs/ADMIN_CHECKLIST.md §3).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ageBand,
  ageMethod,
  announcementType,
  appealSubject,
  auditAction,
  bannedAction,
  CAMPUS_DIALS,
  campusStatus,
  classYear,
  configKey,
  eventKind,
  eventVerb,
  FEED_FILTERS,
  humanize,
  listingStatus,
  platform,
  plural,
  reportActionLabel,
  reportReason,
  reportStatus,
  spotDesignation,
  targetType,
  userStatus,
} from '../src/labels.ts';

test('T-UNIT-ADMIN-LABELS report reasons in plain words with a color', () => {
  assert.deepEqual(reportReason('no_show'), { label: 'No-show', tone: 'amber' });
  assert.deepEqual(reportReason('calls_out_student'), {
    label: 'Calls out a student',
    tone: 'lilac',
  });
  assert.deepEqual(reportReason('threat'), { label: 'Threat', tone: 'red' });
  assert.deepEqual(reportReason('scam'), { label: 'Scam or fake', tone: 'amber' });
  assert.deepEqual(reportReason('spam'), { label: 'Spam', tone: 'neutral' });
  // Unknown values are humanized, never shown raw.
  assert.deepEqual(reportReason('new_reason_x'), { label: 'New reason x', tone: 'neutral' });
  assert.deepEqual(reportReason(null), { label: '', tone: 'neutral' });
});

test('T-UNIT-ADMIN-LABELS status pills: green active, red suspended or banned, amber waiting', () => {
  assert.equal(userStatus('active').tone, 'green');
  assert.equal(userStatus('suspended').tone, 'red');
  assert.equal(userStatus('banned').tone, 'red');
  assert.equal(userStatus('paused').tone, 'amber');
  assert.equal(userStatus('waitlist').tone, 'amber');
  assert.equal(userStatus('reverify').label, 'Re-verify');
  assert.equal(listingStatus('held_review').label, 'Held for review');
  assert.equal(listingStatus('held_review').tone, 'amber');
  assert.equal(listingStatus('removed').tone, 'red');
  assert.equal(listingStatus('active').tone, 'green');
  assert.equal(reportStatus('dismissed').tone, 'neutral');
  assert.equal(announcementType('safety').tone, 'red');
  assert.equal(announcementType('update').tone, 'sky');
  assert.deepEqual(bannedAction('review'), { label: 'Hold for review', tone: 'amber' });
  assert.deepEqual(spotDesignation('police'), { label: 'Police-designated', tone: 'sky' });
});

test('T-UNIT-ADMIN-LABELS campus pills: live, review demo, waitlist progress', () => {
  assert.deepEqual(campusStatus({ status: 'live' }), { label: 'Live', tone: 'green' });
  assert.deepEqual(campusStatus({ status: 'live', is_demo: true }), {
    label: 'Review demo',
    tone: 'lilac',
  });
  assert.deepEqual(campusStatus({ status: 'waitlist', waitlist: 312, unlock_threshold: 500 }), {
    label: 'Waitlist 312/500',
    tone: 'amber',
  });
  assert.equal(campusStatus({ status: 'waitlist' }).label, 'Waitlist');
  assert.equal(campusStatus({ status: 'paused' }).tone, 'amber');
});

test('T-UNIT-ADMIN-LABELS plurals', () => {
  assert.equal(plural(1, 'strike'), '1 strike');
  assert.equal(plural(2, 'strike'), '2 strikes');
  assert.equal(plural(0, 'strike'), '0 strikes');
  assert.equal(plural(1, 'no-show'), '1 no-show');
  assert.equal(plural(3, 'no-show'), '3 no-shows');
  assert.equal(plural(1, 'person', 'people'), '1 person');
  assert.equal(plural(1284, 'student'), '1,284 students');
});

test('T-UNIT-ADMIN-LABELS settings, campus dials and other enums', () => {
  assert.equal(configKey('maintenance'), 'Maintenance mode');
  assert.equal(configKey('chat_photos_enabled'), 'Chat photos');
  assert.equal(configKey('brand_new_key'), 'Brand new key');
  assert.equal(CAMPUS_DIALS.find((d) => d.key === 'unlock_threshold')?.label, 'Opens at');
  assert.equal(humanize('unlock_threshold'), 'Unlock threshold');
  assert.equal(targetType('quad_post'), 'Quad post');
  assert.equal(targetType('message'), 'Message in a chat');
  assert.equal(classYear('grad'), 'Grad');
  assert.equal(platform('ios'), 'iPhone');
  assert.equal(appealSubject('noshow'), 'a no-show');
});

test('T-UNIT-ADMIN-LABELS report action buttons say what they do', () => {
  assert.equal(reportActionLabel('remove_content', 'listing'), 'Remove listing');
  assert.equal(reportActionLabel('remove_content', 'message'), 'Remove message');
  assert.equal(reportActionLabel('suspend', 'user', 7), 'Suspend 7 days');
  assert.equal(reportActionLabel('suspend', 'user', 1), 'Suspend 1 day');
  assert.equal(reportActionLabel('ban'), 'Ban');
});

test('T-UNIT-ADMIN-LABELS audit actions in plain words', () => {
  assert.deepEqual(auditAction('person.view'), { label: 'Opened profile', tone: 'neutral' });
  assert.deepEqual(auditAction('user.status.suspended'), { label: 'Suspended', tone: 'red' });
  assert.deepEqual(auditAction('config.set'), { label: 'Changed setting', tone: 'sky' });
  assert.deepEqual(auditAction('announcement.create'), {
    label: 'Posted announcement',
    tone: 'lilac',
  });
  assert.equal(auditAction('change_email').label, 'Changed email');
  assert.equal(auditAction('something.new').label, 'Something new');
});

test('T-UNIT-ADMIN-LABELS activity events read as a sentence', () => {
  assert.equal(eventVerb('offer_made', { amount_cents: 4000 }), 'offered $40 on');
  assert.equal(eventVerb('offer_countered', { amount_cents: 4550 }), 'countered at $45.50 on');
  assert.equal(eventVerb('swiped_left'), 'swiped left on');
  assert.equal(eventVerb('searched', { query: 'desk lamp' }), 'searched "desk lamp"');
  assert.equal(eventVerb('deal_done', { agreed_cents: 3000 }), 'finished a deal on');
  assert.equal(eventKind('saved').icon, 'heart');
  assert.equal(eventKind('meetup_no_show').tone, 'red');
  assert.equal(eventKind('unknown_kind').label, 'Unknown kind');
  assert.equal(FEED_FILTERS[0].kinds, null);
});

test('T-UNIT-ADMIN-LABELS age check method and age group (AR-01)', () => {
  assert.equal(ageMethod('self_declared'), 'Gave a birthday');
  assert.equal(ageMethod('os_signal'), 'Phone age range');
  assert.equal(ageBand('13_17'), 'Age 13 to 17');
  assert.equal(ageBand('18_plus'), '18 or older');
  assert.equal(ageBand(null), '');
  assert.equal(ageBand(undefined), '');
});
