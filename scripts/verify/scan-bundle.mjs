#!/usr/bin/env node
// T-SEC-12: the exported JS bundles contain no secrets (SECURITY T13).
// Usage: node scripts/verify/scan-bundle.mjs [dir]   (default: apps/mobile/dist)
// Build the bundles first (plain JS, same strings as the Hermes bytecode that ships;
// bytecode packs strings back to back, which makes regex boundaries unreliable):
//   cd apps/mobile && npx expo export -p ios -p android --no-bytecode --output-dir dist
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'apps/mobile/dist');

export const PATTERNS = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
  [
    'service_role JWT',
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*(InJvbGUiOiJzZXJ2aWNlX3JvbG|Jyb2xlIjoic2VydmljZV9yb2xl|icm9sZSI6InNlcnZpY2Vfcm9sZ)[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/,
  ],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY/],
  [
    'server-only env name',
    /\b(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY|SMTP_PASS(?:WORD)?|RESEND_API_KEY|EXPO_ACCESS_TOKEN|EMAIL_HASH_PEPPER|QUAD_ALIAS_SECRET|TURNSTILE_SECRET|SENTRY_AUTH_TOKEN)\b/,
  ],
  ['Resend API key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/],
  ['Google service account', /"type":\s*"service_account"/],
];

function files(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(js|hbc|json|map)$/.test(name)) out.push(p);
  }
  return out;
}

let list;
try {
  list = files(dir);
} catch {
  console.error(`scan-bundle: ${dir} not found. Export the bundles first.`);
  process.exit(2);
}
if (list.some((f) => f.endsWith('.hbc'))) {
  console.error(
    'scan-bundle: found Hermes bytecode; export with --no-bytecode so the scan reads plain JS',
  );
  process.exit(2);
}
const jsFiles = list.filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error(`scan-bundle: no bundles in ${dir}`);
  process.exit(2);
}

let hits = 0;
for (const f of list) {
  const text = readFileSync(f, 'latin1');
  for (const [label, re] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      hits++;
      const at = m.index ?? 0;
      const context = text.slice(Math.max(0, at - 40), at + 60).replace(/\s+/g, ' ');
      console.log(`FAIL  ${label} in ${f}: ${m[0].slice(0, 12)}… context: ${context}`);
    }
  }
}
console.log(
  `T-SEC-12 bundle scan: ${jsFiles.length} bundle(s), ${list.length} file(s), ${hits} finding(s)`,
);
process.exit(hits ? 1 : 0);
