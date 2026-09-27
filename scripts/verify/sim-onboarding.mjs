// Helpers for the S14 Simulator checks (local Supabase only).
//   bash scripts/verify/s14-sim.sh avatar   (sets SERVICE_KEY; or run this file directly)
//   SERVICE_KEY=... node --experimental-strip-types scripts/verify/sim-onboarding.mjs avatar
//     The newest profile photo saved from the app: downloads it from local
//     storage and checks it has no EXIF at all (the phone re-encoded it;
//     P5-MEDIA-03 with the real encoder).
//   SERVICE_KEY=... node scripts/verify/sim-onboarding.mjs bump
//     Raises rules_version by one and sets a "What changed" line (E2E-22).
//   SERVICE_KEY=... node scripts/verify/sim-onboarding.mjs reset
//     Puts rules_version back to 1 with no changes listed.
//   SERVICE_KEY=... node scripts/verify/sim-onboarding.mjs overdue
//     S15: puts the newest profile's yearly check in the past (X9 on reload).
//   SERVICE_KEY=... node scripts/verify/sim-onboarding.mjs signout
//     S15: revokes every session of the newest profile (X7 on the next refresh);
//     needs `bash scripts/verify/s14-sim.sh serve` running.
//   SERVICE_KEY=... node scripts/verify/sim-onboarding.mjs redo
//     Clears the name and photo of the newest profile (the Simulator account),
//     so reloading the app opens "Set up your profile" again.
import { inspectExif } from '../../apps/mobile/src/lib/exifGps.ts';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const service = process.env.SERVICE_KEY;
if (!service) {
  console.error('SERVICE_KEY must be set');
  process.exit(2);
}
const admin = (path, init = {}) =>
  fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
const setConfig = (key, value) =>
  admin(`app_config?key=eq.${key}`, { method: 'PATCH', body: JSON.stringify({ value }) });

const mode = process.argv[2];

if (mode === 'avatar') {
  const rows = await (
    await admin(
      'profiles?select=first_name,avatar_path&avatar_path=not.is.null&order=created_at.desc&limit=1',
    )
  ).json();
  const row = rows[0];
  if (!row) {
    console.log('FAIL  no profile photo found: add one on "Set up your profile" first');
    process.exit(1);
  }
  const res = await fetch(`${url}/storage/v1/object/public/onlyswap-media/${row.avatar_path}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const report = inspectExif(bytes);
  const webp = bytes.length > 12 && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const ok = res.status === 200 && webp && !report.hasExif && !report.hasGps;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${row.first_name}'s photo: ${bytes.length} bytes, webp=${webp}, exif=${report.hasExif}, gps=${report.hasGps}`,
  );
  process.exit(ok ? 0 : 1);
} else if (mode === 'redo') {
  const rows = await (
    await admin('profiles?select=id,first_name&order=created_at.desc&limit=1')
  ).json();
  const row = rows[0];
  if (!row) {
    console.log('FAIL  no profile found');
    process.exit(1);
  }
  await admin(`profiles?id=eq.${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ first_name: null, last_initial: null, avatar_path: null }),
  });
  console.log(
    `Cleared ${row.first_name ?? 'the newest'} profile. Press r in Metro: the app opens "Set up your profile".`,
  );
} else if (mode === 'overdue' || mode === 'signout') {
  const rows = await (
    await admin('profiles?select=id,first_name&order=created_at.desc&limit=1')
  ).json();
  const row = rows[0];
  if (!row) {
    console.log('FAIL  no profile found');
    process.exit(1);
  }
  if (mode === 'overdue') {
    const past = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    await admin(`profiles?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ verified_until: past }),
    });
    console.log(
      `${row.first_name}'s yearly check is now overdue. Press r in Metro: the app opens the re-verify screen.`,
    );
  } else {
    const res = await fetch(`${url}/functions/v1/revoke-sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${service}`, 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: row.id }),
    });
    console.log(
      res.ok
        ? `${row.first_name} is signed out everywhere. Within an hour (or press r in Metro) the app asks for a code.`
        : `revoke-sessions answered HTTP ${res.status}: is "bash scripts/verify/s14-sim.sh serve" running?`,
    );
  }
} else if (mode === 'bump') {
  const cur =
    (await (await admin('app_config?select=value&key=eq.rules_version')).json())[0]?.value ?? '1';
  const next = String(Number.parseInt(cur, 10) + 1);
  await setConfig('rules_version', next);
  await setConfig('rules_changes', ['Fakes are now on the banned list.']);
  console.log(
    `rules_version ${cur} -> ${next}. Reload the app: it should open on "We updated the rules".`,
  );
} else if (mode === 'reset') {
  await setConfig('rules_version', '1');
  await setConfig('rules_changes', []);
  console.log('rules_version back to 1 (what the seeded accounts accepted), no changes listed.');
} else {
  console.error('usage: sim-onboarding.mjs avatar | redo | overdue | signout | bump | reset');
  process.exit(2);
}
