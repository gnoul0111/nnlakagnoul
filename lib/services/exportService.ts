import { getAllEvents } from './eventService'
import { getBudget } from './budgetService'
import { getCalendarEventsByUser } from './calendarService'
import { appendEventsBatch } from './eventService'
import { COLLECTIONS, setDocument } from '@/lib/firebase/firestore'
import type { EventDoc } from '@/lib/types/events'
import type { Budget } from '@/lib/types/budget'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import { today } from '@/lib/utils/date'
import { CATEGORIES } from '@/lib/types/expense'

// Whitelist phải khớp với validEvent() trong firestore.rules
const VALID_EVENT_TYPES = new Set([
  'EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED',
  'INCOME_ADDED', 'INCOME_CREATED', 'INCOME_DELETED',
  'BUDGET_SET',
  'GOAL_ADDED', 'GOAL_CREATED', 'GOAL_UPDATED', 'GOAL_DELETED',
  'GOAL_DEPOSIT_ADDED', 'GOAL_DEPOSIT_EDITED', 'GOAL_DEPOSIT_DELETED',
  'DEBT_CREATED', 'DEBT_UPDATED', 'DEBT_DELETED',
  'DEBT_PAYMENT_ADDED', 'DEBT_PAYMENT_DELETED',
  'TEMPLATE_CREATED', 'TEMPLATE_DELETED',
  'SAVINGS_TARGET_SET', 'SAVINGS_DEPOSIT', 'SAVINGS_DEPOSIT_DELETED',
  'SAVINGS_ALLOCATED', 'SAVINGS_ALLOCATION_DELETED',
  'SAVINGS_WITHDRAWN', 'SAVINGS_WITHDRAWAL_DELETED',
])

const VALID_CALENDAR_CATEGORIES = new Set(['work', 'personal', 'health', 'other'])

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export interface BackupData {
  version: number
  exportedAt: string
  userId: string
  events: EventDoc[]
  budgets: Budget[]
  workCalendar: WorkCalendarEvent[]
}

const BACKUP_VERSION = 1

export async function exportJSON(userId: string): Promise<void> {
  const [events, calendarEvents] = await Promise.all([
    getAllEvents(userId),
    getCalendarEventsByUser(userId),
  ])
  const monthKeys = new Set<string>()
  for (const e of events) {
    const date = (e.data?.date as string) ?? (e.data?.month as string)
    if (date) monthKeys.add(date.slice(0, 7))
  }
  // Parallel fetch — nếu có 24 tháng thì 24 request chạy đồng thời, nhanh hơn nhiều
  const budgetResults = await Promise.all(
    Array.from(monthKeys).map(m => getBudget(userId, m)),
  )
  const budgets = budgetResults.filter((b): b is Budget => b !== null)

  downloadJSON(
    { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), userId, events, budgets, workCalendar: calendarEvents },
    `chitieu-backup-${today()}.json`,
  )
}

// ─── Export Excel — dùng exceljs (thay xlsx vì lỗ hổng bảo mật) ─────────────

export async function exportExcel(
  expenses: Array<{ date: string; category: string; amount: number; note: string }>,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Chi Tiêu App'
  wb.created = new Date()

  const ws = wb.addWorksheet('Chi tiêu', { views: [{ state: 'frozen', ySplit: 1 }] })

  ws.columns = [
    { header: 'Ngày',        key: 'date',     width: 14 },
    { header: 'Danh mục',    key: 'category', width: 16 },
    { header: 'Số tiền (₫)', key: 'amount',   width: 18 },
    { header: 'Ghi chú',     key: 'note',     width: 32 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height    = 22

  const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))
  const thinBorder = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } }

  for (const e of expenses) {
    const row = ws.addRow({ date: e.date, category: catMap[e.category] ?? e.category, amount: e.amount, note: e.note })
    row.getCell('amount').numFmt    = '#,##0'
    row.getCell('amount').alignment = { horizontal: 'right' }
    row.getCell('date').alignment   = { horizontal: 'center' }
    row.eachCell((cell) => { cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder } })
  }

  if (expenses.length > 0) {
    ws.addRow([])
    const sumRow = ws.addRow({ date: 'TỔNG CỘNG', amount: expenses.reduce((s, e) => s + e.amount, 0), note: `${expenses.length} giao dịch` })
    sumRow.font = { bold: true }
    sumRow.getCell('amount').numFmt    = '#,##0'
    sumRow.getCell('amount').alignment = { horizontal: 'right' }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url; a.download = `chitieu-expenses-${today()}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Import JSON ──────────────────────────────────────────────────────────────

export interface ImportPreview {
  eventCount: number; budgetCount: number; calendarCount: number
  exportedAt: string; isValid: boolean; error?: string
}

export function validateBackup(raw: unknown): ImportPreview {
  try {
    const data = raw as BackupData
    if (!data || typeof data !== 'object') return { eventCount: 0, budgetCount: 0, calendarCount: 0, exportedAt: '', isValid: false, error: 'File không hợp lệ.' }
    if (typeof data.version !== 'number')  return { eventCount: 0, budgetCount: 0, calendarCount: 0, exportedAt: '', isValid: false, error: 'Không nhận ra định dạng.' }
    if (!Array.isArray(data.events))       return { eventCount: 0, budgetCount: 0, calendarCount: 0, exportedAt: '', isValid: false, error: 'Dữ liệu events không hợp lệ.' }
    return { eventCount: data.events.length, budgetCount: Array.isArray(data.budgets) ? data.budgets.length : 0, calendarCount: Array.isArray(data.workCalendar) ? data.workCalendar.length : 0, exportedAt: data.exportedAt ?? '', isValid: true }
  } catch { return { eventCount: 0, budgetCount: 0, calendarCount: 0, exportedAt: '', isValid: false, error: 'Lỗi đọc file.' } }
}

export async function importJSON(
  userId: string,
  file: File,
  options: { onProgress?: (c: number, t: number) => void } = {},
): Promise<{ imported: number; skipped: number; budgets: number; calendarEvents: number }> {
  const raw = JSON.parse(await file.text()) as BackupData
  const preview = validateBackup(raw)
  if (!preview.isValid) throw new Error(preview.error)

  // ── Phase 1: Events (chủ lực) ────────────────────────────────────────────
  const existingIds = new Set((await getAllEvents(userId)).map(e => e.id))
  const newEvents   = raw.events.filter(e =>
    !existingIds.has(e.id) && VALID_EVENT_TYPES.has(String(e.eventType)),
  )

  // Total steps để tính progress = events + budgets + calendar
  const totalBudgets  = Array.isArray(raw.budgets)      ? raw.budgets.length      : 0
  const totalCalendar = Array.isArray(raw.workCalendar) ? raw.workCalendar.length : 0
  const totalSteps    = newEvents.length + totalBudgets + totalCalendar

  let done = 0
  const report = () => options.onProgress?.(done, totalSteps)

  for (let i = 0; i < newEvents.length; i += 50) {
    const chunk = newEvents.slice(i, i + 50)
    await appendEventsBatch(
      chunk.map(e => ({ userId, eventType: e.eventType, data: e.data, createdAt: e.createdAt, clientTimestamp: e.clientTimestamp })),
    )
    done += chunk.length
    report()
  }

  // ── Phase 2: Budgets ─────────────────────────────────────────────────────
  // Budget doc id = {userId}_{month} → set trực tiếp, ghi đè nếu đã tồn tại
  // (backup mới hơn được coi là source of truth)
  if (totalBudgets > 0) {
    // Parallel theo batch 10 để không nghẽn
    const BATCH = 10
    for (let i = 0; i < raw.budgets.length; i += BATCH) {
      const chunk = raw.budgets.slice(i, i + BATCH)
      await Promise.all(
        chunk.map(b =>
          setDocument(COLLECTIONS.BUDGETS, `${userId}_${b.month}`, { ...b, userId }, true),
        ),
      )
      done += chunk.length
      report()
    }
  }

  // ── Phase 3: Work calendar events ────────────────────────────────────────
  // Hard-delete nghĩa là backup cũ chứa events có thể đã bị xoá trên server.
  // Chính sách: import là additive — chỉ thêm event chưa tồn tại, không ghi đè.
  if (totalCalendar > 0) {
    const existingCal = await getCalendarEventsByUser(userId)
    const existingCalIds = new Set(existingCal.map(e => e.id))
    const newCal = raw.workCalendar.filter(e =>
      !existingCalIds.has(e.id) &&
      typeof e.title === 'string' && e.title.trim().length > 0 && e.title.length <= 200 &&
      typeof e.date === 'string' && DATE_REGEX.test(e.date) &&
      VALID_CALENDAR_CATEGORIES.has(e.category),
    )

    const BATCH = 10
    for (let i = 0; i < newCal.length; i += BATCH) {
      const chunk = newCal.slice(i, i + BATCH)
      await Promise.all(
        chunk.map(e =>
          setDocument(COLLECTIONS.WORK_CALENDAR, e.id, { ...e, userId }),
        ),
      )
      done += chunk.length
      report()
    }
    // Update totalSteps để progress luôn đạt 100% (nếu có event bị skip)
    if (newCal.length < totalCalendar) {
      done = totalSteps
      report()
    }
  }

  return {
    imported: newEvents.length,
    skipped:  raw.events.length - newEvents.length,
    budgets:  totalBudgets,
    calendarEvents: totalCalendar,
  }
}

function downloadJSON(data: unknown, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoke sau khi browser xử lý xong để không leak memory
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}