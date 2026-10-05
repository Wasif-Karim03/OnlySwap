// E2E-A01/A02 on the admin console. A03 and A05 are R1.1; A04 is checked in the
// app by hand (TESTING §4).
import { expect, test, type Page } from '@playwright/test';
import { TOTP } from 'otpauth';

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5173';
const FUNCTIONS = process.env.FUNCTIONS_URL;
const SECRET = process.env.E2E_SECRET;

async function emailCode(page: Page, email: string) {
  await page.goto(ADMIN + '/');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  const res = await page.request.post(`${FUNCTIONS}/test-inbox`, {
    headers: { 'x-e2e-secret': SECRET! },
    data: { email },
  });
  const { code } = await res.json();
  await page.getByLabel('Code from your email').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the console is noindex and asks to sign in', async ({ page }) => {
  const res = await page.goto(ADMIN + '/');
  if (!ADMIN.startsWith('http://localhost'))
    expect(res?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.getByRole('heading', { name: 'OnlySwap admin' })).toBeVisible();
});

test('E2E-A01 admin login requires TOTP', async ({ page }) => {
  const email = process.env.ADMIN_EMAIL; // an e2e+ owner or moderator on staging
  test.skip(!FUNCTIONS || !SECRET || !email, 'set FUNCTIONS_URL, E2E_SECRET, ADMIN_EMAIL');
  await emailCode(page, email!);
  await expect(page.getByRole('heading', { name: 'Two-step check' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
});

test('E2E-A02 a moderator resolves a report; ban is not offered', async ({ page }) => {
  const email = process.env.MOD_EMAIL;
  const secret = process.env.MOD_TOTP_SECRET; // base32 secret of the moderator's enrolled factor
  test.skip(!FUNCTIONS || !SECRET || !email || !secret, 'set MOD_EMAIL and MOD_TOTP_SECRET');
  await emailCode(page, email!);
  await page.getByLabel('Code').fill(new TOTP({ secret: secret! }).generate());
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  const first = page.locator('tbody tr a').first();
  test.skip((await first.count()) === 0, 'no open reports on staging');
  await first.click();
  await expect(page.getByRole('button', { name: 'Ban' })).toHaveCount(0);
  page.once('dialog', (d) => void d.accept('e2e dismiss'));
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('Done')).toBeVisible();
});

async function signInWithTotp(page: Page, email: string, secret: string) {
  await emailCode(page, email);
  await page.getByLabel('Code').fill(new TOTP({ secret }).generate());
  await page.getByRole('button', { name: 'Verify' }).click();
}

test('R11-ADM-01/02 owner sees metrics, team, announcements and banned words', async ({ page }) => {
  const email = process.env.OWNER_EMAIL;
  const secret = process.env.OWNER_TOTP_SECRET;
  test.skip(!FUNCTIONS || !SECRET || !email || !secret, 'set OWNER_EMAIL and OWNER_TOTP_SECRET');
  await signInWithTotp(page, email!, secret!);

  await page.getByRole('link', { name: 'Metrics' }).click();
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible();
  await expect(page.getByLabel('Campus')).toBeVisible();
  await expect(page.getByText('Activation', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Team' }).click();
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  await expect(page.getByText('(you)')).toBeVisible();

  await page.getByRole('link', { name: 'Announcements' }).click();
  await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible();

  await page.getByRole('link', { name: 'Banned words' }).click();
  await expect(page.getByRole('heading', { name: 'Banned words' })).toBeVisible();
  await page.getByLabel('Match').selectOption('regex');
  await page.getByLabel('Term').fill('(unclosed');
  await expect(page.getByText(/regex doesn't compile/)).toBeVisible();
});

test('R11-ADM-02 a moderator has no Team link and reads banned words only', async ({ page }) => {
  const email = process.env.MOD_EMAIL;
  const secret = process.env.MOD_TOTP_SECRET;
  test.skip(!FUNCTIONS || !SECRET || !email || !secret, 'set MOD_EMAIL and MOD_TOTP_SECRET');
  await signInWithTotp(page, email!, secret!);
  await expect(page.getByRole('link', { name: 'Metrics' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Banned words' }).click();
  await expect(page.getByText('Only an owner can change this list.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});
