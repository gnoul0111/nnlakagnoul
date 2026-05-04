import { Timestamp } from 'firebase/firestore'
import { COLLECTIONS, queryDocuments, setDocument, updateDocument, deleteDocument, where } from '@/lib/firebase/firestore'
import type { WorkCalendarEvent, CalendarEventCategory } from '@/lib/types/settings'
import { newEventId } from '@/lib/utils/id'

// Work calendar dùng direct write (không qua event sourcing)
// Collection: work_calendar

export interface AddCalendarEventInput {
  title: string
  category: CalendarEventCategory
  date: string    // YYYY-MM-DD
  time?: string   // HH:mm
  note?: string
  reminder?: boolean
}

export async function addCalendarEvent(
  userId: string,
  input: AddCalendarEventInput,
): Promise<string> {
  const id = newEventId()
  const event: WorkCalendarEvent = {
    id,
    userId,
    title: input.title,
    category: input.category,
    date: input.date,
    time: input.time,
    note: input.note ?? '',
    reminder: input.reminder ?? false,
    createdAt: Timestamp.now(),
  }

  await setDocument(COLLECTIONS.WORK_CALENDAR, id, event)
  return id
}

export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<Omit<WorkCalendarEvent, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDocument(COLLECTIONS.WORK_CALENDAR, eventId, updates)
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await deleteDocument(COLLECTIONS.WORK_CALENDAR, eventId)
}

export async function getCalendarEventsByUser(
  userId: string,
): Promise<WorkCalendarEvent[]> {
  return queryDocuments<WorkCalendarEvent>(COLLECTIONS.WORK_CALENDAR, [
    where('userId', '==', userId),
  ])
}

export async function getCalendarEventsByMonth(
  userId: string,
  monthKey: string, // YYYY-MM
): Promise<WorkCalendarEvent[]> {
  const all = await getCalendarEventsByUser(userId)
  return all.filter(e => e.date.startsWith(monthKey))
}
