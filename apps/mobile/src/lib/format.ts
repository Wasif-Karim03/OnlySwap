/**
 * Fills `{name}` placeholders in a copy template from `strings/en.ts`.
 * Unknown placeholders are left as they are so a missing value is visible in QA.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
