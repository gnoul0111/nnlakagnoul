import { NextRequest, NextResponse } from 'next/server'
import { getGeminiModel } from '@/lib/ai/gemini'
import { CATEGORIES } from '@/lib/types/expense'

export const maxDuration = 30

// Shape của data gửi lên từ client
export interface FinanceSummaryInput {
  monthLabel:      string   // "tháng 5/2025"
  totalIncome:     number
  spendingTotal:   number
  budgetAmount:    number
  budgetPercent:   number   // 0-100+
  savingsDeposited:number
  savingsTarget:   number
  debtPaidTotal:   number
  netBalance:      number
  topCategories:   { category: string; amount: number; percent: number }[]
  alertDebts:      { name: string; remaining: number; dueDate: string | null; type: string }[]
}

function buildPrompt(data: FinanceSummaryInput): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('vi-VN').format(Math.round(n)) + '₫'

  const catLabel = (val: string) =>
    CATEGORIES.find(c => c.value === val)?.label ?? val

  const topCats = data.topCategories
    .slice(0, 4)
    .map(c => `${catLabel(c.category)} ${fmt(c.amount)} (${c.percent}%)`)
    .join(', ')

  const debtLines = data.alertDebts
    .slice(0, 3)
    .map(d => {
      const dir = d.type === 'borrow' ? 'cần trả' : 'cần đòi'
      const due = d.dueDate ? ` (hạn ${d.dueDate})` : ''
      return `${d.name} ${dir} ${fmt(d.remaining)}${due}`
    })
    .join('; ')

  const savingsLine = data.savingsTarget > 0
    ? `Tiết kiệm: đã nạp ${fmt(data.savingsDeposited)} / mục tiêu ${fmt(data.savingsTarget)}`
    : `Tiết kiệm: ${fmt(data.savingsDeposited)}`

  const budgetLine = data.budgetAmount > 0
    ? `Ngân sách chi tiêu: ${fmt(data.spendingTotal)} / ${fmt(data.budgetAmount)} (${data.budgetPercent}%)`
    : `Tổng chi tiêu: ${fmt(data.spendingTotal)}`

  return `Bạn là trợ lý tài chính cá nhân thân thiện. Hãy phân tích dữ liệu và tóm tắt bằng tiếng Việt, giọng điệu tự nhiên như đang nói chuyện trực tiếp, thân thiện, ngắn gọn.

Dữ liệu tài chính ${data.monthLabel}:
- Thu nhập: ${fmt(data.totalIncome)}
- ${budgetLine}
- ${savingsLine}
${data.debtPaidTotal > 0 ? `- Đã trả nợ: ${fmt(data.debtPaidTotal)}` : ''}
- Số dư ròng: ${fmt(data.netBalance)}
${topCats ? `- Chi theo danh mục: ${topCats}` : ''}
${debtLines ? `- Nợ cần chú ý: ${debtLines}` : ''}

Yêu cầu:
1. Viết 3-5 câu liên tục, dạng đoạn văn xuôi tự nhiên (không dùng bullet points, không markdown, không tiêu đề)
2. Bao gồm: tình hình tổng quan, điểm nổi bật (tốt hoặc cần cải thiện), nhắc nợ nếu có
3. Xưng hô: gọi người dùng là "bạn"
4. Giọng điệu: tích cực, khích lệ, như người bạn quan tâm, không phán xét
5. Kết thúc bằng 1 gợi ý nhỏ hoặc câu động viên
6. Chỉ trả về đoạn text, không có gì khác`
}

export async function POST(request: NextRequest) {
  if (!request.cookies.has('auth_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[finance-summary] GEMINI_API_KEY chưa cấu hình')
    return NextResponse.json({ error: 'AI chưa được cấu hình.' }, { status: 503 })
  }

  let data: FinanceSummaryInput
  try {
    data = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 })
  }

  try {
    const model  = getGeminiModel()
    const result = await model.generateContent(buildPrompt(data))
    const summary = result.response.text().trim()

    if (!summary) {
      return NextResponse.json({ error: 'AI không tạo được tóm tắt.' }, { status: 422 })
    }

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[finance-summary] Error:', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Vui lòng thử lại.' }, { status: 500 })
  }
}
