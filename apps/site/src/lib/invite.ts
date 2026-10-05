// /i/:code invite page (R11-INVITE-01, W05, API §8). Rendered by a Pages Function
// (functions/i/[code].ts); pure with fetch injected so test/invite.test.ts covers it.
// get_invite(code) gives the inviter's first name and campus progress, or null for
// an unknown code, a banned inviter or the demo campus. The page shows the first
// name only, store buttons (only when their URLs are set) and, for campuses that
// aren't open yet, the school email waitlist form (public/invite.js + Turnstile).

import { esc, html, page, rpc, type ShareEnv } from './share.ts';

export type InviteEnv = ShareEnv & {
  PUBLIC_APP_STORE_URL?: string;
  PUBLIC_PLAY_STORE_URL?: string;
  TURNSTILE_SITE_KEY?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};
type Fetch = typeof fetch;

export type Invite = {
  first_name: string;
  campus_name: string;
  campus_slug: string;
  campus_status: 'live' | 'waitlist';
  members: number;
  threshold: number;
};

/** Same shape the SQL accepts (^[A-Z0-9]{4,16}$ after upper-casing). */
export const INVITE_RE = /^[A-Za-z0-9]{4,16}$/;

const TURNSTILE = 'https://challenges.cloudflare.com';

/** The invite page's CSP: share-page rules plus Turnstile and the Supabase calls of the form. */
export function inviteCsp(env: InviteEnv): string {
  let supabase = '';
  try {
    supabase = env.SUPABASE_URL ? ` ${new URL(env.SUPABASE_URL).origin}` : '';
  } catch {
    supabase = '';
  }
  return [
    "default-src 'self'",
    "img-src 'self' https: data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' ${TURNSTILE}`,
    `frame-src ${TURNSTILE}`,
    `connect-src 'self'${supabase}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** "Open now at X" for live campuses, else "312 of 500 students at X" and the bar width. */
export function inviteProgress(inv: Invite): { text: string; percent: number } {
  if (inv.campus_status === 'live') return { text: `Open now at ${inv.campus_name}`, percent: 100 };
  const percent = Math.min(100, Math.round((inv.members / Math.max(inv.threshold, 1)) * 100));
  return { text: `${inv.members} of ${inv.threshold} students at ${inv.campus_name}`, percent };
}

/**
 * Store links, each only when its URL is set. Google Play links carry the install
 * referrer `invite={code}` (API §8) so the app can credit the inviter.
 */
export function storeLinks(
  env: InviteEnv,
  code: string,
): { appStore?: string; playStore?: string } {
  const appStore = env.PUBLIC_APP_STORE_URL || env.APP_STORE_URL || undefined;
  let playStore = env.PUBLIC_PLAY_STORE_URL || env.PLAY_STORE_URL || undefined;
  if (playStore) {
    try {
      const u = new URL(playStore);
      if (u.hostname === 'play.google.com') {
        u.searchParams.set('referrer', `invite=${code}`);
        playStore = u.toString();
      }
    } catch {
      // Not a full URL (e.g. a relative path); use it as is.
    }
  }
  return { appStore, playStore };
}

function storeRow(env: InviteEnv, code: string): string {
  const { appStore, playStore } = storeLinks(env, code);
  const links = [
    appStore ? `<a class="btn" href="${esc(appStore)}">Get it on the App Store</a>` : '',
    playStore ? `<a class="btn secondary" href="${esc(playStore)}">Get it on Google Play</a>` : '',
  ].filter(Boolean);
  if (!links.length)
    return '<p class="muted">The app is coming to the App Store and Google Play soon.</p>';
  return `<p class="row">${links.join(' ')}</p>`;
}

const HOW = `
<section aria-labelledby="how">
  <h2 id="how">How it works</h2>
  <ol class="steps">
    <li><strong>Swipe.</strong> <span class="muted">See what students at your school are selling.</span></li>
    <li><strong>Offer.</strong> <span class="muted">Chat opens once the seller accepts.</span></li>
    <li><strong>Meet and pay.</strong> <span class="muted">Pick a Meetup spot on campus, check the item, pay in person.</span></li>
  </ol>
  <p class="muted">Only verified students 18 and older can join.</p>
</section>`;

function waitlistForm(env: InviteEnv, inv: Invite, code: string): string {
  const siteKey = env.TURNSTILE_SITE_KEY || env.PUBLIC_TURNSTILE_SITE_KEY;
  const check = siteKey
    ? `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-response-field-name="turnstile"></div>
<script src="${TURNSTILE}/turnstile/v0/api.js" async defer></script>`
    : `<p class="meta">The form check isn't set up on this build.</p>`;
  return `
<section aria-labelledby="join" class="card">
  <h2 id="join">Join the waitlist</h2>
  <p class="muted">Enter your school email. We'll email you once when ${esc(inv.campus_name)} opens. Nothing else.</p>
  <form id="waitlist" novalidate data-url="${esc(env.SUPABASE_URL)}" data-key="${esc(env.SUPABASE_ANON_KEY)}" data-invite="${esc(code)}">
    <label>School email
      <input type="email" name="email" autocomplete="email" required />
    </label>
    ${check}
    <button type="submit">Join the waitlist</button>
    <p id="waitlist-msg" role="status"></p>
  </form>
</section>`;
}

function errorPage(status: number, heading: string, line: string, url: string): Response {
  return html(
    status,
    page({
      title: 'OnlySwap',
      description: '',
      url,
      scripts: [],
      body: `<h1>${esc(heading)}</h1><p class="muted">${esc(line)}</p>`,
    }),
    'no-store',
  );
}

/** /i/:code */
export async function renderInvite(
  code: string,
  env: InviteEnv,
  url: string,
  ip: string | null,
  f: Fetch = fetch,
): Promise<Response> {
  const invalid = () =>
    html(
      404,
      page({
        title: 'Invite not valid | OnlySwap',
        description: 'This invite link is not valid.',
        url,
        scripts: [],
        body: `<h1>This invite link isn't valid</h1>
<p class="muted">It may be mistyped or no longer active. You can still check if your school is on OnlySwap.</p>
<p><a class="btn" href="/">Check my school</a></p>`,
      }),
      'public, max-age=60',
    );
  if (!INVITE_RE.test(code)) return invalid();
  const key = code.toUpperCase();
  let res;
  try {
    res = await rpc(env, 'get_invite', { code: key }, ip, f);
  } catch {
    return errorPage(503, 'Try again in a minute', 'We couldn’t load this invite.', url);
  }
  if (!res.ok) {
    const message = String((res.body as { message?: string } | null)?.message ?? '');
    if (message.startsWith('RATE_LIMITED'))
      return errorPage(429, 'Too many requests', 'Wait a minute and try again.', url);
    return errorPage(503, 'Try again in a minute', 'We couldn’t load this invite.', url);
  }
  const inv = res.body as Invite | null;
  if (!inv || !inv.first_name || !inv.campus_name) return invalid();

  const live = inv.campus_status === 'live';
  const { text, percent } = inviteProgress(inv);
  const title = `${inv.first_name} invited you to OnlySwap`;
  const description = `Buy and sell with students at ${inv.campus_name}. Swipe, make an offer, meet on campus and pay in person.`;
  const body = `
<h1>${esc(inv.first_name)} invited you to OnlySwap at ${esc(inv.campus_name)}</h1>
<p class="muted">Buy and sell with students at your school. Meet at a Meetup spot on campus and pay in person.</p>
<div class="card">
  <p class="status">${esc(text)}</p>
  <div class="bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(text)}"><span style="width: ${percent}%"></span></div>
  <p class="muted">${
    live
      ? 'Get the app and sign in with your school email.'
      : `${esc(inv.campus_name)} opens when ${inv.threshold} students join. Get the app or join the waitlist to help it open.`
  }</p>
</div>
${storeRow(env, key)}
${HOW}
${live ? '' : waitlistForm(env, inv, key)}`;
  return html(
    200,
    page({
      title,
      description,
      url,
      body,
      scripts: live ? [] : [{ src: '/invite.js', module: true }],
    }),
    'public, max-age=120',
    inviteCsp(env),
  );
}
