import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config — Chi Tiêu app
 *
 * Run:  npx playwright test
 * UI:   npx playwright test --ui
 * Debug: npx playwright test --debug
 *
 * Env vars (set in .env.test.local or CI secrets):
 *   E2E_BASE_URL    — default http://localhost:3000
 *   E2E_TEST_EMAIL  — Firebase test user email
 *   E2E_TEST_PASS   — Firebase test user password
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,         // financial state tests need isolation
  forbidOnly: !!process.env.CI,
  retries:  process.env.CI ? 2 : 0,
  workers:  process.env.CI ? 1 : 2,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL:     process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace:       'retain-on-failure',
    screenshot:  'only-on-failure',
    video:       'retain-on-failure',
    locale:      'vi-VN',
    timezoneId:  'Asia/Ho_Chi_Minh',
    // Offline-sync tests manipulate service worker — keep context isolated
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: '**/create-expense.spec.ts', // run UX-critical path on mobile too
    },
  ],

  // Start Next.js dev server before tests when running locally
  webServer: process.env.CI ? undefined : {
    command:   'npm run dev',
    url:       'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
