// P3-TEST-02 / DATA_MODEL §7: staging-only objects never reach production.
//   node scripts/verify/check-staging-migrations.mjs
// 1. Production migrations never define the test clock or test_set_now.
// 2. Every staging migration refuses to run when app.env = 'prod'.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const prodDir = join(root, 'supabase/migrations');
const stagingDir = join(root, 'supabase/migrations_staging');
const STAGING_ONLY = /test_set_now|test_clock|test_otps/i;
const GUARD = /current_setting\('app\.env',\s*true\)\s*=\s*'prod'/;

const problems = [];
for (const f of readdirSync(prodDir).filter((f) => f.endsWith('.sql'))) {
  if (STAGING_ONLY.test(readFileSync(join(prodDir, f), 'utf8'))) {
    problems.push(`supabase/migrations/${f} defines a staging-only object`);
  }
}
let staging = [];
try {
  staging = readdirSync(stagingDir).filter((f) => f.endsWith('.sql'));
} catch {
  staging = [];
}
for (const f of staging) {
  if (!GUARD.test(readFileSync(join(stagingDir, f), 'utf8'))) {
    problems.push(`supabase/migrations_staging/${f} is missing the app.env = 'prod' guard`);
  }
}
for (const p of problems) console.error(`staging-migrations: ${p}`);
if (problems.length) process.exit(1);
console.log(
  `staging-migrations: ${staging.length} staging file(s) guarded; production migrations clean`,
);
