import { NextRequest, NextResponse } from 'next/server'
import { getGeminiModel } from '@/lib/ai/gemini'
import { CATEGORIES } from '@/lib/types/expense'
import type { CategoryValue } from '@/lib/types/expense'

// Timeout Vercel serverless: 30s
export const maxDuration = 30

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB
const VALID_MIME   = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const VALID_CATS   = CATEGORIES.map(c => c.value) as string[]

const PROMPT = `Phân tích ảnh hóa đơn/biên lai này và trích xuất thông tin theo định dạng JSON.

Danh mục hợp lệ (chọn 1):
- food: nhà hàng, quán ăn, cà phê, giao đồ ăn
- transport: xăng, taxi, xe ôm, bãi đỗ xe, vé xe
- shopping: quần áo, điện tử, siêu thị, mua sắm chung
- entertainment: phim, game, thể thao, giải trí
- bills: điện, nước, internet, điện thoại, dịch vụ định kỳ
- health: thuốc, bệnh viện, phòng khám, gym
- education: sách, khóa học, học phí
- other: các khoản khác

Trả về JSON thuần (không markdown, không giải thích):
{
  "amount": <số tiền VND dạng số nguyên, không format>,
  "date": "<YYYY-MM-DD hoặc null nếu không có>",
  "category": "<một trong các danh mục trên>",
  "title": "<tên cửa hàng hoặc mô tả ngắn, tối đa 100 ký tự>",
  "note": "<thông tin thêm nếu có, tối đa 200 ký tự, có thể rỗng>"
}

Nếu không phải hóa đơn hoặc không đọc được, trả về: {"error": "Không thể nhận diện hóa đơn"}`

export async function POST(request: NextRequest) {
  // Auth guard: check session cookie (same mechanism as middleware)
  if (!request.cookies.has('auth_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // GEMINI_API_KEY guard — fail fast với message rõ ràng
  if (!process.env.GEMINI_API_KEY) {
    console.error('[scan-receipt] GEMINI_API_KEY chưa cấu hình')
    return NextResponse.json({ error: 'AI chưa được cấu hình.' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 })
  }

  const file = formData.get('image') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Thiếu ảnh hóa đơn.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Ảnh quá lớn (tối đa 4MB).' }, { status: 400 })
  }

  // Normalize mime type: HEIC không luôn được report đúng
  const mimeType = file.type || 'image/jpeg'
  if (!VALID_MIME.includes(mimeType) && !mimeType.startsWith('image/')) {
    return NextResponse.json({ error: 'File phải là ảnh (JPG, PNG, WEBP, HEIC).' }, { status: 400 })
  }

  try {
    const bytes  = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    // Client luôn compress sang JPEG — dùng 'image/jpeg' cứng để tránh mismatch
    const model  = getGeminiModel({ temperature: 0 })
    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
      { text: PROMPT },
    ])

    const raw = result.response.text().trim()

    // Tìm JSON object trong response — handles markdown blocks và thinking output
    const stripped  = raw.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim()
    const jsonMatch = stripped.match(/\{[\s\S]*\}/)
    const jsonText  = jsonMatch ? jsonMatch[0] : stripped

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error('[scan-receipt] Gemini returned non-JSON:', raw)
      return NextResponse.json({ error: 'AI không trả về kết quả hợp lệ.' }, { status: 422 })
    }

    if (parsed.error) {
      return NextResponse.json({ error: String(parsed.error) }, { status: 422 })
    }

    // Validate & sanitize từng field
    const amount = typeof parsed.amount === 'number' && parsed.amount > 0
      ? Math.round(parsed.amount)
      : null

    const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : null

    const category: CategoryValue = VALID_CATS.includes(String(parsed.category))
      ? (parsed.category as CategoryValue)
      : 'other'

    const title = typeof parsed.title === 'string' ? parsed.title.slice(0, 100).trim() : ''
    const note  = typeof parsed.note  === 'string' ? parsed.note.slice(0, 200).trim() : ''

    return NextResponse.json({ amount, date, category, title, note })

  } catch (err) {
    console.error('[scan-receipt] Error:', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Vui lòng thử lại.' }, { status: 500 })
  }
}
