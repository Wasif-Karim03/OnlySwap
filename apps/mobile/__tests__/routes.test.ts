/**
 * Every screen file maps to its own URL. Groups like (auth) and (tabs) don't add
 * a path segment, so (auth)/notifications.tsx and notifications/index.tsx both
 * became /notifications, and sign-in landed on the wrong screen (found on the
 * Simulator).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join(__dirname, '..', 'app');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

export function routeOf(file: string): string | null {
  const rel = relative(APP, file).replace(/\.tsx?$/, '');
  const parts = rel.split('/');
  const last = parts[parts.length - 1]!;
  if (last.startsWith('_') || last.startsWith('+')) return null;
  const path = parts
    .filter((s) => !/^\(.*\)$/.test(s))
    .filter((s, i, a) => !(s === 'index' && i === a.length - 1))
    .join('/');
  return '/' + path;
}

describe('routes', () => {
  it('no two screens share a URL', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of files(APP)) {
      const r = routeOf(f);
      if (!r) continue;
      if (seen.has(r)) clashes.push(`${r}: ${relative(APP, seen.get(r)!)} and ${relative(APP, f)}`);
      else seen.set(r, f);
    }
    expect(clashes).toEqual([]);
  });

  it('computes URLs like Expo Router', () => {
    expect(routeOf(join(APP, '(auth)/allow-notifications.tsx'))).toBe('/allow-notifications');
    expect(routeOf(join(APP, 'notifications/index.tsx'))).toBe('/notifications');
    expect(routeOf(join(APP, '(tabs)/discover/index.tsx'))).toBe('/discover');
    expect(routeOf(join(APP, '_layout.tsx'))).toBeNull();
  });
});
