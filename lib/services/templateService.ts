import { appendEvent } from './eventService'
import { addExpense } from './expenseService'
import { EVENT_TYPES } from '@/lib/types/events'
import type { CategoryValue } from '@/lib/types/expense'
import type { Template } from '@/lib/types/template'
import { newTemplateId } from '@/lib/utils/id'
import { today } from '@/lib/utils/date'

// ─── Template CRUD ────────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  title: string
  category: CategoryValue
  amount: number
  note?: string
}

export async function createTemplate(
  userId: string,
  input: CreateTemplateInput,
): Promise<string> {
  const id = newTemplateId()

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.TEMPLATE_CREATED,
    createdAt: new Date().toISOString(),
    data: {
      id,
      userId,
      title: input.title,
      category: input.category,
      amount: input.amount,
      note: input.note ?? '',
    },
  })

  return id
}

export async function deleteTemplate(
  userId: string,
  templateId: string,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.TEMPLATE_DELETED,
    createdAt: new Date().toISOString(),
    data: { id: templateId },
  })
}

/**
 * Dùng template 1 click → tạo expense ngày hôm nay ngay lập tức
 */
export async function useTemplate(
  userId: string,
  template: Template,
  overrides: { date?: string } = {},
): Promise<string> {
  return addExpense(userId, {
    amount: template.amount,
    category: template.category,
    date: overrides.date ?? today(),
    note: template.note || template.title,
  })
}
