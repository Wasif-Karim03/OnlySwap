import { fill } from '@/lib/format';
import { sell as sellCopy } from '@/strings';

import { DESCRIPTION_MAX, type Category } from './logic';

/** The top-level id of a category (itself when it has no parent), or null. */
export function topCategory(categories: Category[], id: number | null): number | null {
  const c = id === null ? undefined : categories.find((x) => x.id === id);
  return c ? (c.parentId ?? c.id) : null;
}

/** The bare example title for the chosen category's top level (DEC 129). */
export function categoryExample(categories: Category[], id: number | null): string {
  const top = topCategory(categories, id);
  const examples: Record<string, string> = sellCopy.titleExamples;
  return (top !== null ? examples[String(top)] : undefined) ?? examples.any ?? '';
}

/** "Example: IKEA Malm desk, white" for the chosen category's top level (DEC 129). */
export function titleExample(categories: Category[], id: number | null): string {
  return fill(sellCopy.titleExample, { example: categoryExample(categories, id) });
}

export type Starter = keyof typeof sellCopy.starters;
export const STARTERS = Object.keys(sellCopy.starters) as Starter[];

/** Adds a quick-detail line once, within the description limit (DEC 129). */
export function addStarter(description: string, starter: Starter): string {
  const line = sellCopy.starters[starter];
  if (description.includes(line)) return description;
  const next = description.trim() ? `${description.trimEnd()}\n${line}` : line;
  return next.length > DESCRIPTION_MAX ? description : next;
}
