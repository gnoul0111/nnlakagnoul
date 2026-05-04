import { appendEvent } from './eventService'
import { EVENT_TYPES } from '@/lib/types/events'
import { newIncomeId } from '@/lib/utils/id'
import { today, getMonthFromDateString } from '@/lib/utils/date'

export interface AddIncomeInput {
  amount: number
  source: string
  date?: string
  note?: string
}

export async function addIncome(
  userId: string,
  input: AddIncomeInput,
): Promise<string> {
  const id = newIncomeId()
  const date = input.date ?? today()

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.INCOME_ADDED,
    createdAt: new Date().toISOString(),
    data: {
      id,
      userId,
      amount: input.amount,
      source: input.source,
      date,
      month: getMonthFromDateString(date),
      note: input.note ?? '',
    },
  })

  return id
}

export async function deleteIncome(
  userId: string,
  incomeId: string,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.INCOME_DELETED,
    createdAt: new Date().toISOString(),
    data: {
      id: incomeId,
      deletedAt: new Date().toISOString(),
    },
  })
}
