// Weekly free-tier usage report (P14-OPS-03, ARCHITECTURE §6).
//
//   node --experimental-strip-types scripts/usage-report.ts metrics.json
//
// `usage-report.yml` gathers the numbers it can read for free (database size and
// counts through psql, R2 bucket sizes through the S3 API) into metrics.json.
// This script compares them with the §6 limits, prints a markdown report (the
// workflow puts it in the job summary) and exits 1 when anything is at or past
// its alert line, so GitHub emails the owner. Figures only a dashboard shows
// (egress, Realtime, Workers, EAS, PostHog, Sentry, Actions minutes) are listed
// as a checklist.

export type Metrics = {
  db_bytes?: number;
  mau?: number;
  emails_24h?: number;
  pushes_7d?: number;
  r2_media_bytes?: number;
  r2_private_bytes?: number;
  r2_backups_bytes?: number;
};

type Row = {
  name: string;
  value: number | undefined;
  limit: number;
  alertAt: number;
  unit: 'bytes' | 'count';
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export function rows(m: Metrics): Row[] {
  const r2 =
    m.r2_media_bytes === undefined &&
    m.r2_private_bytes === undefined &&
    m.r2_backups_bytes === undefined
      ? undefined
      : (m.r2_media_bytes ?? 0) + (m.r2_private_bytes ?? 0) + (m.r2_backups_bytes ?? 0);
  return [
    {
      name: 'Supabase database',
      value: m.db_bytes,
      limit: 500 * MB,
      alertAt: 350 * MB,
      unit: 'bytes',
    },
    {
      name: 'Monthly active students (Auth MAU 50k)',
      value: m.mau,
      limit: 50_000,
      alertAt: 35_000,
      unit: 'count',
    },
    {
      name: 'Emails in the last 24 h (Gmail ~500/day)',
      value: m.emails_24h,
      limit: 500,
      alertAt: 350,
      unit: 'count',
    },
    { name: 'R2 storage (all buckets)', value: r2, limit: 10 * GB, alertAt: 7 * GB, unit: 'bytes' },
  ];
}

export function fmt(v: number | undefined, unit: Row['unit']): string {
  if (v === undefined) return 'not measured';
  if (unit === 'count') return v.toLocaleString('en-US');
  if (v >= GB) return `${(v / GB).toFixed(2)} GB`;
  return `${(v / MB).toFixed(1)} MB`;
}

export function report(m: Metrics, today = new Date()): { markdown: string; alerts: string[] } {
  const alerts: string[] = [];
  const lines = [
    `# OnlySwap free-tier usage, ${today.toISOString().slice(0, 10)}`,
    '',
    '| Resource | Now | Limit | Alert at | Status |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows(m)) {
    const over = r.value !== undefined && r.value >= r.alertAt;
    if (over) alerts.push(r.name);
    const pct = r.value === undefined ? '' : ` (${Math.round((r.value / r.limit) * 100)}%)`;
    lines.push(
      `| ${r.name} | ${fmt(r.value, r.unit)}${pct} | ${fmt(r.limit, r.unit)} | ${fmt(r.alertAt, r.unit)} | ${over ? 'ALERT' : r.value === undefined ? 'check' : 'ok'} |`,
    );
  }
  if (m.pushes_7d !== undefined)
    lines.push('', `Pushes sent in the last 7 days: ${m.pushes_7d.toLocaleString('en-US')}.`);
  lines.push(
    '',
    '## Check by hand (dashboards only)',
    '',
    '- Supabase: egress (alert 3.5 GB of 5 GB), Realtime peak connections (150 of 200), Edge Function calls (300k of 500k)',
    '- Cloudflare: Worker requests (70k/day of 100k), R2 Class A and B operations',
    '- EAS: builds this month (alert at 10 of 15 per platform), Update MAU',
    '- PostHog: events this month (600k of 1M)',
    '- Sentry: errors this month (3.5k of 5k)',
    '- GitHub Actions: minutes this month (1,500 of 2,000)',
  );
  if (alerts.length)
    lines.push(
      '',
      `**Over the alert line:** ${alerts.join(', ')}. See ARCHITECTURE §6 for what to change.`,
    );
  return { markdown: lines.join('\n') + '\n', alerts };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const file = process.argv[2];
  if (!file) {
    console.error('usage: usage-report.ts metrics.json');
    process.exit(2);
  }
  const metrics = JSON.parse(readFileSync(file, 'utf8')) as Metrics;
  const { markdown, alerts } = report(metrics);
  process.stdout.write(markdown);
  process.exit(alerts.length ? 1 : 0);
}
