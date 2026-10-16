// Student web app end to end against staging (F36, DEC 85; WEB-E2E).
// Two students on the staging-only E2E campus (e2e.onlyswap.test) do the
// whole swap in browsers: sign up, sell, offer, accept, chat, meetup, sold,
// rating. Codes come from the staging-only test-inbox function.
//   WEBAPP_URL=http://localhost:8099 FUNCTIONS_URL=https://<staging>.supabase.co/functions/v1 \
//   E2E_SECRET=... [WEBAPP_PHONE=1] pnpm --filter e2e-web e2e webapp
import { fileURLToPath } from 'node:url';

import { expect, test, type Browser, type Page } from '@playwright/test';

const FIXTURES = fileURLToPath(new URL('../../../apps/mobile/.maestro/fixtures/', import.meta.url));

const APP = process.env.WEBAPP_URL;
const FUNCTIONS = process.env.FUNCTIONS_URL;
const SECRET = process.env.E2E_SECRET;
const RUN = Date.now().toString(36);
// WEBAPP_PHONE=1 runs the same flow in a phone-sized touch browser.
const PHONE = process.env.WEBAPP_PHONE === '1';

test.describe.configure({ mode: 'serial' });
test.skip(!APP || !FUNCTIONS || !SECRET, 'set WEBAPP_URL, FUNCTIONS_URL and E2E_SECRET');

const errors: string[] = [];

async function newStudent(browser: Browser, tag: string) {
  const context = await browser.newContext(
    PHONE
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 860 } },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400)
      errors.push(`[${tag}] ${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`);
  });
  return { page, email: `e2e-${tag}${RUN}@e2e.onlyswap.test` };
}

/** When each address last got a code: Auth allows one per 60 s (DEC 105). */
const lastCode = new Map<string, number>();

async function otp(email: string): Promise<string> {
  lastCode.set(email, Date.now());
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${FUNCTIONS}/test-inbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-e2e-secret': SECRET! },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return ((await res.json()) as { code: string }).code;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('no code from test-inbox');
}

async function signUp(page: Page, email: string, first: string) {
  await page.goto(APP!);
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('email-input').fill(email);
  await expect(page.getByTestId('email-school')).toBeVisible();
  await page.getByTestId('email-send').click();
  await expect(page.getByTestId('screen-verify')).toBeVisible();
  await page.getByTestId('otp-input').fill(await otp(email));
  await expect(page.getByTestId('screen-age')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('textbox', { name: 'Birthday' }).fill('2004-05-01');
  await page.getByTestId('age-continue').click();
  await expect(page.getByTestId('screen-profile-setup')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('profile-first').fill(first);
  await page.getByTestId('profile-last').fill('E');
  await page.getByText('Junior', { exact: true }).click();
  await page.getByTestId('profile-continue').click();
  await page.getByTestId('rules-checkbox').click();
  await page.getByTestId('rules-agree').click();
  const notifications = page.getByTestId('notifications-not-now');
  const discover = page.getByTestId('screen-discover');
  await expect(notifications.or(discover)).toBeVisible({ timeout: 20_000 });
  if (await notifications.isVisible()) await notifications.click();
  await expect(discover).toBeVisible({ timeout: 20_000 });
}

let seller: { page: Page; email: string };
let buyer: { page: Page; email: string };

test('WEB-E2E-01 two students sign up on the web', async ({ browser }) => {
  seller = await newStudent(browser, 's');
  buyer = await newStudent(browser, 'b');
  await signUp(seller.page, seller.email, 'Sam');
  await signUp(buyer.page, buyer.email, 'Bea');
});

const TITLE = `Web mini fridge ${RUN}`;

test('WEB-E2E-02 the seller lists an item with photos', async () => {
  const page = seller.page;
  await page
    .getByRole('link', { name: 'Sell' })
    .or(page.getByRole('tab', { name: 'Sell' }))
    .first()
    .click();
  await expect(page.getByTestId('screen-sell-photos')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('sell-add-library').click();
  await (await chooser).setFiles(['item1.jpg', 'item2.jpg'].map((f) => FIXTURES + f));
  await expect(page.getByTestId('sell-photos-next')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('sell-photos-next').click();
  await page.getByTestId('sell-title').fill(TITLE);
  await page.locator('[data-testid^="sell-category-"]').first().click();
  await page.getByTestId('sell-price').fill('45');
  await page.getByTestId('sell-details-next').click();
  await expect(page.getByTestId('screen-sell-meetup')).toBeVisible();
  await page.locator('[data-testid^="sell-spot-"]').first().click();
  await page.getByTestId('sell-allowed').click();
  await page.getByTestId('sell-post').click();
  await expect(page.getByTestId('screen-sell-posted')).toBeVisible({ timeout: 30_000 });
});

const inboxRow = (page: Page) =>
  page
    .getByTestId('inbox-list-pane')
    .or(page.getByTestId('screen-inbox'))
    .first()
    .getByRole('button', { name: new RegExp(TITLE) })
    .first();

/** Detail screens hide the tab bar and sidebar, so step back until they show. */
async function go(page: Page, tab: string) {
  const nav = page
    .getByRole('link', { name: tab })
    .or(page.getByRole('tab', { name: tab }))
    .first();
  for (let i = 0; i < 4 && !(await nav.isVisible().catch(() => false)); i++) {
    const back = page.getByRole('button', { name: /^(Back|Cancel|Close)$/ }).first();
    if (!(await back.isVisible().catch(() => false))) break;
    await back.click();
    await page.waitForTimeout(400);
  }
  await nav.click();
}

test('WEB-E2E-03 the buyer finds it on Discover and makes an offer', async () => {
  const page = buyer.page;
  await page.reload();
  await expect(page.getByTestId('screen-discover')).toBeVisible({ timeout: 20_000 });
  const coach = page.getByTestId('discover-coach');
  if (await coach.isVisible().catch(() => false)) await coach.click();
  await page.getByText(TITLE).first().click();
  await expect(page.getByTestId('screen-listing')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('listing-offer').click();
  await expect(page.getByTestId('screen-offer')).toBeVisible();
  await page.getByTestId('offer-send').click();
  await expect(page.getByTestId('offer-sent')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Keep swiping' }).click();
  await expect(page.getByTestId('offer-sent')).toBeHidden();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('screen-discover')).toBeVisible();
});

test('WEB-E2E-04 the seller accepts and both chat', async () => {
  const page = seller.page;
  await go(page, 'Inbox');
  await inboxRow(page).click();
  await page.getByTestId('offer-accept').click();
  await expect(page.getByTestId('screen-chat').or(page.getByTestId('offer-open-chat'))).toBeVisible(
    { timeout: 20_000 },
  );
  if (await page.getByTestId('offer-open-chat').isVisible())
    await page.getByTestId('offer-open-chat').click();
  await expect(page.getByTestId('screen-chat')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('chat-input').fill('Hi Bea, see you at the library?');
  await page.getByTestId('chat-send').click();
  await expect(
    page.getByTestId('screen-chat').getByText('Hi Bea, see you at the library?'),
  ).toBeVisible();

  const b = buyer.page;
  await go(b, 'Inbox');
  await inboxRow(b).click();
  await expect(b.getByTestId('screen-chat')).toBeVisible({ timeout: 20_000 });
  await expect(
    b.getByTestId('screen-chat').getByText('Hi Bea, see you at the library?'),
  ).toBeVisible({ timeout: 20_000 });
  await b.getByTestId('chat-input').fill('Sounds good');
  await b.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('screen-chat').getByText('Sounds good')).toBeVisible({
    timeout: 20_000,
  });
});

test('WEB-E2E-05 they plan a meetup at a Meetup spot', async () => {
  const page = seller.page;
  await page.getByTestId('screen-chat').getByRole('button', { name: 'Plan meetup' }).click();
  await expect(page.getByTestId('screen-plan-meetup')).toBeVisible();
  await page.getByRole('radio', { name: /E2E Library lobby/ }).click();
  const plan = page.getByTestId('screen-plan-meetup');
  await plan.getByRole('checkbox', { name: 'Tomorrow' }).click();
  await plan
    .getByRole('checkbox', { name: /^\d{1,2}:\d{2} (AM|PM)$/ })
    .nth(2)
    .click();
  await expect(page.getByTestId('meetup-suggest')).toBeEnabled();
  await page.getByTestId('meetup-suggest').click();
  await expect(page.getByTestId('screen-chat')).toBeVisible({ timeout: 20_000 });

  const b = buyer.page;
  await expect(b.getByTestId('meetup-accept')).toBeVisible({ timeout: 30_000 });
  await b.getByTestId('meetup-accept').click();
  await expect(
    b.getByTestId('meetup-card-confirmed').or(b.getByTestId('meetup-card-accepted')),
  ).toBeVisible({ timeout: 20_000 });
});

async function rate(page: Page) {
  const did = page.getByTestId('chat-did-it-sell');
  const sold = page.getByTestId('chat-mark-sold');
  await expect(did.or(sold).or(page.getByTestId('screen-rate-submit')).first()).toBeVisible({
    timeout: 30_000,
  });
  if (await did.isVisible()) {
    await did.click();
    await page.getByTestId('deal-done').click();
  } else if (await sold.isVisible()) {
    await sold.click();
    await page.getByRole('radio', { name: /Bea/ }).click();
    await page.getByTestId('mark-sold').click();
  }
  const pick = page.getByTestId('screen-mark-sold');
  await expect(pick.or(page.getByTestId('screen-rate-submit')).first()).toBeVisible({
    timeout: 20_000,
  });
  if (await pick.isVisible()) {
    await page.getByRole('radio', { name: /Bea/ }).click();
    await page.getByTestId('mark-sold').click();
  }
  await expect(page.getByTestId('screen-rate-submit')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('rate-up').click();
  await page.getByTestId('rate-submit').click();
  await expect(page.getByTestId('screen-rate-submit')).toBeHidden({ timeout: 20_000 });
}

test('WEB-E2E-06 they confirm the sale and both rate', async () => {
  test.setTimeout(120_000);
  await rate(seller.page);
  await buyer.page.reload();
  const chat = buyer.page.getByTestId('screen-chat');
  await expect(chat.or(buyer.page.getByTestId('screen-inbox')).first()).toBeVisible({
    timeout: 20_000,
  });
  if (!(await chat.isVisible())) await inboxRow(buyer.page).click();
  await rate(buyer.page);
  await expect(buyer.page.getByTestId('screen-rate-revealed')).toBeVisible({ timeout: 20_000 });
});

test('WEB-E2E-07 search, save a search, find it under Saved', async () => {
  const page = buyer.page;
  await page.goto(APP + '/discover');
  await page.getByTestId('discover-search').click();
  await page.getByTestId('search-input').fill('Web mini fridge');
  await page.getByTestId('search-input').press('Enter');
  await expect(page.getByTestId('screen-results')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('results-empty')).toBeHidden();
  await page.getByTestId('results-save').click();
  await expect(page.getByTestId('toast')).toContainText('Search saved');
  await go(page, 'Profile');
  await page
    .getByRole('button', { name: /^Saved/ })
    .first()
    .click();
  await page
    .getByText(/^Searches/)
    .first()
    .click();
  await expect(page.locator('[data-testid^="search-row-"]').first()).toBeVisible({
    timeout: 20_000,
  });
});

test('WEB-E2E-08 notification settings save on the web', async () => {
  const page = seller.page;
  await page.goto(APP + '/discover');
  await go(page, 'Profile');
  await page
    .getByRole('button', { name: /^Settings/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^Notifications/ })
    .first()
    .click();
  await expect(page.getByTestId('screen-notification-settings')).toBeVisible();
  const tips = page.getByRole('switch', { name: /Selling tips/ });
  const before = await tips.getAttribute('aria-checked');
  expect(before).toMatch(/^(true|false)$/);
  const saved = page.waitForResponse((r) => r.url().includes('/rpc/update_notification_prefs'));
  await tips.click();
  await expect(tips).not.toHaveAttribute('aria-checked', before ?? '');
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('switch', { name: /Selling tips/ })).not.toHaveAttribute(
    'aria-checked',
    before ?? '',
    { timeout: 20_000 },
  );
});

test('WEB-E2E-09 report and block from the chat', async () => {
  const page = buyer.page;
  await page.goto(APP + '/inbox');
  await inboxRow(page).click();
  await page.getByTestId('chat-details').click();
  await page
    .getByRole('button', { name: /^Report/ })
    .first()
    .click();
  await page.getByRole('radio', { name: /^Harassment/ }).click();
  const block = page.getByRole('switch', { name: /^Also block/ });
  if ((await block.getAttribute('aria-checked')) !== 'true') await block.click();
  await expect(block).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Report sent')).toBeVisible({ timeout: 20_000 });
});

test('WEB-E2E-10 sign out and back in with the same school email', async () => {
  test.setTimeout(150_000);
  const page = seller.page;
  await page.goto(APP + '/discover');
  await go(page, 'Profile');
  await page
    .getByRole('button', { name: /^Settings/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Sign out$/ }).click();
  await page.waitForURL(/\/welcome/, { timeout: 20_000 });
  await expect(page.getByTestId('screen-welcome')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByTestId('email-input').fill(seller.email);
  const wait = (lastCode.get(seller.email) ?? 0) + 62_000 - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  await page.getByTestId('email-send').click();
  // Ask test-inbox only after the app's own send landed, or that send replaces the code.
  await expect(page.getByTestId('screen-verify')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('otp-input').fill(await otp(seller.email));
  await expect(page.getByTestId('screen-discover').filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  });
});

test('WEB-E2E-11 delete the account on the web', async () => {
  const page = buyer.page;
  await page.goto(APP + '/discover');
  await go(page, 'Profile');
  await page
    .getByRole('button', { name: /^Settings/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^Delete account/ })
    .first()
    .click();
  await expect(page.getByTestId('screen-delete-account')).toBeVisible();
  await page.getByTestId('delete-confirm').fill('DELETE');
  await page.getByTestId('delete-button').click();
  await expect(page.getByTestId('screen-welcome')).toBeVisible({ timeout: 30_000 });
});

test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus) return;
  for (const [name, who] of [
    ['seller', seller],
    ['buyer', buyer],
  ] as const) {
    if (!who) continue;
    await info.attach(`${name}-url`, { body: who.page.url() });
    await info.attach(`${name}-aria`, {
      body: await who.page
        .locator('body')
        .ariaSnapshot()
        .catch((e) => String(e)),
    });
  }
});

test.afterAll(() => {
  if (errors.length) console.log('Browser errors:\n' + [...new Set(errors)].join('\n'));
});
