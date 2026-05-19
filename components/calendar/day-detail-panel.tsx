'use client'

import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { DayView } from './day-view'
import { formatDateLong } from '@/lib/utils/date'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import type { CalendarMode } from './calendar-header'

interface DayDetailPanelProps {
  dateStr:        string | null
  mode:           CalendarMode
  calendarEvents: WorkCalendarEvent[]
  onClose:        () => void
  onEditEvent:    (event: WorkCalendarEvent) => void
  onDeleteEvent:  (event: WorkCalendarEvent) => void
  onAddExpense:   (date: string) => void
  onAddEvent:     (date: string) => void
}

export function DayDetailPanel({
  dateStr, mode, calendarEvents,
  onClose, onEditEvent, onDeleteEvent, onAddExpense, onAddEvent,
}: DayDetailPanelProps) {
  if (!dateStr) return null

  const handleAdd = () =>
    mode === 'finance' ? onAddExpense(dateStr) : onAddEvent(dateStr)

  return (
    <Modal open title={formatDateLong(dateStr)} onClose={onClose}>
      {/* Sub-header with add button */}
      <div className="flex items-center justify-end px-4 pb-3">
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={handleAdd}>
          {mode === 'finance' ? 'Thêm chi tiêu' : 'Thêm sự kiện'}
        </Button>
      </div>

      {/* Day content */}
      <div className="max-h-[55vh] overflow-y-auto">
        <DayView
          dateStr={dateStr}
          mode={mode}
          calendarEvents={calendarEvents}
          onEditEvent={e => { onClose(); onEditEvent(e) }}
          onDeleteEvent={e => { onClose(); onDeleteEvent(e) }}
        />
      </div>
    </Modal>
  )
}
