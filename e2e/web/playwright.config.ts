// Playwright suites for the site and admin (P14-E2E-02, TESTING §3 E2E-W*/A*).
// Run against staging or a local preview:
//   SITE_URL=https://<preview>.onlyswap.pages.dev ADMIN_URL=https://<preview>.onlyswap-admin.pages.dev \
//   pnpm --filter e2e-web e2e
// Tests that need staging data skip themselves when their variables are unset.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /site\.spec\.ts/ },
  ],
});
