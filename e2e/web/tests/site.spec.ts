// E2E-W01..W07 on the public site.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SITE = process.env.SITE_URL ?? 'http://localhost:4321';
const LEGAL = [
  '/terms',
  '/privacy',
  '/rules',
  '/banned-items',
  '/safety',
  '/cookies',
  '/child-safety',
];

test('E2E-W01 landing loads and passes axe', async ({ page }) => {
  await page.goto(SITE + '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('E2E-W06 legal pages return 200 and show a version', async ({ page }) => {
  for (const path of LEGAL) {
    const res = await page.goto(SITE + path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText(/Version 20\d\d-\d\d/)).toBeVisible();
  }
});

test('E2E-W08 security headers and robots', async ({ request }) => {
  const res = await request.get(SITE + '/');
  if (!SITE.startsWith('http://localhost')) {
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  }
  const robots = await (await request.get(SITE + '/robots.txt')).text();
  expect(robots).toContain('Disallow: /l/');
  expect(robots).toContain('Sitemap:');
});

test('E2E-W07 AASA and assetlinks are valid JSON', async ({ request }) => {
  const aasa = await request.get(SITE + '/.well-known/apple-app-site-association');
  expect(aasa.status()).toBe(200);
  const a = await aasa.json();
  expect(a.applinks.details[0].components.some((c: { '/': string }) => c['/'] === '/l/*')).toBe(
    true,
  );
  const links = await request.get(SITE + '/.well-known/assetlinks.json');
  expect(links.status()).toBe(200);
  expect(Array.isArray(await links.json())).toBe(true);
});

test('E2E-W02 /l/{id} has OG meta and a blurred wall', async ({ page }) => {
  test.skip(!process.env.LISTING_ID, 'set LISTING_ID to a shared, active staging listing');
  await page.goto(`${SITE}/l/${process.env.LISTING_ID}`);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /·/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /share\//);
  await expect(page.locator('img.blur')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('E2E-W03 an expired or unknown meetup token shows the expired page', async ({ page }) => {
  const res = await page.goto(`${SITE}/m/00000000000000000000aa`);
  test.skip(
    res?.status() === 404 && !(await page.getByText(/expired/).count()),
    'share functions not deployed here',
  );
  await expect(page.getByRole('heading', { name: /expired/ })).toBeVisible();
});

test('E2E-W05 help form sends (Turnstile test keys)', async ({ page }) => {
  test.skip(!process.env.HELP_E2E, 'needs Turnstile test keys on this deployment (HELP_E2E=1)');
  await page.goto(SITE + '/help');
  await page.getByLabel('Your email').fill('e2e+help@e2e.onlyswap.test');
  await page.getByLabel('What happened').fill('Playwright check of the help form.');
  await page.waitForTimeout(2000); // test keys pass immediately
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Sent\./)).toBeVisible();
});

test('E2E-W04 /delete deletes a test user', async ({ page, request }) => {
  const functions = process.env.FUNCTIONS_URL;
  const secret = process.env.E2E_SECRET;
  const email = process.env.DELETE_EMAIL; // an e2e+ user created by a Maestro run
  test.skip(!functions || !secret || !email, 'set FUNCTIONS_URL, E2E_SECRET and DELETE_EMAIL');
  await page.goto(SITE + '/delete');
  await page.getByLabel('Your school email').fill(email!);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByText(/We sent a code/)).toBeVisible();
  const res = await request.post(`${functions}/test-inbox`, {
    headers: { 'x-e2e-secret': secret! },
    data: { email },
  });
  const { code } = await res.json();
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText(/Your account is deleted/)).toBeVisible();
});

test('404 page for unknown paths', async ({ page }) => {
  const res = await page.goto(SITE + '/no-such-page-e2e');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /couldn't find/ })).toBeVisible();
});
