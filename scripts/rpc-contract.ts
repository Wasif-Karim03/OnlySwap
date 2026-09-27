// RPC contract snapshot (P1-CI-03, T-CONTRACT-01, ADR-011).
//
//   node --experimental-strip-types scripts/rpc-contract.ts generate   # write the snapshot
//   node --experimental-strip-types scripts/rpc-contract.ts check      # CI: fail on breaking changes
//
// Reads every function in the `public` schema (the API surface) from the local
// database and compares it to packages/shared/src/rpc-contract.json. Contracts
// are additive-only: changing or removing a signature fails unless a `<name>_v2`
// exists. New functions fail until the snapshot is regenerated, so the file in
// git always matches the database.
//
// Database access: DB_URL (default: local Supabase) through `psql`, or through
// the Supabase Postgres container when psql isn't installed.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RpcSignature = {
  name: string;
  args: string;
  returns: string;
  security: 'definer' | 'invoker';
  grants: string[];
};

export type ContractProblem = {
  kind: 'breaking' | 'unrecorded';
  name: string;
  args: string;
  detail: string;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT = join(root, 'packages/shared/src/rpc-contract.json');
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const CONTRACT_QUERY = `
select coalesce(json_agg(f order by f->>'name', f->>'args'), '[]'::json)
from (
  select json_build_object(
    'name', p.proname,
    'args', pg_get_function_identity_arguments(p.oid),
    'returns', pg_get_function_result(p.oid),
    'security', case when p.prosecdef then 'definer' else 'invoker' end,
    'grants', coalesce((
      select json_agg(r order by r)
      from unnest(array['anon', 'authenticated', 'service_role']) as r
      where has_function_privilege(r, p.oid, 'execute')), '[]'::json)
  ) as f
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname not like 'test\\_%'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
) s`;

const key = (s: Pick<RpcSignature, 'name' | 'args'>) => `${s.name}(${s.args})`;

/** Breaking changes and unrecorded functions between the snapshot and the database. */
export function compareContracts(
  snapshot: RpcSignature[],
  live: RpcSignature[],
): ContractProblem[] {
  const problems: ContractProblem[] = [];
  const liveByKey = new Map(live.map((s) => [key(s), s]));
  const liveNames = new Set(live.map((s) => s.name));
  const snapKeys = new Set(snapshot.map(key));

  for (const old of snapshot) {
    const now = liveByKey.get(key(old));
    const hasV2 = liveNames.has(`${old.name}_v2`);
    if (!now) {
      if (!hasV2) {
        problems.push({
          kind: 'breaking',
          name: old.name,
          args: old.args,
          detail: 'removed or arguments changed; keep it and add a _v2 instead',
        });
      }
      continue;
    }
    const changes: string[] = [];
    if (now.returns !== old.returns) changes.push(`returns ${old.returns} -> ${now.returns}`);
    if (now.security !== old.security) changes.push(`security ${old.security} -> ${now.security}`);
    const lostGrants = old.grants.filter((g) => !now.grants.includes(g));
    if (lostGrants.length) changes.push(`execute revoked from ${lostGrants.join(', ')}`);
    if (changes.length && !hasV2) {
      problems.push({
        kind: 'breaking',
        name: old.name,
        args: old.args,
        detail: changes.join('; '),
      });
    }
  }

  for (const s of live) {
    if (!snapKeys.has(key(s))) {
      problems.push({
        kind: 'unrecorded',
        name: s.name,
        args: s.args,
        detail: 'not in rpc-contract.json; run the generate command and commit it',
      });
    }
  }
  return problems;
}

function runSql(sql: string): string {
  const url = process.env.DB_URL ?? DEFAULT_DB_URL;
  try {
    return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  const container = names.split('\n').find((n) => n.startsWith('supabase_db_'));
  if (!container)
    throw new Error('No psql and no running supabase_db_* container: start Supabase first');
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );
}

export function readLive(): RpcSignature[] {
  return JSON.parse(runSql(CONTRACT_QUERY).trim() || '[]') as RpcSignature[];
}

export function readSnapshot(): RpcSignature[] {
  return JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as RpcSignature[];
}

function main(mode: string | undefined): number {
  if (mode === 'generate') {
    const live = readLive();
    writeFileSync(SNAPSHOT, `${JSON.stringify(live, null, 2)}\n`);
    console.log(
      `rpc-contract: wrote ${live.length} function(s) to packages/shared/src/rpc-contract.json`,
    );
    return 0;
  }
  if (mode === 'check') {
    const problems = compareContracts(readSnapshot(), readLive());
    for (const p of problems)
      console.error(`rpc-contract: ${p.kind}: ${p.name}(${p.args}): ${p.detail}`);
    if (problems.length) return 1;
    console.log('rpc-contract: database matches the snapshot');
    return 0;
  }
  console.error('usage: rpc-contract.ts generate | check');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv[2]));
}
