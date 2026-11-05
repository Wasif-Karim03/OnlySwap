/**
 * A tiny markdown reader for the bundled legal pages (P14-LEGAL-01). It knows
 * only what those files use: ## and ### headings, paragraphs, - and 1. lists,
 * pipe tables, **bold** and [links](/path). Links become plain text.
 */
export type Block =
  | { kind: 'h2' | 'h3' | 'p'; text: string; strong?: boolean }
  | { kind: 'li'; text: string; marker: string }
  | { kind: 'row'; cells: string[]; header: boolean };

/** A table row shown stacked: each cell under its column header. */
export type RecordBlock = { kind: 'record'; fields: { label: string; value: string }[] };
export type PhoneBlock = Exclude<Block, { kind: 'row' }> | RecordBlock;

/**
 * Tables as stacked records for a phone (QA-L11): a two-column table at
 * `meta` size was tiny and cramped. The header row becomes the labels of the
 * rows under it; a row with no header keeps its cells without labels.
 */
export function stackTables(blocks: readonly Block[]): PhoneBlock[] {
  let header: string[] = [];
  return blocks.flatMap((b): PhoneBlock[] => {
    if (b.kind !== 'row') {
      header = [];
      return [b];
    }
    if (b.header) {
      header = b.cells;
      return [];
    }
    const fields = b.cells
      .map((value, j) => ({ label: header[j] ?? '', value }))
      .filter((f) => f.value !== '');
    return [{ kind: 'record', fields }];
  });
}

export function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      const raw = para.join(' ');
      blocks.push({ kind: 'p', text: inline(raw), strong: /^\*\*[^*]+\*\*$/.test(raw.trim()) });
      para = [];
    }
  };
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: m[1] === '##' ? 'h2' : 'h3', text: inline(m[2]!) });
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'li', text: inline(m[1]!), marker: '•' });
    } else if ((m = /^\s*(\d+)\.\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'li', text: inline(m[2]!), marker: `${m[1]}.` });
    } else if (line.trim().startsWith('|')) {
      flush();
      if (/^\|[\s|:-]+\|$/.test(line.trim())) continue; // the |---| separator
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => inline(c));
      const next = lines[i + 1]?.trim() ?? '';
      blocks.push({ kind: 'row', cells, header: /^\|[\s|:-]+\|$/.test(next) });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}
