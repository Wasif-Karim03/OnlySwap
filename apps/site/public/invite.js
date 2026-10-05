// Waitlist form on /i/:code (R11-INVITE-01). The page is rendered by a Pages
// Function, so this ships as a plain file (CSP script-src 'self'). It mirrors
// schoolEmailProblem, joinWaitlist and joinedTarget in src/lib/client.ts; the
// tests in test/invite.test.ts keep the two in step. Config comes from the form's
// data attributes: Supabase URL, publishable key and the invite code.

export function schoolEmailProblem(email) {
  const e = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'Enter your school email.';
  if (!e.endsWith('.edu')) return 'Use your school email. It ends in .edu.';
  return null;
}

export function friendly(message) {
  const m = String(message);
  if (m.startsWith('RATE_LIMITED')) return 'Too many tries. Wait a few minutes and try again.';
  if (m.includes('turnstile'))
    return "We couldn't check you're a person. Reload the page and try again.";
  if (m.startsWith('INVALID:email')) return 'Check the email address.';
  return 'Something went wrong. Try again in a minute.';
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

async function call(env, path, body, f) {
  const res = await f(`${env.url}${path}`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      authorization: `Bearer ${env.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? data?.message ?? `HTTP_${res.status}`);
  return data;
}

/** Joins the waitlist with the invite code, then works out where to go: '/joined?campus=slug', '/joined' or 'live'. */
export async function join(env, email, token, invite, f = fetch) {
  await call(
    env,
    '/functions/v1/waitlist-request',
    { email: email.trim().toLowerCase(), turnstile_token: token, invite_code: invite },
    f,
  );
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  try {
    const school = await call(env, '/rest/v1/rpc/lookup_school', { domain }, f);
    if (!school) return '/joined';
    const rows = await call(env, '/rest/v1/rpc/public_campus_progress', {}, f);
    const row = (rows ?? []).find((c) => c.name === school.name);
    if (!row) return '/joined';
    if (row.status === 'live') return 'live';
    return SLUG_RE.test(row.slug) ? `/joined?campus=${encodeURIComponent(row.slug)}` : '/joined';
  } catch {
    return '/joined';
  }
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('waitlist');
  const msg = document.getElementById('waitlist-msg');
  if (form && msg) {
    const env = { url: form.dataset.url ?? '', key: form.dataset.key ?? '' };
    const invite = form.dataset.invite ?? '';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const email = String(data.get('email') ?? '');
      const problem = schoolEmailProblem(email);
      msg.className = 'error';
      if (problem) {
        msg.textContent = problem;
        return;
      }
      const button = form.querySelector('button');
      if (button) button.disabled = true;
      try {
        const next = await join(env, email, String(data.get('turnstile') ?? ''), invite);
        if (next === 'live') {
          msg.className = 'ok';
          msg.textContent =
            'Your school is open now. Get the app and sign in with your school email.';
          form.reset();
        } else {
          window.location.assign(next);
        }
      } catch (err) {
        msg.textContent = friendly(err instanceof Error ? err.message : err);
      } finally {
        if (button) button.disabled = false;
      }
    });
  }
}
