// P2-TOK-01 (values match DESIGN_SYSTEM) and T-UNIT-TOK-01 (contrast).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const tokens = JSON.parse(readFileSync(join(pkg, 'tokens.json'), 'utf8'));
const spec = readFileSync(join(pkg, '../../docs/DESIGN_SYSTEM.md'), 'utf8');

function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('P2-TOK-01 generated dist files are up to date', () => {
  execFileSync(process.execPath, [join(pkg, 'scripts/generate.mjs'), '--check'], { stdio: 'pipe' });
});

test('P2-TOK-01 color tokens match the DESIGN_SYSTEM §2 table', () => {
  const rows = [
    ...spec.matchAll(
      /^\| `(\w+)`(?: \/ `(\w+)`)? \| (#[0-9A-F]{6})(?: \/ (#[0-9A-F]{6}))?[^|]*\| (#[0-9A-F]{6}|same)(?: \/ (#[0-9A-F]{6}))? \|/gm,
    ),
  ];
  assert.ok(rows.length >= 10, `parsed ${rows.length} color rows`);
  for (const [, name, name2, light, light2, dark, dark2] of rows) {
    if (name === 'accent' || name === 'onAccent') continue;
    assert.equal(tokens.color.light[name], light, `light ${name}`);
    assert.equal(tokens.color.dark[name], dark, `dark ${name}`);
    if (name2) {
      assert.equal(tokens.color.light[name2], light2, `light ${name2}`);
      assert.equal(tokens.color.dark[name2], dark2, `dark ${name2}`);
    }
  }
  const options = spec.match(/\*\*Accent options\*\*[^\n]*/)[0];
  for (const [, label, hex] of options.matchAll(
    /(Pistachio|Butter|Tangerine|Coral|Bubblegum|Sky|Cobalt) (#[0-9A-F]{6})/g,
  )) {
    assert.equal(tokens.color.accents[label.toLowerCase()].accent, hex, label);
  }
  assert.equal(tokens.color.accents.cobalt.onAccentLight, '#FFFFFF');
});

test('P2-TOK-01 type tokens match the DESIGN_SYSTEM §3 table', () => {
  const rows = [
    ...spec.matchAll(
      /^\| `(\w+)` \| ([\d.]+) \/ (\d+)(?: \/ ([−-]?[\d.]+)em| \/ 0)?(?: \/ ([\d.]+))? \|/gm,
    ),
  ];
  assert.equal(rows.length, 8);
  for (const [, name, size, weight, tracking, line] of rows) {
    const t = tokens.type[name];
    assert.ok(t, name);
    assert.equal(t.size, Number(size), `${name} size`);
    assert.equal(t.specWeight ?? Number(t.weight), Number(weight), `${name} weight`);
    if (tracking) assert.equal(t.tracking, Number(tracking.replace('−', '-')), `${name} tracking`);
    if (line) assert.equal(t.line, Number(line), `${name} line`);
  }
  assert.equal(tokens.type.price.tabular, true);
});

test('P2-TOK-01 space, radius and motion match DESIGN_SYSTEM §4-5', () => {
  assert.deepEqual(
    { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, screen: 20, rowMin: 52 },
    tokens.space,
  );
  assert.equal(tokens.radius.control, 15);
  assert.equal(tokens.radius.card, 18);
  assert.equal(tokens.radius.sheet, 28);
  assert.equal(tokens.radius.thumb, 12);
  assert.equal(tokens.size.hit, 44);
  assert.deepEqual([tokens.size.buttonL, tokens.size.buttonM, tokens.size.buttonS], [54, 44, 36]);
  assert.deepEqual(tokens.motion.sheet, { damping: 22, stiffness: 240 });
  assert.deepEqual(tokens.motion.swipe, { damping: 18, stiffness: 180, flyOut: 220 });
  assert.equal(tokens.motion.tap.scale, 0.97);
  assert.equal(tokens.motion.tap.duration, 120);
  assert.equal(tokens.motion.success.duration, 400);
  assert.equal(tokens.motion.fade.duration, 150);
  assert.equal(tokens.fontScale.overlayMax, 1.4);
});

test('T-UNIT-TOK-01 required contrast pairs pass in light and dark for every accent', () => {
  for (const mode of ['light', 'dark']) {
    const c = tokens.color[mode];
    assert.ok(contrast(c.ink, c.bg) >= 7, `${mode} ink/bg`);
    assert.ok(contrast(c.ink, c.bg2) >= 7, `${mode} ink/bg2`);
    assert.ok(contrast(c.ink2, c.bg) >= 4.5, `${mode} ink2/bg`);
    for (const t of ['sky', 'peach', 'lilac']) {
      assert.ok(contrast(c[t], c[`${t}Bg`]) >= 4.5, `${mode} ${t}/${t}Bg`);
      assert.ok(contrast(c.ink, c[`${t}Bg`]) >= 4.5, `${mode} ink/${t}Bg`);
    }
    for (const [name, a] of Object.entries(tokens.color.accents)) {
      const on = mode === 'light' ? a.onAccentLight : a.onAccentDark;
      assert.ok(
        contrast(on, a.accent) >= 4.5,
        `${mode} onAccent/${name} = ${contrast(on, a.accent).toFixed(2)}`,
      );
    }
  }
});
