// Error reporting for Edge Functions (P14-MON-01). A small Sentry envelope sender
// instead of the full SDK: one fetch per unhandled error, no request bodies, no
// headers, no user data. Off unless the SENTRY_DSN function secret is set.

export type Dsn = { host: string; projectId: string; publicKey: string; protocol: string };

export function parseDsn(dsn: string | undefined | null): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !/^\d+$/.test(projectId)) return null;
    return {
      host: u.host,
      projectId,
      publicKey: u.username,
      protocol: u.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

export function envelopeUrl(d: Dsn): string {
  return `${d.protocol}://${d.host}/api/${d.projectId}/envelope/?sentry_key=${d.publicKey}&sentry_version=7`;
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function buildEnvelope(
  error: unknown,
  ctx: { fn: string; environment: string; eventId: string; now: Date },
): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const clean = (s: string | undefined) => (s ?? '').replace(EMAIL, '[email]').slice(0, 2000);
  const event = {
    event_id: ctx.eventId,
    timestamp: ctx.now.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: ctx.environment,
    server_name: ctx.fn,
    tags: { function: ctx.fn },
    exception: {
      values: [
        {
          type: err.name,
          value: clean(err.message),
          stacktrace: { frames: frames(clean(err.stack)) },
        },
      ],
    },
  };
  const header = { event_id: ctx.eventId, sent_at: ctx.now.toISOString() };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
}

function frames(stack: string): { function?: string; filename?: string; lineno?: number }[] {
  return stack
    .split('\n')
    .slice(1, 30)
    .map((line) => {
      const m = /at (?:(.+?) \()?(.+?):(\d+):\d+\)?$/.exec(line.trim());
      return m
        ? { function: m[1], filename: m[2], lineno: Number(m[3]) }
        : { function: line.trim() };
    })
    .reverse();
}

export async function report(
  error: unknown,
  opts: {
    dsn: string | undefined;
    fn: string;
    environment: string;
    fetch?: typeof fetch;
    now?: Date;
  },
): Promise<boolean> {
  const d = parseDsn(opts.dsn);
  if (!d) return false;
  const eventId = crypto.randomUUID().replace(/-/g, '');
  try {
    const res = await (opts.fetch ?? fetch)(envelopeUrl(d), {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: buildEnvelope(error, {
        fn: opts.fn,
        environment: opts.environment,
        eventId,
        now: opts.now ?? new Date(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wraps a Deno.serve handler: an unhandled error is reported and answered with a
 * plain 500 (no stack or detail in the response).
 */
export function withMonitoring(
  fn: string,
  handler: (req: Request) => Promise<Response> | Response,
  env: { get(key: string): string | undefined },
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error(
        JSON.stringify({ event: `${fn}.unhandled`, name: (error as Error)?.name ?? 'Error' }),
      );
      await report(error, {
        dsn: env.get('SENTRY_DSN'),
        fn,
        environment: env.get('APP_ENV') ?? 'unknown',
      });
      return new Response('{"error":"UNKNOWN"}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  };
}
