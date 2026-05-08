/**
 * e2e/helpers/auth.ts
 * Shared authentication helpers for all E2E specs.
 */

import { type Page, type BrowserContext, expect } from '@playwright/test'

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@chitieu.test'
export const TEST_PASS  = process.env.E2E_TEST_PASS  ?? 'TestPass123!'

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Log in through the UI form.
 * After return, the page is on the dashboard ('/').
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(TEST_EMAIL)
  await page.getByLabel(/mật khẩu/i).fill(TEST_PASS)
  await page.getByRole('button', { name: /đăng nhập/i }).click()
  await expect(page).toHaveURL('/', { timeout: 15_000 })
  // Wait for the dashboard data to load (skeleton disappears)
  await expect(page.locator('[data-testid="stats-grid"]').or(
    page.getByText(/tổng chi/i),
  )).toBeVisible({ timeout: 15_000 })
}

/**
 * Fast login by injecting Firebase auth state into localStorage/sessionStorage.
 * Use this for tests that DON'T test the login flow itself.
 *
 * Requires the stored auth token from a prior loginViaUI() call:
 *   const token = await page.evaluate(() => localStorage.getItem('firebase:authUser:...'))
 *
 * For CI: set E2E_FIREBASE_TOKEN env var with a long-lived custom token.
 */
export async function loginViaStorage(page: Page, context: BrowserContext): Promise<void> {
  // Prefer UI login — fast enough for our suite size
  await loginViaUI(page)
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(page: Page): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('button', { name: /đăng xuất/i }).click()
  await expect(page).toHaveURL(/login/, { timeout: 10_000 })
}

// ─── Wait helpers ─────────────────────────────────────────────────────────────

/** Wait until the event store finishes loading (isLoading = false) */
export async function waitForDataLoad(page: Page): Promise<void> {
  // The skeleton / spinner disappears when isLoading turns false
  await page.waitForFunction(() => {
    return !document.querySelector('[data-testid="dashboard-skeleton"]') &&
           !document.querySelector('[data-testid="spinner"]')
  }, { timeout: 15_000 })
}

/** Wait for the offline-queue badge to reach a specific count */
export async function waitForQueueCount(page: Page, count: number, timeout = 10_000): Promise<void> {
  if (count === 0) {
    await expect(page.locator('[data-testid="offline-badge"]')).not.toBeVisible({ timeout })
  } else {
    await expect(page.locator('[data-testid="offline-badge"]')).toHaveText(String(count), { timeout })
  }
}

/** Wait for a toast notification containing text */
export async function waitForToast(page: Page, text: string | RegExp, timeout = 8_000): Promise<void> {
  await expect(page.locator('[data-testid="toast"]').filter({ hasText: text }))
    .toBeVisible({ timeout })
}
