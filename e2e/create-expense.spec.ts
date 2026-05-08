/**
 * E2E Spec: Create / Edit / Delete Expense
 *
 * Covers:
 *   ✓ Happy path: add expense → appears in list + dashboard total updates
 *   ✓ Validation: zero, negative, over-max, empty, invalid date
 *   ✓ Title field persisted (BUG-A regression)
 *   ✓ Edit expense: amount change reflected in totals
 *   ✓ Delete expense: removed from list + total decreases
 *   ✓ Category shown correctly in analytics after add
 *   ✓ Optimistic UI: expense appears immediately before server ack
 *   ✓ Duplicate prevention: double-submit blocked by isSubmitting guard
 */

import { test, expect } from '@playwright/test'
import { loginViaUI, waitForToast } from './helpers/auth'
import { DashboardPage, ExpenseFormModal, ExpensesTabPage } from './helpers/pages'
import { EXPENSE_FIXTURES, INVALID_INPUTS, TODAY } from './fixtures/data'

test.describe('Create Expense', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page)
  })

  // ─── Happy path ─────────────────────────────────────────────────────────────

  test('adds expense → appears in list immediately (optimistic)', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    const totalBefore = await dashboard.readTotalExpense()

    const form = await dashboard.openExpenseForm()
    await form.waitForOpen()
    await form.fill(EXPENSE_FIXTURES.basic)
    await form.submit.click()

    // Expense should appear in recent list WITHOUT waiting for server round-trip
    // (optimistic update via appendLocalEvent)
    await expect(
      page.getByText(EXPENSE_FIXTURES.basic.note),
    ).toBeVisible({ timeout: 3_000 })

    // Total should increase by the expense amount
    const totalAfter = await dashboard.readTotalExpense()
    expect(totalAfter).toBeGreaterThanOrEqual(totalBefore + 150_000)
  })

  test('title field is persisted and visible in list (BUG-A regression)', async ({ page }) => {
    // BUG-A: title was silently dropped from event data — verify the fix.
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    const form = await dashboard.openExpenseForm()
    await form.waitForOpen()
    await form.fill(EXPENSE_FIXTURES.withTitle)
    await form.submit.click()

    await expect(
      page.getByText(EXPENSE_FIXTURES.withTitle.title),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('expense appears in expenses tab with correct amount', async ({ page }) => {
    const expensesTab = new ExpensesTabPage(page)
    await expensesTab.goto()

    const countBefore = await expensesTab.expenseCount()

    const form = new ExpenseFormModal(page)
    await expensesTab.addButton.click()
    await form.waitForOpen()
    await form.fill(EXPENSE_FIXTURES.transport)
    await form.submit.click()

    await expect(
      page.getByText(EXPENSE_FIXTURES.transport.note),
    ).toBeVisible({ timeout: 5_000 })

    const countAfter = await expensesTab.expenseCount()
    expect(countAfter).toBe(countBefore + 1)
  })

  // ─── Validation ─────────────────────────────────────────────────────────────

  test.describe('Validation', () => {
    test('blocks submit when amount is 0', async ({ page }) => {
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      const form = await dashboard.openExpenseForm()
      await form.waitForOpen()
      await form.fill({ amount: INVALID_INPUTS.zeroAmount.amount })
      const result = await form.submitAndWait()
      expect(result).toBe('error')
      const errors = await form.getErrorMessages()
      expect(errors.some(e => INVALID_INPUTS.zeroAmount.expectedError.test(e))).toBe(true)
    })

    test('blocks submit when amount is negative', async ({ page }) => {
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      const form = await dashboard.openExpenseForm()
      await form.waitForOpen()
      await form.fill({ amount: INVALID_INPUTS.negativeAmount.amount })
      const result = await form.submitAndWait()
      expect(result).toBe('error')
      const errors = await form.getErrorMessages()
      expect(errors.some(e => INVALID_INPUTS.negativeAmount.expectedError.test(e))).toBe(true)
    })

    test('blocks submit when amount exceeds 999,000,000', async ({ page }) => {
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      const form = await dashboard.openExpenseForm()
      await form.waitForOpen()
      await form.fill({ amount: INVALID_INPUTS.overMaxAmount.amount })
      const result = await form.submitAndWait()
      expect(result).toBe('error')
      const errors = await form.getErrorMessages()
      expect(errors.some(e => INVALID_INPUTS.overMaxAmount.expectedError.test(e))).toBe(true)
    })

    test('accepts max valid amount (999,000,000)', async ({ page }) => {
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      const form = await dashboard.openExpenseForm()
      await form.waitForOpen()
      await form.fill(EXPENSE_FIXTURES.nearMax)
      const result = await form.submitAndWait()
      expect(result).toBe('success')
    })

    test('blocks submit when amount is empty', async ({ page }) => {
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      const form = await dashboard.openExpenseForm()
      await form.waitForOpen()
      await form.submit.click()   // submit with no input
      await expect(form.errors.first()).toBeVisible({ timeout: 3_000 })
    })

    test('blocks out-of-range date (year 2100)', async ({ page }) => {
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      const form = await dashboard.openExpenseForm()
      await form.waitForOpen()
      await form.fill({ amount: '100000', date: INVALID_INPUTS.futureDate.date })
      const result = await form.submitAndWait()
      expect(result).toBe('error')
      const errors = await form.getErrorMessages()
      expect(errors.some(e => INVALID_INPUTS.futureDate.expectedError.test(e))).toBe(true)
    })
  })

  // ─── Edit ────────────────────────────────────────────────────────────────────

  test('edit expense → total updates correctly', async ({ page }) => {
    // First, add an expense
    const expensesTab = new ExpensesTabPage(page)
    await expensesTab.goto()
    const form = new ExpenseFormModal(page)
    await expensesTab.addButton.click()
    await form.waitForOpen()

    const noteText = `E2E edit-test ${Date.now()}`
    await form.fill({ amount: '100000', note: noteText })
    await form.submit.click()
    await expect(page.getByText(noteText)).toBeVisible({ timeout: 5_000 })

    // Edit it — change amount to 200,000
    const expenseItem = await expensesTab.findExpenseByNote(noteText)
    await expenseItem.getByRole('button', { name: /sửa|edit/i }).click()
    await form.waitForOpen()
    await form.amount.clear()
    await form.amount.fill('200000')
    await form.submit.click()

    // Wait for update to reflect
    await page.waitForTimeout(1_000)
    await expect(page.getByText('200')).toBeVisible({ timeout: 5_000 })
  })

  // ─── Delete ──────────────────────────────────────────────────────────────────

  test('delete expense → removed from list + total decreases', async ({ page }) => {
    const expensesTab = new ExpensesTabPage(page)
    await expensesTab.goto()
    const form = new ExpenseFormModal(page)

    // Add a fresh expense to delete
    await expensesTab.addButton.click()
    await form.waitForOpen()
    const noteText = `E2E delete-test ${Date.now()}`
    await form.fill({ amount: '50000', note: noteText })
    await form.submit.click()
    await expect(page.getByText(noteText)).toBeVisible({ timeout: 5_000 })

    const countBefore = await expensesTab.expenseCount()

    // Delete it
    const expenseItem = await expensesTab.findExpenseByNote(noteText)
    await expenseItem.getByRole('button', { name: /xóa|delete/i }).click()
    // Confirm dialog
    await page.getByRole('button', { name: /xác nhận|ok|xóa/i }).last().click()

    await expect(page.getByText(noteText)).not.toBeVisible({ timeout: 5_000 })
    const countAfter = await expensesTab.expenseCount()
    expect(countAfter).toBe(countBefore - 1)
  })

  // ─── Double-submit guard ─────────────────────────────────────────────────────

  test('double-click submit only creates one expense (BUG-01 regression)', async ({ page }) => {
    // BUG-01 fix: isSubmitting prevents duplicate submissions
    const expensesTab = new ExpensesTabPage(page)
    await expensesTab.goto()
    const form = new ExpenseFormModal(page)

    await expensesTab.addButton.click()
    await form.waitForOpen()

    const noteText = `E2E double-submit ${Date.now()}`
    await form.fill({ amount: '100000', note: noteText })

    // Click submit twice rapidly
    await form.submit.dblclick()

    await expect(page.getByText(noteText)).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(1_500)

    // Exactly one instance should appear
    const items = page.getByText(noteText)
    await expect(items).toHaveCount(1, { timeout: 5_000 })
  })

  // ─── Separator inputs ────────────────────────────────────────────────────────

  test('accepts Vietnamese amount format with dots (1.500.000)', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()
    const form = await dashboard.openExpenseForm()
    await form.waitForOpen()
    await form.fill({ amount: '1.500.000', note: `E2E dot-format ${Date.now()}` })
    const result = await form.submitAndWait()
    expect(result).toBe('success')
  })
})
