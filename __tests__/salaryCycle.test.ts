import {
  getSalaryCycleRange, prevCycle, nextCycle, cycleKeyToRange,
  startOfMonth, endOfMonth,
} from '../lib/utils/date'
import {
  getConsumptionExpenses, sumIncome, calcCashflow, calcBudgetSummary,
} from '../lib/utils/budgetCalc'
import type { Expense } from '../lib/types/expense'
import type { Income } from '../lib/types/income'

// ─── getSalaryCycleRange ────────────────────────────────────────────────────

describe('getSalaryCycleRange', () => {
  test('anchor sau salaryDay trong tháng → kỳ bắt đầu tháng này', () => {
    const r = getSalaryCycleRange('2026-07-03', 25)
    expect(r).toEqual({ start: '2026-06-25', end: '2026-07-24', cycleKey: '2026-06-25' })
  })

  test('anchor đúng ngày salaryDay → kỳ bắt đầu từ chính ngày đó', () => {
    const r = getSalaryCycleRange('2026-06-25', 25)
    expect(r.start).toBe('2026-06-25')
    expect(r.end).toBe('2026-07-24')
  })

  test('anchor trước salaryDay trong tháng → kỳ bắt đầu tháng trước', () => {
    const r = getSalaryCycleRange('2026-07-20', 25)
    expect(r).toEqual({ start: '2026-06-25', end: '2026-07-24', cycleKey: '2026-06-25' })
  })

  test('qua năm mới — anchor tháng 1 trước salaryDay → kỳ bắt đầu tháng 12 năm trước', () => {
    const r = getSalaryCycleRange('2026-01-10', 25)
    expect(r.start).toBe('2025-12-25')
    expect(r.end).toBe('2026-01-24')
  })

  test('salaryDay=31 rơi vào tháng 2 (28 ngày) → lùi về ngày cuối tháng', () => {
    const r = getSalaryCycleRange('2026-02-15', 31)
    // Kỳ chứa 15/2 khi salaryDay=31: tháng 1 có 31 ngày → kỳ bắt đầu 31/1
    expect(r.start).toBe('2026-01-31')
    // Kỳ kết thúc = ngày cuối tháng 2 (30/2026 không phải năm nhuận → 28 ngày) trừ 1 = 27/2,
    // nhưng vì tháng 2 chỉ có 28 ngày (clamp), end = 28/2 - 1 ngày... xem lại thực tế bằng clamp:
    // endMonth = tháng 2, clampDayToMonth(2026,1,31) = 28 → end day = 28-1 = 27
    expect(r.end).toBe('2026-02-27')
  })

  test('cycleKey luôn khác định dạng monthKey (10 ký tự vs 7 ký tự) — không đụng độ namespace', () => {
    const r = getSalaryCycleRange('2026-07-03', 25)
    expect(r.cycleKey).toHaveLength(10)
    expect(r.cycleKey).not.toMatch(/^\d{4}-\d{2}$/)
  })

  // ─── Regression: bug thật phát hiện qua code review sau khi deploy preview ──
  // Root cause: so sánh `day >= salaryDay` dùng salaryDay THÔ (chưa clamp cho
  // đúng tháng của anchor). Khi anchor CHÍNH LÀ ngày lương đã bị clamp (vd
  // salaryDay=31, anchor=28/2 — vì tháng 2 chỉ có 28 ngày), so sánh với số 31
  // thô luôn ra false → anchor bị coi thuộc kỳ TRƯỚC thay vì bắt đầu kỳ mới.
  test('anchor CHÍNH LÀ ngày lương đã clamp (28/2 khi salaryDay=31) → phải bắt đầu kỳ MỚI, không thuộc kỳ trước', () => {
    const r = getSalaryCycleRange('2026-02-28', 31)
    expect(r.start).toBe('2026-02-28')     // kỳ mới bắt đầu đúng ngày này
    expect(r.end).toBe('2026-03-30')       // kết thúc trước ngày lương clamp của tháng 3 (31/3 hợp lệ)
  })

  test('salaryDay=0 (chưa đặt) — không dùng để tính kỳ lương ở tầng UI (guard qua selectIsCycleModeActive), nhưng nếu lỡ gọi trực tiếp thì range là 1/tháng → 1/tháng sau (chồng lấn biết trước, không crash)', () => {
    const r = getSalaryCycleRange('2026-07-03', 0)
    expect(r.start).toBe('2026-07-01')
    expect(r.end).toBe('2026-08-01')
  })
})

describe('nextCycle — không được đứng im (bẫy salaryDay bị clamp qua nhiều tháng liên tiếp)', () => {
  test('salaryDay=31: Jan → Feb → Mar → Apr phải là 4 cycleKey khác nhau', () => {
    const jan = '2026-01-31'
    const feb = nextCycle(jan, 31)
    const mar = nextCycle(feb, 31)
    const apr = nextCycle(mar, 31)
    const keys = [jan, feb, mar, apr]
    expect(new Set(keys).size).toBe(4) // không có key nào lặp lại (đứng im)
    expect(feb).toBe('2026-02-28') // clamp vì Feb chỉ có 28 ngày (2026 không nhuận)
    expect(mar).toBe('2026-03-31') // Mar có 31 ngày → về đúng ngày lương thật
    expect(apr).toBe('2026-04-30') // clamp vì Apr chỉ có 30 ngày
  })

  test('prevCycle/nextCycle round-trip vẫn đúng quanh tháng bị clamp', () => {
    const feb = '2026-02-28'
    expect(prevCycle(nextCycle(feb, 31), 31)).toBe(feb)
  })
})

describe('prevCycle / nextCycle', () => {
  test('next rồi prev quay lại đúng cycleKey ban đầu', () => {
    const start = getSalaryCycleRange('2026-07-03', 25).cycleKey
    const next  = nextCycle(start, 25)
    const back  = prevCycle(next, 25)
    expect(back).toBe(start)
  })

  test('nextCycle nhảy đúng 1 tháng', () => {
    const start = '2026-06-25'
    expect(nextCycle(start, 25)).toBe('2026-07-25')
  })

  test('prevCycle qua năm mới', () => {
    expect(prevCycle('2026-01-25', 25)).toBe('2025-12-25')
  })
})

describe('cycleKeyToRange', () => {
  test('dựng lại đúng range từ cycleKey đã lưu', () => {
    const original = getSalaryCycleRange('2026-07-03', 25)
    const rebuilt  = cycleKeyToRange(original.cycleKey, 25)
    expect(rebuilt).toEqual(original)
  })
})

// ─── budgetCalc regression — hành vi tháng dương lịch phải giữ nguyên ──────

function exp(date: string, amount: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id: `e-${date}-${amount}`, userId: 'u1', amount, date,
    category: 'other', note: '', deleted: false,
    ...overrides,
  } as Expense
}

function inc(date: string, amount: number): Income {
  return {
    id: `i-${date}-${amount}`, userId: 'u1', amount, date,
    month: date.slice(0, 7), source: 'Lương', note: '', deleted: false,
  } as Income
}

describe('budgetCalc — regression tháng dương lịch (monthKey string vẫn hoạt động y hệt cũ)', () => {
  const expenses: Expense[] = [
    exp('2026-06-30', 100),   // tháng trước — không được tính
    exp('2026-07-01', 200),
    exp('2026-07-15', 300),
    exp('2026-07-31', 400),
    exp('2026-08-01', 500),   // tháng sau — không được tính
  ]
  const incomes: Income[] = [
    inc('2026-06-30', 1000),
    inc('2026-07-05', 5000),
    inc('2026-07-25', 2000),
    inc('2026-08-01', 9000),
  ]

  test('getConsumptionExpenses chỉ lấy đúng expense trong tháng 7', () => {
    const result = getConsumptionExpenses(expenses, '2026-07')
    expect(result.map(e => e.date)).toEqual(['2026-07-01', '2026-07-15', '2026-07-31'])
  })

  test('sumIncome dùng monthKey string vẫn ra đúng tổng (dù đã đổi từ i.month sang i.date range)', () => {
    expect(sumIncome(incomes, '2026-07')).toBe(7000)
  })

  test('calcBudgetSummary với monthKey string — usedAmount khớp tổng chi tháng 7', () => {
    const summary = calcBudgetSummary(expenses, { spendingAmount: 1000 } as any, '2026-07')
    expect(summary.usedAmount).toBe(900)
  })

  test('calcCashflow với monthKey string — totalIncome/consumptionTotal khớp tháng 7', () => {
    const flow = calcCashflow(expenses, incomes, [], [], null, '2026-07')
    expect(flow.totalIncome).toBe(7000)
    expect(flow.consumptionTotal).toBe(900)
  })
})

describe('budgetCalc — kỳ lương xuyên 2 tháng dương lịch', () => {
  // Kỳ lương 25/06 → 24/07
  const range = { start: '2026-06-25', end: '2026-07-24' }

  const expenses: Expense[] = [
    exp('2026-06-24', 50),    // trước kỳ — loại
    exp('2026-06-25', 100),   // đầu kỳ
    exp('2026-07-10', 200),   // giữa kỳ (tháng dương lịch khác)
    exp('2026-07-24', 300),   // cuối kỳ
    exp('2026-07-25', 400),   // sau kỳ — loại
  ]
  const incomes: Income[] = [
    inc('2026-06-25', 5000),  // đầu kỳ — Income.month="2026-06", vẫn phải được tính
    inc('2026-07-24', 5000),  // cuối kỳ — Income.month="2026-07"
    inc('2026-07-25', 9999),  // sau kỳ — loại
  ]

  test('getConsumptionExpenses với range object lọc đúng theo ngày thực, xuyên 2 tháng', () => {
    const result = getConsumptionExpenses(expenses, range)
    expect(result.map(e => e.date)).toEqual(['2026-06-25', '2026-07-10', '2026-07-24'])
  })

  test('sumIncome với range — PHẢI dùng Income.date, không phải Income.month (2 income khác monthKey nhưng cùng kỳ lương)', () => {
    expect(sumIncome(incomes, range)).toBe(10000)
  })

  // ─── Regression cho bug thật đã gặp (bản deploy đầu tiên) ──────────────────
  // Root cause: component (Dashboard/Finance tabs) lỡ truyền THẲNG cycleKey
  // (chuỗi "YYYY-MM-DD", vd "2026-06-25") vào các hàm nhận PeriodLike, thay vì
  // truyền `range` ({start,end}) đã resolve từ usePeriod(). toRange() nội bộ
  // không phân biệt được cycleKey với monthKey ("YYYY-MM") — coi cycleKey như
  // monthKey, nối thêm "-01"/gọi endOfMonth() → ra range rác dạng
  // "2026-06-25-01".."2026-06-25-30", khiến MỌI chi tiêu/thu nhập bị lọc rớt
  // (Dashboard hiện toàn 0đ dù dữ liệu thật vẫn còn nguyên trong Firestore).
  // Test này khẳng định: (1) hành vi sai nếu lỡ truyền bare cycleKey — để nhắc
  // nhở KHÔNG được làm vậy; (2) truyền đúng `range` object thì luôn ra kết quả
  // đúng, không phụ thuộc caller quên hay nhớ.
  test('CẢNH BÁO: truyền bare cycleKey string (thay vì range object) ra kết quả SAI — không được làm vậy ở component', () => {
    const cycleKeyAsBareString = '2026-06-25' // đây là điều KHÔNG được làm
    const wrongResult = getConsumptionExpenses(expenses, cycleKeyAsBareString)
    // Range rác khiến hầu như không khớp gì — đây chính là bug đã gặp
    expect(wrongResult.length).not.toBe(3)
  })

  test('Truyền đúng range object luôn ra kết quả đúng, bất kể caller là Dashboard/Finance/Analytics/AI summary', () => {
    const result = getConsumptionExpenses(expenses, range)
    expect(result).toHaveLength(3)
  })

  test('calcCashflow với range object — tổng đúng theo kỳ lương', () => {
    const flow = calcCashflow(expenses, incomes, [], [], null, range)
    expect(flow.totalIncome).toBe(10000)
    expect(flow.consumptionTotal).toBe(600)
  })
})
