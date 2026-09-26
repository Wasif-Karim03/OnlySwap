import { en } from '../src/strings/en';

function leaves(value: unknown, path = 'en'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
  }
  return [];
}

const EMOJI = /\p{Extended_Pictographic}/u;

describe('T-STORE (TESTING §7) en.ts follows the copy rules (CLAUDE.md rule 8)', () => {
  const strings = leaves(en);

  it('has strings to check', () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it.each(strings)('%s has no em or en dash', (_path, text) => {
    expect(text).not.toMatch(/[—–]/);
  });

  it.each(strings)('%s has no emoji', (_path, text) => {
    expect(text).not.toMatch(EMOJI);
  });

  it.each(strings)('%s has no stacked exclamation marks', (_path, text) => {
    expect(text).not.toMatch(/!{2,}/);
  });

  it.each(strings)('%s never says "safe-exchange zone"', (_path, text) => {
    expect(text.toLowerCase()).not.toContain('safe-exchange');
    expect(text.toLowerCase()).not.toContain('safe exchange');
  });
});
