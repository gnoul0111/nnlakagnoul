/**
 * Date utilities — LUÔN dùng local timezone (vi-VN / Asia/Ho_Chi_Minh)
 * KHÔNG dùng toISOString() vì nó trả về UTC, sẽ bị lệch múi giờ VN (UTC+7)
 */

// ─── Tạo date string (YYYY-MM-DD) từ local timezone ──────────────────────────

export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Tạo month key (YYYY-MM) từ local timezone */
export function toMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Lấy YYYY-MM từ date string YYYY-MM-DD */
export function getMonthFromDateString(dateStr: string): string {
  return dateStr.slice(0, 7)
}

// ─── Parse / construct Date ───────────────────────────────────────────────────

/** Parse YYYY-MM-DD → Date (local timezone, không UTC) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Hôm nay dạng YYYY-MM-DD */
export function today(): string {
  return toLocalDateString(new Date())
}

/** Tháng này dạng YYYY-MM */
export function thisMonth(): string {
  return toMonthKey(new Date())
}

// ─── Navigation: prev/next month ─────────────────────────────────────────────

export function prevMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return toMonthKey(d)
}

export function nextMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m, 1)
  return toMonthKey(d)
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const VI_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const VI_MONTHS = [
  'tháng 1', 'tháng 2', 'tháng 3', 'tháng 4',
  'tháng 5', 'tháng 6', 'tháng 7', 'tháng 8',
  'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12',
]

/** "15 tháng 3, 2026" */
export function formatDateLong(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

/** "dd/mm/yyyy" — dùng để hiển thị ngày raw thay vì YYYY-MM-DD */
export function formatDateVN(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = parseLocalDate(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day   = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year  = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return dateStr
  }
}

/** "T5, 15/03/2026" */
export function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  return `${VI_WEEKDAYS[d.getDay()]}, ${day}/${month}/${year}`
}

/** "Tháng 3/2026" */
export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `Tháng ${m}/${y}`
}

/** "03/2026" — compact */
export function formatMonthCompact(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${String(m).padStart(2, '0')}/${y}`
}

/** Số ngày cách nhau (dương = future, âm = past) */
export function daysDiff(from: string, to: string): number {
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/** Hiển thị "Hôm nay", "Hôm qua", hoặc ngày cụ thể */
export function formatRelativeDate(dateStr: string): string {
  const todayStr = today()
  const diff = daysDiff(todayStr, dateStr)
  if (diff === 0) return 'Hôm nay'
  if (diff === -1) return 'Hôm qua'
  if (diff === 1) return 'Ngày mai'
  return formatDateLong(dateStr)
}

// ─── Range helpers ────────────────────────────────────────────────────────────

/** Tất cả tháng từ start đến end (inclusive) */
export function monthRange(start: string, end: string): string[] {
  const months: string[] = []
  let current = start
  while (current <= end) {
    months.push(current)
    current = nextMonth(current)
  }
  return months
}

/** 6 tháng gần nhất (bao gồm tháng hiện tại) */
export function last6Months(): string[] {
  const months: string[] = []
  let current = thisMonth()
  for (let i = 0; i < 6; i++) {
    months.unshift(current)
    current = prevMonth(current)
  }
  return months
}

/** Ngày đầu và cuối của 1 tuần (thứ 2 đến CN, hoặc CN đến T7) */
export function getWeekRange(
  dateStr: string,
  weekStartDay: 'monday' | 'sunday' = 'monday',
): { start: string; end: string } {
  const d = parseLocalDate(dateStr)
  const dow = d.getDay() // 0 = CN, 1 = T2, ...
  const startOffset = weekStartDay === 'monday'
    ? (dow === 0 ? -6 : 1 - dow)
    : -dow

  const start = new Date(d)
  start.setDate(d.getDate() + startOffset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  }
}

// ─── Quick range helpers (cho DateRangePicker) ────────────────────────────────

/** N ngày gần nhất (bao gồm hôm nay) → { from, to } */
export function lastNDays(n: number, refDate: string = today()): { from: string; to: string } {
  const end   = parseLocalDate(refDate)
  const start = new Date(end)
  start.setDate(end.getDate() - (n - 1))
  return { from: toLocalDateString(start), to: toLocalDateString(end) }
}

/** Ngày đầu tháng (monthKey "YYYY-MM" → "YYYY-MM-01") */
export function startOfMonth(monthKey: string): string {
  return `${monthKey}-01`
}

/** Ngày cuối tháng (monthKey "YYYY-MM" → "YYYY-MM-28/30/31") */
export function endOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate() // day 0 of next month = last day of this month
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`
}

/** Ngày đầu năm */
export function startOfYear(year: number): string {
  return `${year}-01-01`
}

// ─── PeriodLike — chuẩn hoá monthKey/range dùng chung cho budgetCalc.ts + replay.ts ─
// (nguồn gốc duy nhất — trước đây bị copy-paste trùng ở 2 file, dễ sửa 1 nơi quên nơi kia)

/** monthKey ("YYYY-MM") cho tháng dương lịch, hoặc {start,end} đã resolve cho kỳ lương */
export type PeriodLike = string | { start: string; end: string }

export function toRange(period: PeriodLike): { start: string; end: string } {
  if (typeof period === 'string') return { start: startOfMonth(period), end: endOfMonth(period) }
  return period
}

/** Ngày cuối năm */
export function endOfYear(year: number): string {
  return `${year}-12-31`
}

// ─── Salary-cycle range (kỳ lương) ─────────────────────────────────────────────

export interface CycleRange {
  start: string      // YYYY-MM-DD — ngày salaryDay của tháng bắt đầu kỳ
  end: string         // YYYY-MM-DD — (salaryDay - 1) của tháng sau
  cycleKey: string    // = start (YYYY-MM-DD) — khác định dạng monthKey (YYYY-MM) nên không bao giờ trùng
}

/** Số ngày thật trong 1 tháng (0-based month) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Clamp ngày lương vào tháng ngắn (vd salaryDay=31, tháng 2 → lùi về 28) */
function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(year, month))
}

/** Cộng/trừ N ngày vào 1 date string */
function shiftDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

/**
 * Trả về khoảng kỳ lương chứa anchorDate, bắt đầu từ ngày salaryDay mỗi tháng.
 * salaryDay=0 hoặc không hợp lệ: caller phải tự guard (UI không cho bật cycle mode
 * khi salaryDay chưa set — xem preferences-tab.tsx).
 */
export function getSalaryCycleRange(anchorDate: string, salaryDay: number): CycleRange {
  const d = parseLocalDate(anchorDate)
  const day = d.getDate()
  const anchorYear  = d.getFullYear()
  const anchorMonth = d.getMonth() // 0-based

  // So với ngày lương ĐÃ CLAMP cho đúng tháng của anchor — không phải salaryDay thô.
  // Bẫy đã gặp: nếu so raw salaryDay (vd 31) trong khi tháng anchor chỉ có 28 ngày,
  // anchor đúng bằng ngày lương thực (28) bị coi là "chưa tới ngày lương" (28 >= 31
  // = false) → cycleKey tính ra trùng với kỳ trước → nextCycle() bị đứng im, không
  // bao giờ tiến được sang kỳ mới cho các salaryDay hay bị clamp (29/30/31).
  const paydayThisMonth = clampDayToMonth(anchorYear, anchorMonth, salaryDay)
  const startsInCurrentMonth = day >= paydayThisMonth
  const startYear  = startsInCurrentMonth ? anchorYear : (anchorMonth === 0 ? anchorYear - 1 : anchorYear)
  const startMonth = startsInCurrentMonth ? anchorMonth : (anchorMonth === 0 ? 11 : anchorMonth - 1)

  const clampedStartDay = clampDayToMonth(startYear, startMonth, salaryDay)
  const start = new Date(startYear, startMonth, clampedStartDay)

  const nextMonthDate = new Date(startYear, startMonth + 1, 1)
  const endDay = clampDayToMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), salaryDay) - 1
  const end = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), Math.max(endDay, 1))

  const startStr = toLocalDateString(start)
  return { start: startStr, end: toLocalDateString(end), cycleKey: startStr }
}

/** cycleKey của kỳ lương liền trước */
export function prevCycle(cycleKey: string, salaryDay: number): string {
  return getSalaryCycleRange(shiftDate(cycleKey, -1), salaryDay).cycleKey
}

/** cycleKey của kỳ lương liền sau */
export function nextCycle(cycleKey: string, salaryDay: number): string {
  const range = getSalaryCycleRange(cycleKey, salaryDay)
  return getSalaryCycleRange(shiftDate(range.end, 1), salaryDay).cycleKey
}

/** Dựng lại range đầy đủ từ 1 cycleKey đã lưu (cycleKey chính là start) */
export function cycleKeyToRange(cycleKey: string, salaryDay: number): CycleRange {
  return getSalaryCycleRange(cycleKey, salaryDay)
}

/** "Kỳ lương 25/06 - 24/07" */
export function formatCycleLabel(start: string, end: string): string {
  const [, sm, sd] = start.split('-')
  const [, em, ed] = end.split('-')
  return `Kỳ lương ${sd}/${sm} - ${ed}/${em}`
}

// ─── Calendar grid (cho DatePicker / DateRangePicker) ─────────────────────────

export interface CalendarCell {
  date:    string  // YYYY-MM-DD
  day:     number  // 1-31
  inMonth: boolean // false = ngày overflow từ tháng trước/sau
}

/**
 * Tạo grid 6×7 (42 cells) cho 1 tháng.
 * Tuần bắt đầu từ T2 (chuẩn VN) mặc định.
 */
export function getCalendarGrid(
  monthKey: string,
  weekStart: 'monday' | 'sunday' = 'monday',
): CalendarCell[] {
  const [y, m]      = monthKey.split('-').map(Number)
  const firstOfMonth = new Date(y, m - 1, 1)
  const dow         = firstOfMonth.getDay() // 0=CN, 1=T2, ... 6=T7

  // Offset: số ngày cần lùi lại để bắt đầu grid đúng thứ đầu tuần
  const offset = weekStart === 'monday'
    ? (dow === 0 ? 6 : dow - 1) // CN → lùi 6; T2 → 0; T3 → 1; ...
    : dow                        // CN → 0; T2 → 1; ...

  const start  = new Date(y, m - 1, 1 - offset)
  const cells: CalendarCell[] = []

  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push({
      date:    toLocalDateString(d),
      day:     d.getDate(),
      inMonth: d.getMonth() === m - 1 && d.getFullYear() === y,
    })
  }
  return cells
}