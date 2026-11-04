/** P14-LEGAL-01: the bundled legal pages parse into readable blocks. */
import { inline, parseMarkdown, stackTables } from '@/features/legal/markdown';
import { LEGAL } from '@/legal/generated';

describe('P14-LEGAL-01 bundled legal text', () => {
  it('has all seven documents at the current version', () => {
    expect(Object.keys(LEGAL).sort()).toEqual(
      ['banned-items', 'child-safety', 'cookies', 'privacy', 'rules', 'safety', 'terms'].sort(),
    );
    for (const d of Object.values(LEGAL)) expect(d.version).toBe('2026-11');
  });

  it('parses headings, lists, tables and inline marks', () => {
    const blocks = parseMarkdown(
      '## 1. Who\n\nText with [a link](/help) and **bold**.\n\n- one\n- two\n\n1. first\n\n| A | B |\n|---|---|\n| x | y |\n\n**Call 911.**',
    );
    expect(blocks).toEqual([
      { kind: 'h2', text: '1. Who' },
      { kind: 'p', text: 'Text with a link and bold.', strong: false },
      { kind: 'li', text: 'one', marker: '•' },
      { kind: 'li', text: 'two', marker: '•' },
      { kind: 'li', text: 'first', marker: '1.' },
      { kind: 'row', cells: ['A', 'B'], header: true },
      { kind: 'row', cells: ['x', 'y'], header: false },
      { kind: 'p', text: 'Call 911.', strong: true },
    ]);
    expect(inline('`x`')).toBe('x');
  });

  it('every document parses with a heading or text and no leftover markup', () => {
    for (const d of Object.values(LEGAL)) {
      const blocks = parseMarkdown(d.body);
      expect(blocks.length).toBeGreaterThan(3);
      const text = JSON.stringify(blocks);
      expect(text).not.toMatch(/\]\(|\*\*|##/);
    }
  });
});

describe('QA-L11 tables stack on a phone', () => {
  it('turns each data row into labelled fields and drops the header row', () => {
    const blocks = parseMarkdown(
      '| What | Why |\n|---|---|\n| Email | Sign in |\n| Photos |  |\n\nAfter',
    );
    expect(stackTables(blocks)).toEqual([
      {
        kind: 'record',
        fields: [
          { label: 'What', value: 'Email' },
          { label: 'Why', value: 'Sign in' },
        ],
      },
      { kind: 'record', fields: [{ label: 'What', value: 'Photos' }] },
      { kind: 'p', text: 'After', strong: false },
    ]);
  });

  it('a table without a header keeps its cells, unlabelled', () => {
    const blocks = parseMarkdown('| a | b |');
    expect(stackTables(blocks)).toEqual([
      {
        kind: 'record',
        fields: [
          { label: '', value: 'a' },
          { label: '', value: 'b' },
        ],
      },
    ]);
  });

  it('every bundled table row keeps its header labels', () => {
    for (const page of Object.values(LEGAL)) {
      for (const b of stackTables(parseMarkdown(page.body))) {
        if (b.kind === 'record') expect(b.fields.every((f) => f.label !== '')).toBe(true);
      }
    }
  });
});
