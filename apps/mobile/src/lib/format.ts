import { intlLocale } from '@/strings';

/**
 * Fills `{name}` placeholders in a copy template from `@/strings`.
 * Unknown placeholders are left as they are so a missing value is visible in QA.
 * A value that ends in "." before a template "." keeps one ("Riley M.", QA-M4).
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}(\.?)/g, (match, key: string, dot: string) => {
    if (!(key in values)) return match;
    const value = String(values[key]);
    return dot && value.endsWith('.') ? value : value + dot;
  });
}

/**
 * "$35", "$1,234" or "$12.50" in the active locale (P17-FEAT-03). Money is
 * always US dollars; en-US and es-US both group with "," and use "." for cents.
 */
export function money(cents: number, tag: string = intlLocale): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toLocaleString(tag) : dollars.toFixed(2)}`;
}

/** "4:30 PM" (en) or "4:30 p.m." (es) in the device zone, or `timeZone` when given. */
export function formatTime(date: Date, timeZone?: string, tag: string = intlLocale): string {
  return new Intl.DateTimeFormat(tag, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
    .format(date)
    .replace(/\s/g, '\u00a0'); // "12:42 AM" never splits across lines (QA-L8)
}

/** Any date pattern in the active locale, e.g. `{ month: 'short', day: 'numeric' }`. */
export function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  tag: string = intlLocale,
): string {
  return new Intl.DateTimeFormat(tag, options).format(date);
}
