/**
 * e2e/helpers/pages.ts
 * Page Object Models — encapsulate all locators so specs stay readable.
 */

import { type Page, expect, type Locator } from '@playwright/test'

// ─── Dashboard POM ────────────────────────────────────────────────────────────

export class DashboardPage {
  readonly page: Page

  // Locators
  readonly fab:            Locator
  readonly statsGrid:      Locator
  readonly budgetProgress: Locator
  readonly recentExpenses: Locator
  readonly offlineBadge:   Locator
  readonly totalExpense:   Locator

  constructor(page: Page) {
    this.page            = page
    this.fab             = page.locator('[data-testid="quick-add-fab"]').or(
                             page.getByRole('button', { name: /thêm chi tiêu/i }),
                           )
    this.statsGrid       = page.locator('[data-testid="stats-grid"]').or(
                             page.getByText(/tổng chi/i).first().locator('..').locator('..'),
                           )
    this.budgetProgress  = page.locator('[data-testid="budget-progress"]')
    this.recentExpenses  = page.locator('[data-testid="recent-expenses"]').or(
                             page.getByText(/chi tiêu gần đây/i).locator('..').locator('..'),
                           )
    this.offlineBadge    = page.locator('[data-testid="offline-badge"]')
    this.totalExpense    = page.locator('[data-testid="total-expense"]').or(
                             page.getByText(/tổng chi/i).first()
                               .locator('..').locator('p').first(),
                           )
  }

  async goto() {
    await this.page.goto('/')
    await expect(this.statsGrid).toBeVisible({ timeout: 15_000 })
  }

  async openExpenseForm() {
    await this.fab.click()
    return new ExpenseFormModal(this.page)
  }

  /** Read the displayed total-expense amount (strips ₫, separators) */
  async readTotalExpense(): Promise<number> {
    const text = await this.totalExpense.textContent() ?? '0'
    return parseDisplayedAmount(text)
  }

  /** Returns the text of the most recently added expense in the list */
  async firstExpenseNote(): Promise<string> {
    const item = this.recentExpenses.locator('[data-testid="expense-item"]').first()
    return (await item.locator('[data-testid="expense-note"]').textContent()) ?? ''
  }
}

// ─── Expense Form POM ─────────────────────────────────────────────────────────

export class ExpenseFormModal {
  readonly page:     Page
  readonly modal:    Locator
  readonly amount:   Locator
  readonly category: Locator
  readonly date:     Locator
  readonly note:     Locator
  readonly title:    Locator
  readonly submit:   Locator
  readonly close:    Locator
  readonly errors:   Locator

  constructor(page: Page) {
    this.page     = page
    this.modal    = page.locator('[role="dialog"]')
    this.amount   = this.modal.getByLabel(/số tiền/i)
    this.category = this.modal.locator('[data-testid="category-selector"]').or(
                      this.modal.getByRole('group', { name: /danh mục/i }),
                    )
    this.date     = this.modal.getByLabel(/ngày/i)
    this.note     = this.modal.getByLabel(/ghi chú/i)
    this.title    = this.modal.getByLabel(/tiêu đề/i)
    this.submit   = this.modal.getByRole('button', { name: /lưu|thêm|cập nhật/i })
    this.close    = this.modal.getByRole('button', { name: /đóng|hủy/i }).first()
    this.errors   = this.modal.locator('[role="alert"]')
  }

  async waitForOpen() {
    await expect(this.modal).toBeVisible({ timeout: 5_000 })
  }

  async fill(opts: {
    amount:    string
    category?: string
    date?:     string
    note?:     string
    title?:    string
  }) {
    await this.amount.fill(opts.amount)

    if (opts.category) {
      await this.category
        .getByRole('button', { name: new RegExp(opts.category, 'i') })
        .click()
    }

    if (opts.date) {
      await this.date.fill(opts.date)
    }

    if (opts.note) {
      await this.note.fill(opts.note)
    }

    if (opts.title) {
      await this.title.fill(opts.title)
    }
  }

  async submitAndWait(): Promise<'success' | 'error'> {
    await this.submit.click()
    // Either modal closes (success) or error message appears
    try {
      await Promise.race([
        expect(this.modal).not.toBeVisible({ timeout: 5_000 }),
        expect(this.errors.first()).toBeVisible({ timeout: 5_000 }),
      ])
      const modalVisible = await this.modal.isVisible()
      return modalVisible ? 'error' : 'success'
    } catch {
      return 'error'
    }
  }

  async getErrorMessages(): Promise<string[]> {
    const locators = await this.errors.all()
    return Promise.all(locators.map(l => l.textContent().then(t => t ?? '')))
  }
}

// ─── Analytics POM ────────────────────────────────────────────────────────────

export class AnalyticsPage {
  readonly page:          Page
  readonly totalExpense:  Locator
  readonly totalIncome:   Locator
  readonly txCount:       Locator
  readonly donutChart:    Locator
  readonly barChart:      Locator
  readonly cashflowCard:  Locator
  readonly periodButtons: Locator
  readonly netBalance:    Locator

  constructor(page: Page) {
    this.page         = page
    // Stats cards
    this.totalExpense = page.locator('[data-testid="stat-total-expense"]').or(
                          page.getByText(/tổng chi/i).first()
                            .locator('..').locator('p').first(),
                        )
    this.totalIncome  = page.locator('[data-testid="stat-total-income"]').or(
                          page.getByText(/thu nhập/i).first()
                            .locator('..').locator('p').first(),
                        )
    this.txCount      = page.locator('[data-testid="stat-tx-count"]').or(
                          page.getByText(/giao dịch/i).first()
                            .locator('..').locator('p').first(),
                        )
    this.donutChart   = page.locator('[data-testid="donut-chart"]').or(
                          page.locator('.recharts-pie').first(),
                        )
    this.barChart     = page.locator('[data-testid="bar-chart"]').or(
                          page.locator('.recharts-bar').first(),
                        )
    this.cashflowCard = page.locator('[data-testid="cashflow-card"]').or(
                          page.getByText(/dòng tiền thực tế/i).locator('..').locator('..'),
                        )
    this.netBalance   = this.cashflowCard.getByText(/số dư thực/i)
                          .locator('..').locator('span').last()
    this.periodButtons = page.locator('[data-testid="period-selector"]').or(
                           page.getByRole('group').filter({
                             has: page.getByRole('button', { name: /tuần|tháng|năm/i }),
                           }),
                         )
  }

  async goto() {
    await this.page.goto('/analytics')
    await expect(this.totalExpense.or(
      this.page.getByText(/tổng chi/i),
    )).toBeVisible({ timeout: 15_000 })
  }

  async selectPeriod(type: 'week' | 'month' | 'year') {
    const labelMap = { week: /tuần/i, month: /tháng/i, year: /năm/i }
    await this.periodButtons
      .getByRole('button', { name: labelMap[type] })
      .click()
    await this.page.waitForTimeout(500) // let charts re-render
  }

  async readTotalExpense(): Promise<number> {
    const text = await this.totalExpense.textContent() ?? '0'
    return parseDisplayedAmount(text)
  }

  async readNetBalance(): Promise<number> {
    const text = await this.netBalance.textContent() ?? '0'
    return parseDisplayedAmount(text)
  }
}

// ─── Expenses Tab POM ─────────────────────────────────────────────────────────

export class ExpensesTabPage {
  readonly page:       Page
  readonly list:       Locator
  readonly addButton:  Locator
  readonly totalText:  Locator

  constructor(page: Page) {
    this.page      = page
    this.list      = page.locator('[data-testid="expenses-list"]').or(
                       page.getByRole('list').filter({
                         has: page.locator('[data-testid="expense-item"]'),
                       }),
                     )
    this.addButton = page.getByRole('button', { name: /thêm|add/i }).first()
    this.totalText = page.locator('[data-testid="spending-total"]').or(
                       page.getByText(/tổng:/i).first(),
                     )
  }

  async goto() {
    await this.page.goto('/expenses')
    await expect(this.list.or(this.page.getByText(/chưa có/i))).toBeVisible({ timeout: 15_000 })
  }

  async expenseCount(): Promise<number> {
    return this.list.locator('[data-testid="expense-item"]').count()
  }

  async findExpenseByNote(note: string): Promise<Locator> {
    return this.list
      .locator('[data-testid="expense-item"]')
      .filter({ hasText: note })
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Parse a VND display string like "1.500.000 ₫" → 1500000 */
function parseDisplayedAmount(text: string): number {
  const cleaned = text.replace(/[^\d]/g, '')
  return cleaned ? parseInt(cleaned, 10) : 0
}
