import { NextRequest, NextResponse } from 'next/server'
import { getGeminiModel, SchemaType } from '@/lib/ai/gemini'
import type { Schema } from '@/lib/ai/gemini'
import { CATEGORIES } from '@/lib/types/expense'
import type { CategoryValue } from '@/lib/types/expense'

export const maxDuration = 30

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB
const VALID_CATS    = CATEGORIES.map(c => c.value) as string[]

// Schema cứng buộc Gemini output đúng structure — không cần parse thủ công
const RECEIPT_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    amount: {
      type: SchemaType.NUMBER,
      description: 'Số tiền VND dạng số nguyên. Bằng 0 nếu không đọc được.',
    },
    date: {
      type: SchemaType.STRING,
      description: 'Ngày trên hóa đơn định dạng YYYY-MM-DD. Chuỗi rỗng nếu không có.',
    },
    category: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['food', 'transport', 'shopping', 'entertainment', 'bills', 'health', 'education', 'other'],
      description: 'Danh mục phù hợp nhất với nội dung hóa đơn.',
    },
    title: {
      type: SchemaType.STRING,
      description: 'Tên cửa hàng hoặc mô tả ngắn, tối đa 100 ký tự. Trả về "__INVALID__" nếu ảnh không phải hóa đơn hoặc không đọc được.',
    },
    note: {
      type: SchemaType.STRING,
      description: 'Thông tin thêm từ hóa đơn nếu có. Để trống nếu không có gì thêm.',
    },
  },
  required: ['amount', 'date', 'category', 'title', 'note'],
}

// Prompt ngắn gọn — schema đã enforce format, prompt chỉ cần hướng dẫn logic
const PROMPT = `Bạn là AI chuyên đọc hóa đơn/biên lai Việt Nam. Trích xuất thông tin từ ảnh.

Hướng dẫn:
- amount: tổng tiền cần thanh toán (VND). Dùng 0 nếu không đọc được.
- date: ngày ghi trên hóa đơn (YYYY-MM-DD). Dùng "" nếu không có.
- category: chọn theo loại hàng hóa/dịch vụ (food/transport/shopping/entertainment/bills/health/education/other).
- title: tên cửa hàng hoặc mô tả ngắn. Dùng "__INVALID__" nếu ảnh không phải hóa đơn hoặc quá mờ để đọc.
- note: thông tin thêm hữu ích (mặt hàng chính, địa chỉ...). Để trống nếu không có.`

export async function POST(request: NextRequest) {
  if (!request.cookies.has('auth_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  if (!file) return NextResponse.json({ error: 'Thiếu ảnh hóa đơn.' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Ảnh quá lớn (tối đa 4MB).' }, { status: 400 })

  try {
    const bytes  = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    // disableThinking: tắt thinking của gemini-2.5-flash → giảm latency 2-5s cho extraction task
    // responseSchema: JSON mode → output luôn hợp lệ, không cần regex parse
    const model  = getGeminiModel({ temperature: 0, responseSchema: RECEIPT_SCHEMA, disableThinking: true })
    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
      { text: PROMPT },
    ])

    // Với JSON mode, response.text() luôn là valid JSON — không cần strip markdown hay regex
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(result.response.text())
    } catch {
      console.error('[scan-receipt] JSON parse failed:', result.response.text())
      return NextResponse.json({ error: 'AI không trả về kết quả hợp lệ.' }, { status: 422 })
    }

    if (parsed.title === '__INVALID__') {
      return NextResponse.json({ error: 'Không thể nhận diện hóa đơn.' }, { status: 422 })
    }

    const amount = typeof parsed.amount === 'number' && parsed.amount > 0
      ? Math.round(parsed.amount)
      : null

    const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : null

    const category: CategoryValue = VALID_CATS.includes(String(parsed.category))
      ? (parsed.category as CategoryValue)
      : 'other'

    const title = String(parsed.title || '').slice(0, 100).trim()
    const note  = String(parsed.note  || '').slice(0, 200).trim()

    return NextResponse.json({ amount, date, category, title, note })

  } catch (err) {
    console.error('[scan-receipt] Error:', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Vui lòng thử lại.' }, { status: 500 })
  }
}
