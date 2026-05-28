import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getGeminiModel } from '@/lib/ai/gemini'
import { CATEGORIES } from '@/lib/types/expense'
import { verifyIdToken } from '@/lib/auth/verifyToken'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

export const maxDuration = 30

export interface FinanceSummaryInput {
  // Thời gian
  monthLabel:       string   // "tháng 5/2025"
  isCurrentMonth:   boolean  // đang trong tháng hay xem lại tháng cũ
  daysInMonth:      number
  daysElapsed:      number   // số ngày đã qua (= daysInMonth nếu tháng cũ)
  // Thu nhập
  totalIncome:      number
  // Chi tiêu
  spendingTotal:    number
  budgetAmount:     number
  budgetPercent:    number
  remainingBudget:  number
  avgDailySpend:    number   // chi tiêu trung bình mỗi ngày
  projectedSpend:   number   // dự kiến chi tiêu cả tháng theo pace hiện tại
  totalTransactions:number
  // Tất cả danh mục có chi tiêu
  allCategories:    { category: string; amount: number; percentOfSpending: number; percentOfIncome: number }[]
  // Tiết kiệm
  savingsDeposited: number
  savingsTarget:    number
  savingsPercent:   number   // % đã nạp so với mục tiêu
  // Nợ
  debtPaidTotal:      number
  totalDebtRemaining: number
  netBalance:         number
  alertDebts:         { name: string; remaining: number; dueDate: string | null; type: string }[]
}

const AMOUNT_MAX = 1_000_000_000

const FinanceSummarySchema = z.object({
  monthLabel:        z.string().max(50).transform(s => s.replace(/[<>"'`]/g, '')),
  isCurrentMonth:    z.boolean(),
  daysInMonth:       z.number().int().min(28).max(31),
  daysElapsed:       z.number().int().min(0).max(31),
  totalIncome:       z.number().min(0).max(AMOUNT_MAX),
  spendingTotal:     z.number().min(0).max(AMOUNT_MAX),
  budgetAmount:      z.number().min(0).max(AMOUNT_MAX),
  budgetPercent:     z.number().min(0).max(100000),
  remainingBudget:   z.number().max(AMOUNT_MAX),
  avgDailySpend:     z.number().min(0).max(AMOUNT_MAX),
  projectedSpend:    z.number().min(0).max(AMOUNT_MAX),
  totalTransactions: z.number().int().min(0).max(100000),
  allCategories:     z.array(z.object({
    category:          z.string().max(50),
    amount:            z.number().min(0).max(AMOUNT_MAX),
    percentOfSpending: z.number().min(0).max(100000),
    percentOfIncome:   z.number().min(0).max(100000),
  })).max(20),
  savingsDeposited:  z.number().min(0).max(AMOUNT_MAX),
  savingsTarget:     z.number().min(0).max(AMOUNT_MAX),
  savingsPercent:    z.number().min(0).max(100000),
  debtPaidTotal:     z.number().min(0).max(AMOUNT_MAX),
  totalDebtRemaining:z.number().min(0).max(AMOUNT_MAX),
  netBalance:        z.number().max(AMOUNT_MAX),
  alertDebts:        z.array(z.object({
    name:      z.string().max(100).transform(s => s.replace(/[<>"'`]/g, '')),
    remaining: z.number().min(0).max(AMOUNT_MAX),
    dueDate:   z.string().max(20).nullable(),
    type:      z.string().max(20),
  })).max(20),
})

function buildPrompt(data: FinanceSummaryInput): string {
  const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + '₫'
  const pct = (n: number) => Math.round(n) + '%'
  const catLabel = (val: string) => CATEGORIES.find(c => c.value === val)?.label ?? val

  const remainingDays = data.daysInMonth - data.daysElapsed

  // ── Ngữ cảnh thời gian ──────────────────────────────────────────────────────
  const timeCtx = data.isCurrentMonth
    ? `Hôm nay ngày ${data.daysElapsed}/${data.daysInMonth} — còn ${remainingDays} ngày trong tháng.`
    : `Tháng đã kết thúc (${data.daysInMonth} ngày).`

  // ── Chi tiêu & ngân sách ────────────────────────────────────────────────────
  const budgetLine = data.budgetAmount > 0
    ? `Đã chi ${fmt(data.spendingTotal)} / ngân sách ${fmt(data.budgetAmount)} (${pct(data.budgetPercent)}). Còn lại: ${fmt(data.remainingBudget)}.`
    : `Tổng chi tiêu: ${fmt(data.spendingTotal)} (chưa đặt ngân sách).`

  const projLine = data.isCurrentMonth && data.avgDailySpend > 0
    ? `Pace: ${fmt(data.avgDailySpend)}/ngày → dự kiến cả tháng: ${fmt(data.projectedSpend)}.`
    : ''

  // ── Danh mục chi tiêu (tất cả) ──────────────────────────────────────────────
  const catLines = data.allCategories.length > 0
    ? data.allCategories
        .map(c =>
          `  ${catLabel(c.category)}: ${fmt(c.amount)} — ${pct(c.percentOfSpending)} tổng chi / ${pct(c.percentOfIncome)} thu nhập`
        ).join('\n')
    : '  (chưa có chi tiêu)'

  // ── Tiết kiệm ────────────────────────────────────────────────────────────────
  const savingsLine = data.savingsTarget > 0
    ? `Đã nạp ${fmt(data.savingsDeposited)} / mục tiêu ${fmt(data.savingsTarget)} (${pct(data.savingsPercent)}).`
    : data.savingsDeposited > 0
      ? `Đã tiết kiệm ${fmt(data.savingsDeposited)} (chưa đặt mục tiêu).`
      : 'Chưa tiết kiệm tháng này.'

  // ── Nợ ───────────────────────────────────────────────────────────────────────
  const debtPaidLine = data.debtPaidTotal > 0 ? `Đã trả nợ: ${fmt(data.debtPaidTotal)}.` : ''
  const debtRemainingLine = data.totalDebtRemaining > 0
    ? `Tổng nợ còn lại: ${fmt(data.totalDebtRemaining)}.`
    : ''
  const alertDebtLines = data.alertDebts
    .map(d => {
      const dir = d.type === 'borrow' ? 'cần trả' : 'cần đòi'
      const due = d.dueDate ? ` (hạn ${d.dueDate})` : ' (chưa rõ hạn)'
      return `  ${d.name}: ${dir} ${fmt(d.remaining)}${due}`
    }).join('\n')

  // ── Hướng dẫn khuyến nghị theo thời điểm ────────────────────────────────────
  const recommendationGuide = (() => {
    if (!data.isCurrentMonth) {
      return `Đây là tháng đã kết thúc → tổng kết, đánh giá kết quả và đề xuất kế hoạch cụ thể cho tháng tới.`
    }
    if (remainingDays <= 5) {
      return `Còn ${remainingDays} ngày — gần hết tháng → đánh giá kết quả tháng này và đề xuất kế hoạch cho tháng tới.`
    }
    return `Còn ${remainingDays} ngày trong tháng → đưa ra khuyến nghị/cảnh báo CÓ THỂ THỰC HIỆN NGAY: danh mục nào cần kiềm chế, có kịp đạt mục tiêu tiết kiệm không, nợ nào cần ưu tiên xử lý.`
  })()

  return `Bạn là chuyên gia phân tích tài chính cá nhân. Phân tích toàn diện dữ liệu ${data.monthLabel} và đưa ra đánh giá chi tiết, thực chất bằng tiếng Việt.

=== DỮ LIỆU ===
${timeCtx}
Thu nhập: ${fmt(data.totalIncome)} | Số giao dịch chi tiêu: ${data.totalTransactions}
${budgetLine}
${projLine}
Số dư ròng: ${fmt(data.netBalance)}${data.netBalance < 0 ? ' ⚠️ ÂM' : ''}

Chi tiêu theo danh mục:
${catLines}

Tiết kiệm: ${savingsLine}
${debtPaidLine}
${debtRemainingLine}
${alertDebtLines ? `Nợ cần chú ý:\n${alertDebtLines}` : ''}

=== YÊU CẦU PHÂN TÍCH ===
Viết phân tích dạng văn xuôi tự nhiên, khoảng 8-12 câu, KHÔNG dùng bullet/markdown/tiêu đề, bao gồm đủ các phần theo thứ tự:

1. TỔNG QUAN: Nhận xét thu nhập, tổng chi, số dư — tháng này ổn hay đáng lo?
2. PHÂN TÍCH CHI TIÊU: Đi qua từng danh mục có chi tiêu — nhận xét mức nào hợp lý, mức nào đáng chú ý. Ngưỡng tham chiếu: <10% thu nhập = bình thường, 10-20% = đáng theo dõi, >20% = cần xem xét lại.
3. TIẾT KIỆM: Đánh giá tiến độ — đang đúng hướng hay cần tăng tốc?
4. NỢ: Nhắc cụ thể tên, số tiền, hạn nếu có nợ cần xử lý.
5. ĐIỂM MẠNH & ĐIỂM CẦN CẢI THIỆN: Dựa trên số liệu thực tế, không đánh giá chung chung.
6. KHUYẾN NGHỊ: ${recommendationGuide}

Nguyên tắc bắt buộc:
- Luôn trích dẫn số liệu, tỉ lệ cụ thể — không nói "chi nhiều" mà nói "chi X triệu, chiếm Y%".
- Xưng hô: "bạn". Giọng điệu: chuyên nghiệp, thẳng thắn, thân thiện — không phán xét nhưng không ngại nói thật.
- Chỉ trả về đoạn text thuần, không có gì khác.`
}

export async function POST(request: NextRequest) {
  let uid: string
  try {
    const decoded = await verifyIdToken(request)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit({ key: `${uid}:finance-summary`, limit: 20, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfter / 1000)) } },
    )
  }

  if (!process.env.GEMINI_API_KEY) {
    logger.error('finance-summary', 'GEMINI_API_KEY chưa cấu hình')
    return NextResponse.json({ error: 'AI chưa được cấu hình.' }, { status: 503 })
  }

  let data: FinanceSummaryInput
  try {
    const raw = await request.json()
    data = FinanceSummarySchema.parse(raw) as FinanceSummaryInput
  } catch {
    return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 })
  }

  try {
    const model   = getGeminiModel({ temperature: 0.7 })
    const result  = await model.generateContent(buildPrompt(data))
    const summary = result.response.text().trim()

    if (!summary) {
      return NextResponse.json({ error: 'AI không tạo được tóm tắt.' }, { status: 422 })
    }

    return NextResponse.json({ summary })
  } catch (err) {
    logger.error('finance-summary', 'Unhandled error', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Vui lòng thử lại.' }, { status: 500 })
  }
}
