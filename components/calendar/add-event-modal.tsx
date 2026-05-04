'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Bell, AlertCircle, Trash2 } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { useAuthStore } from '@/lib/store/authStore'
import { useToast } from '@/hooks/useToast'
import {
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '@/lib/services/calendarService'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import { today } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  title:    z.string().min(1, 'Nhập tiêu đề.'),
  category: z.enum(['work', 'personal', 'health', 'other']),
  date:     z.string().min(1, 'Chọn ngày.'),
  time:     z.string().optional(),
  note:     z.string().optional(),
  reminder: z.boolean(),
})
type FormValues = z.infer<typeof schema>

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'work'     as const, label: 'Công việc', icon: '💼' },
  { value: 'personal' as const, label: 'Cá nhân',   icon: '👤' },
  { value: 'health'   as const, label: 'Sức khỏe',  icon: '❤️' },
  { value: 'other'    as const, label: 'Khác',       icon: '⭐' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddEventModalProps {
  open:         boolean
  defaultDate?: string
  editEvent?:   WorkCalendarEvent | null
  onClose:      () => void
  onSuccess:    () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddEventModal({
  open, defaultDate, editEvent, onClose, onSuccess,
}: AddEventModalProps) {
  const user  = useAuthStore(s => s.user)
  const toast = useToast()

  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]       = useState(false)

  const {
    register, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'work',
      date:     defaultDate ?? today(),
      reminder: false,
    },
  })

  const selectedCategory = watch('category')
  const reminder         = watch('reminder')
  const timeValue        = watch('time')

  // Sync form when modal opens
  useEffect(() => {
    if (!open) return
    if (editEvent) {
      reset({
        title:    editEvent.title,
        category: editEvent.category,
        date:     editEvent.date,
        time:     editEvent.time ?? '',
        note:     editEvent.note,
        reminder: editEvent.reminder,
      })
    } else {
      reset({
        category: 'work',
        date:     defaultDate ?? today(),
        reminder: false,
        title:    '',
        time:     '',
        note:     '',
      })
    }
  }, [open, editEvent, defaultDate, reset])

  const onSubmit = async (values: FormValues) => {
    if (!user) return
    setSaving(true)
    try {
      if (editEvent) {
        await updateCalendarEvent(editEvent.id, {
          title:    values.title,
          category: values.category,
          date:     values.date,
          time:     values.time || undefined,
          note:     values.note ?? '',
          reminder: values.reminder,
        })
        toast.success('Đã cập nhật sự kiện')
      } else {
        await addCalendarEvent(user.uid, {
          title:    values.title,
          category: values.category,
          date:     values.date,
          time:     values.time || undefined,
          note:     values.note,
          reminder: values.reminder,
        })
        toast.success('Đã thêm sự kiện')
      }
      onSuccess()
      onClose()
    } catch {
      toast.error('Có lỗi xảy ra, thử lại sau')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editEvent) return
    setDeleting(true)
    try {
      await deleteCalendarEvent(editEvent.id)
      toast.success('Đã xóa sự kiện')
      onSuccess()
      onClose()
    } catch {
      toast.error('Xóa thất bại')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <Modal variant="center"
        open={open}
        onClose={onClose}
        title={editEvent ? 'Sửa sự kiện' : 'Thêm sự kiện'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4 pb-6">
          {/* Title */}
          <FormField label="Tiêu đề" error={errors.title?.message} required>
            <Input
              {...register('title')}
              placeholder="Nhập tiêu đề sự kiện"
              autoFocus
            />
          </FormField>

          {/* Category picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Loại <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('category', opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border text-xs font-medium transition-colors',
                    selectedCategory === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span className="text-xl leading-none">{opt.icon}</span>
                  <span className="text-[10px] leading-tight text-center">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ngày" error={errors.date?.message} required>
              <DatePicker value={watch('date')} onChange={v => setValue('date', v)} />
            </FormField>
            <FormField label="Giờ (tùy chọn)">
              <Input type="time" {...register('time')} />
            </FormField>
          </div>

          {/* Note */}
          <FormField label="Ghi chú">
            <Input {...register('note')} placeholder="Thêm ghi chú..." />
          </FormField>

          {/* Reminder toggle */}
          <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-muted">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Nhắc nhở</span>
            </div>
            <button
              type="button"
              onClick={() => setValue('reminder', !reminder)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors duration-200',
                reminder ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
              aria-checked={reminder}
              role="switch"
            >
              <span className={cn(
                'absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200',
                reminder ? 'left-[23px]' : 'left-[3px]',
              )} />
            </button>
          </div>

          {/* Reminder warning — nếu bật reminder nhưng chưa nhập giờ */}
          {reminder && !timeValue && (
            <div className="flex items-center gap-2 text-xs bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))] rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Vui lòng nhập giờ để tính năng nhắc nhở hoạt động đúng.</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {editEvent && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                aria-label="Xóa sự kiện"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose} size="md">
              Hủy
            </Button>
            <Button type="submit" loading={saving} size="md">
              {editEvent ? 'Lưu thay đổi' : 'Thêm sự kiện'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Xóa sự kiện?"
        message={`Bạn có chắc muốn xóa "${editEvent?.title}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        danger
        loading={deleting}
      />
    </>
  )
}