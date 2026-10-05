// R11-INVITE-01 on the public site: /joined (W06) and /i/:code (W05).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SITE = process.env.SITE_URL ?? 'http://localhost:4321';

test('/joined renders without a campus, is noindex and passes axe', async ({ page }) => {
  const res = await page.goto(SITE + '/joined');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: "You're on the list" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get your friends to join' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What happens next' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('/joined ignores a malformed campus slug', async ({ page }) => {
  await page.goto(SITE + '/joined?campus=%3Cscript%3E');
  await expect(page.getByRole('heading', { level: 1, name: "You're on the list" })).toBeVisible();
});

test('/joined shows progress for a staging campus', async ({ page }) => {
  const slug = process.env.WAITLIST_CAMPUS_SLUG; // a waitlist campus on staging
  test.skip(!slug, 'set WAITLIST_CAMPUS_SLUG to a waitlist campus on staging');
  await page.goto(`${SITE}/joined?campus=${slug}`);
  await expect(
    page.getByRole('heading', { level: 1, name: /You're on the list for / }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
});

test('/i/{code} with an unknown code says the invite is not valid', async ({ page }) => {
  const res = await page.goto(`${SITE}/i/ZZZZ0000`);
  test.skip(
    res?.status() === 404 && !(await page.getByText(/invite link/).count()),
    'invite function not deployed here',
  );
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "This invite link isn't valid" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: 'Check my school' })).toHaveAttribute('href', '/');
});

test('/i/{code} shows the inviter and campus progress', async ({ page }) => {
  const code = process.env.INVITE_CODE; // an active staging user's invite code
  test.skip(!code, 'set INVITE_CODE to an active staging invite code');
  const res = await page.goto(`${SITE}/i/${code}`);
  expect(res?.status()).toBe(200);
  expect(res?.headers()['x-robots-tag']).toContain('noindex');
  expect(res?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  await expect(
    page.getByRole('heading', { level: 1, name: /invited you to OnlySwap at / }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    /invited you to OnlySwap$/,
  );
  const form = page.locator('form#waitlist');
  if (await form.count()) await expect(form).toHaveAttribute('data-invite', code!.toUpperCase());
});

test('robots.txt keeps /i/ and /joined out of search', async ({ request }) => {
  const robots = await (await request.get(SITE + '/robots.txt')).text();
  expect(robots).toContain('Disallow: /i/');
  expect(robots).toContain('Disallow: /joined');
});
