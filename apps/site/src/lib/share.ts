// Server-rendered share pages for Cloudflare Pages Functions (P13-WEB-06, API §8):
//   /l/:id     listing card with OG meta and a blurred sign-in wall
//   /m/:token  meetup status for a friend, refreshes every 60 s
// Pure functions (fetch injected) so they're tested in node (test/share.test.ts).

export type ShareEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  MEDIA_URL?: string;
  APP_STORE_URL?: string;
  /** Numeric App Store id; turns on Safari's app banner, since a link to the same site never opens the app on iOS. */
  APPLE_APP_ID?: string;
  PLAY_STORE_URL?: string;
};
type Fetch = typeof fetch;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TOKEN_RE = /^[0-9a-f]{22}$/i;

export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function money(cents: number, kind?: string): string {
  if (kind === 'free' || cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

async function rpc(
  env: ShareEnv,
  fn: string,
  args: Record<string, unknown>,
  ip: string | null,
  f: Fetch,
) {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_ANON_KEY ?? '',
    authorization: `Bearer ${env.SUPABASE_ANON_KEY ?? ''}`,
    'content-type': 'application/json',
  };
  // The visitor's address first, so the per-IP limits in SQL count visitors, not this function.
  if (ip) headers['x-forwarded-for'] = ip;
  const res = await f(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  return { ok: res.ok, status: res.status, body };
}

function page(opts: {
  appBanner?: string;
  title: string;
  description: string;
  body: string;
  image?: string;
  url: string;
  refresh?: number;
}): string {
  const { title, description, body, image, url, refresh, appBanner } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
${refresh ? `<meta http-equiv="refresh" content="${refresh}" />` : ''}
${appBanner ? `<meta name="apple-itunes-app" content="${esc(appBanner)}" />` : ''}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(url)}" />
${image ? `<meta property="og:image" content="${esc(image)}" />\n<meta name="twitter:card" content="summary_large_image" />` : '<meta name="twitter:card" content="summary" />'}
<link rel="stylesheet" href="/share.css" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</head>
<body>
<main>
<a class="brand" href="/">OnlySwap</a>
${body}
</main>
<script src="/localtime.js" defer></script>
</body>
</html>`;
}

function html(status: number, content: string, cache: string): Response {
  return new Response(content, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cache,
      'x-robots-tag': 'noindex',
      // _headers doesn't cover Functions responses, so the security headers go here.
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function storeButtons(env: ShareEnv): string {
  return `<p class="row"><a class="btn" href="${esc(env.APP_STORE_URL || '/download')}">App Store</a> <a class="btn secondary" href="${esc(env.PLAY_STORE_URL || '/download')}">Google Play</a></p>`;
}

export type ListingCard = {
  title: string;
  price_cents: number;
  kind?: string;
  campus_name: string;
  share_image_path: string | null;
};

/** /l/:id */
export async function renderListing(
  id: string,
  env: ShareEnv,
  url: string,
  ip: string | null,
  f: Fetch = fetch,
): Promise<Response> {
  const gone = (status: number) =>
    html(
      status,
      page({
        title: 'Listing not available | OnlySwap',
        description: 'This listing is no longer available.',
        url,
        body: `<h1>This listing isn't available</h1><p class="muted">It may have sold or been taken down. See what else students are selling in the app.</p>${storeButtons(env)}`,
      }),
      'public, max-age=60',
    );
  if (!UUID_RE.test(id)) return gone(404);
  let res;
  try {
    res = await rpc(env, 'get_listing_public_card', { id }, ip, f);
  } catch {
    return html(
      503,
      page({ title: 'OnlySwap', description: '', url, body: '<h1>Try again in a minute</h1>' }),
      'no-store',
    );
  }
  if (
    !res.ok &&
    String((res.body as { message?: string } | null)?.message ?? '').startsWith('RATE_LIMITED')
  ) {
    return html(
      429,
      page({
        title: 'OnlySwap',
        description: '',
        url,
        body: '<h1>Too many requests</h1><p class="muted">Wait a minute and try again.</p>',
      }),
      'no-store',
    );
  }
  const card = res.ok ? (res.body as ListingCard | null) : null;
  if (!card) return gone(404);
  const price = money(card.price_cents, card.kind);
  const image =
    card.share_image_path && env.MEDIA_URL
      ? `${env.MEDIA_URL.replace(/\/$/, '')}/${card.share_image_path}`
      : undefined;
  const title = `${card.title} · ${price}`;
  const description = `For sale to students at ${card.campus_name} on OnlySwap. Verified students can see details and make an offer in the app.`;
  const body = `
<div class="wall">
  ${image ? `<img class="blur" src="${esc(image)}" alt="" width="600" height="600" />` : ''}
  <div class="over">
    <h1>${esc(card.title)}</h1>
    <p class="price">${esc(price)}</p>
    <p class="muted">At ${esc(card.campus_name)}. Only verified students can see the details and make an offer.</p>
    <p><a class="btn" href="${esc(url)}">Open in OnlySwap</a></p>
    <p class="muted">Don't have the app yet?</p>
    ${storeButtons(env)}
  </div>
</div>`;
  const appBanner =
    env.APPLE_APP_ID && /^\d+$/.test(env.APPLE_APP_ID)
      ? `app-id=${env.APPLE_APP_ID}, app-argument=${url}`
      : undefined;
  return html(
    200,
    page({ title, description, image, url, body, appBanner }),
    'public, max-age=300',
  );
}

export type MeetupShare = {
  a_first: string | null;
  b_first: string | null;
  spot_name: string | null;
  spot_lat: number | null;
  spot_lng: number | null;
  starts_at: string;
  a_here: boolean;
  b_here: boolean;
  late_minutes: number | null;
  status: 'proposed' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
};

export function meetupStatusLine(m: MeetupShare): string {
  const a = m.a_first ?? 'Your friend';
  const b = m.b_first ?? 'the other student';
  switch (m.status) {
    case 'cancelled':
      return 'This meetup was cancelled.';
    case 'completed':
      return 'This meetup is done.';
    case 'no_show':
      return `${b} didn't show up.`;
    case 'proposed':
      return `${a} proposed this meetup. ${b} hasn't confirmed yet.`;
    default:
      if (m.a_here && m.b_here) return `${a} and ${b} are both there.`;
      if (m.a_here) return `${a} is there. ${b} hasn't checked in yet.`;
      if (m.b_here) return `${b} is there. ${a} hasn't checked in yet.`;
      if (m.late_minutes) return `Running about ${m.late_minutes} minutes late.`;
      return 'Confirmed. Nobody has checked in yet.';
  }
}

/** /m/:token */
export async function renderMeetup(
  token: string,
  env: ShareEnv,
  url: string,
  ip: string | null,
  f: Fetch = fetch,
): Promise<Response> {
  const expired = () =>
    html(
      404,
      page({
        title: 'Meetup link expired | OnlySwap',
        description: 'This meetup link has expired.',
        url,
        body: '<h1>This meetup link has expired</h1><p class="muted">Links work until a few hours after the meetup. Ask your friend for a new one.</p>',
      }),
      'no-store',
    );
  if (!TOKEN_RE.test(token)) return expired();
  let res;
  try {
    res = await rpc(env, 'get_meetup_share', { token }, ip, f);
  } catch {
    return html(
      503,
      page({ title: 'OnlySwap', description: '', url, body: '<h1>Try again in a minute</h1>' }),
      'no-store',
    );
  }
  if (!res.ok) {
    const code = String((res.body as { message?: string } | null)?.message ?? '');
    if (code.startsWith('RATE_LIMITED')) {
      return html(
        429,
        page({
          title: 'OnlySwap',
          description: '',
          url,
          body: '<h1>Too many requests</h1><p class="muted">Wait a minute and try again.</p>',
        }),
        'no-store',
      );
    }
    return expired();
  }
  const m = res.body as MeetupShare;
  const who = `${m.a_first ?? 'Your friend'} is meeting ${m.b_first ?? 'another student'}`;
  const maps =
    m.spot_lat !== null && m.spot_lng !== null
      ? `<p><a class="btn secondary" href="https://maps.google.com/?q=${encodeURIComponent(`${m.spot_lat},${m.spot_lng}`)}">Directions</a></p>`
      : '';
  const body = `
<h1>${esc(who)}</h1>
<div class="card">
  <p class="status" role="status">${esc(meetupStatusLine(m))}</p>
  <p><strong>Where:</strong> ${esc(m.spot_name ?? 'A spot they agreed on')}</p>
  <p><strong>When:</strong> <time datetime="${esc(m.starts_at)}">${esc(new Date(m.starts_at).toUTCString())}</time></p>
  ${maps}
</div>
<p class="muted">This page refreshes every minute. It shows first names only.</p>
<p><strong>If you can't reach them and you're worried, call 911.</strong></p>`;
  return html(
    200,
    page({ title: 'Meetup status | OnlySwap', description: who, url, body, refresh: 60 }),
    'no-store',
  );
}

export function clientIp(headers: Headers): string | null {
  return (
    headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  );
}
