// Landing page behaviour (W01), ported 1:1 from the approved mock
// (design/website-mock.html). The only change from the mock: the school check
// calls the real waitlist and campus progress instead of a demo answer.
import {
  campusProgress,
  friendly,
  joinedHref,
  joinWaitlist,
  lookupSchool,
  progressLine,
  schoolEmailProblem,
  type CampusProgress,
} from '../lib/client';

const env = {
  url: import.meta.env.PUBLIC_SUPABASE_URL as string,
  key: import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string,
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* word-by-word headings */
document.querySelectorAll<HTMLElement>('.words').forEach((h) => {
  const words = (h.textContent ?? '').split(' ');
  h.textContent = '';
  words.forEach((w, i) => {
    const outer = document.createElement('span');
    outer.className = 'wd';
    const inner = document.createElement('span');
    inner.style.transitionDelay = `${i * 70}ms`;
    inner.textContent = w;
    outer.append(inner);
    h.append(outer, document.createTextNode(' '));
  });
});
const io = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.2 },
);
document.querySelectorAll('.rv,.words,.tg').forEach((el) => io.observe(el));
requestAnimationFrame(() => $('h1').classList.add('in'));

function show(screen: HTMLElement, i: number) {
  [...screen.children].forEach((im, k) => im.classList.toggle('on', k === i));
}

/* hero demo loop */
const hs = $('heroScreen');
const chips = [...document.querySelectorAll<HTMLButtonElement>('#chips button')];
const note = $('note');
const NOTES: [string, boolean, string, string][] = [
  ['i-pin', false, 'Mini fridge, $40', 'North Hall · 4 min walk'],
  ['i-tag', true, 'Swiped right', 'Make an offer on Mini fridge'],
  ['i-tag', false, 'Offer sent', '$35 for Mini fridge'],
  ['i-check', true, 'Offer accepted', 'Chat is open, plan the pickup'],
  ['i-pin', false, 'Meet at Rec Center, 4:30', 'Meetup spot · both confirmed'],
];
let hi = 0;
let ht: ReturnType<typeof setTimeout> | undefined;
function hero(i: number) {
  const prev = hi;
  hi = i;
  [...hs.children].forEach((im, k) => {
    im.classList.toggle('was', k === prev && k !== i);
    im.classList.toggle('on', k === i);
  });
  chips.forEach((c, k) => {
    c.classList.remove('on');
    void c.offsetWidth;
    c.classList.toggle('on', k === i);
  });
  note.classList.add('swap');
  setTimeout(() => {
    const [icon, light, title, sub] = NOTES[i]!;
    $('noteIcon').setAttribute('href', `#${icon}`);
    note.querySelector('.ic')!.classList.toggle('lt', light);
    $('noteT').textContent = title;
    $('noteS').textContent = sub;
    note.classList.remove('swap');
  }, 260);
  clearTimeout(ht);
  if (!reduce) ht = setTimeout(() => hero((hi + 1) % NOTES.length), 3000);
}
chips.forEach((c, k) => (c.onclick = () => hero(k)));
hero(0);

/* tilt and depth */
const stage = $('stage');
const hp = $('heroPhone');
const sats = [...document.querySelectorAll<HTMLElement>('.sat')];
if (!reduce && matchMedia('(pointer:fine)').matches) {
  const heroEl = document.querySelector<HTMLElement>('.hero')!;
  heroEl.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    hp.style.transform = `rotateY(${x * 12}deg) rotateX(${-y * 8}deg)`;
    sats.forEach((f) => {
      const d = Number(f.dataset.d);
      f.style.translate = `${x * d}px ${y * d}px`;
    });
  });
  heroEl.addEventListener('mouseleave', () => {
    hp.style.transform = '';
    sats.forEach((f) => (f.style.translate = ''));
  });
}

/* rotating word */
const rw = [...document.querySelectorAll<HTMLElement>('#rot>span')];
let ri = 0;
if (!reduce)
  setInterval(() => {
    const cur = rw[ri]!;
    cur.classList.remove('on');
    cur.classList.add('out');
    ri = (ri + 1) % rw.length;
    const nx = rw[ri]!;
    nx.classList.remove('out');
    void nx.offsetWidth;
    nx.classList.add('on');
    setTimeout(() => cur.classList.remove('out'), 700);
  }, 2400);

/* sticky story */
const story = $('how');
const steps = [...story.querySelectorAll('.step')];
const ss = $('storyScreen');
const rail = $('rail');
const badge = $('badge');
function onScroll() {
  if (innerWidth < 900) return;
  const r = story.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
  rail.style.height = `${p * 100}%`;
  const i = Math.min(2, Math.floor(p * 3));
  steps.forEach((s, k) => s.classList.toggle('on', k === i));
  show(ss, i);
  badge.classList.toggle('show', i === 1);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();
if (innerWidth < 900 && !reduce) {
  let si = 0;
  setInterval(() => {
    si = (si + 1) % 3;
    show(ss, si);
  }, 2600);
}

/* feature tabs auto-advance */
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')];
const fs = $('featScreen');
const PANELS = ['var(--lime100)', 'var(--peach)', 'var(--lilac)', 'var(--sky)'];
const fp = document.querySelector<HTMLElement>('.fphone')!;
let ti = 0;
let tt: ReturnType<typeof setTimeout> | undefined;
function tab(i: number) {
  ti = i;
  fp.style.setProperty('--panel', PANELS[i]!);
  tabs.forEach((t, k) => {
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.toggle('on', k === i);
    t.setAttribute('aria-pressed', String(k === i));
  });
  show(fs, i);
  clearTimeout(tt);
  if (!reduce) tt = setTimeout(() => tab((ti + 1) % tabs.length), 5000);
}
tabs.forEach((t, k) => (t.onclick = () => tab(k)));
tab(0);

/* hero email box hands off to the school check (which has the bot check) */
const heroForm = $<HTMLFormElement>('heroForm');
const checkForm = $<HTMLFormElement>('checkForm');
const checkInput = checkForm.querySelector('input')!;
heroForm.addEventListener('submit', (e) => {
  e.preventDefault();
  checkInput.value = (heroForm.querySelector('input')!.value || '').trim();
  $('check').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => checkInput.focus({ preventScroll: true }), reduce ? 0 : 700);
});

/* school check: real waitlist + campus progress */
const result = $('result');
const ring = $('ringfg');
const msg = $('checkMsg');
const RING = 201;
function showResult(title: string, text: string, percent: number) {
  result.classList.remove('show');
  ring.style.strokeDashoffset = String(RING);
  setTimeout(() => {
    $('rTitle').textContent = title;
    $('rText').textContent = text;
    result.classList.add('show');
    setTimeout(() => (ring.style.strokeDashoffset = String(RING * (1 - percent / 100))), 150);
  }, 200);
}
async function campusFor(email: string): Promise<CampusProgress | null> {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  const school = domain ? await lookupSchool(env, domain).catch(() => null) : null;
  if (!school) return null;
  const rows = await campusProgress(env).catch(() => [] as CampusProgress[]);
  return rows.find((c) => c.name === school.name) ?? null;
}
checkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = checkInput.value.trim();
  const problem = schoolEmailProblem(email);
  msg.className = 'small error';
  if (problem) {
    msg.textContent = problem;
    return;
  }
  if (!env.url || !env.key) {
    msg.textContent = "We couldn't reach OnlySwap right now. Try again in a minute.";
    return;
  }
  const button = checkForm.querySelector('button')!;
  button.disabled = true;
  msg.className = 'small';
  msg.textContent = 'Checking…';
  try {
    const token =
      document.querySelector<HTMLInputElement>('#check [name="turnstile"]')?.value ?? '';
    await joinWaitlist(env, email, token);
    const campus = await campusFor(email);
    msg.textContent = 'School emails only. We email you once when your school opens. Nothing else.';
    if (campus && campus.status === 'live') {
      showResult(
        `${campus.name} is open`,
        'Get the app and sign in with your school email to start swapping.',
        100,
      );
    } else if (campus) {
      const { text, percent } = progressLine(campus);
      const left = Math.max(campus.threshold - campus.members, 0);
      showResult(
        "You're on the list",
        `${text}. ${left > 0 ? `${left} more to open.` : 'Opening soon.'} We'll email you once when it opens.`,
        Math.max(percent, 4),
      );
      $<HTMLAnchorElement>('rLink').href = joinedHref({ kind: 'waitlist', slug: campus.slug });
      $('rLink').hidden = false;
    } else {
      showResult(
        "You're on the list",
        "Your school isn't on OnlySwap yet. You're counted, and we'll email you once when it opens.",
        4,
      );
    }
    checkForm.reset();
  } catch (err) {
    msg.className = 'small error';
    msg.textContent = friendly(err);
  } finally {
    button.disabled = false;
    (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
  }
});
