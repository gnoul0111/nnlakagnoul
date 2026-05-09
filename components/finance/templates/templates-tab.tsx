'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Zap } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { useAppData } from '@/hooks/useAppData'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useSync } from '@/hooks/useSync'
import { useToast } from '@/hooks/useToast'
import { createTemplate, deleteTemplate, useTemplate } from '@/lib/services/templateService'
import { CATEGORIES, type CategoryValue } from '@/lib/types/expense'
import type { Template } from '@/lib/types/template'
import { parseAmount, formatMoney } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

const schema = z.object({
  title:    z.string().min(1, 'Nhập tên biểu mẫu.'),
  category: z.string().min(1, 'Chọn danh mục.'),
  amount:   z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
  note:     z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

export function TemplatesTab() {
  const user        = useAuthStore(s => s.user)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const sync        = useSync()
  const toast       = useToast()
  const { templates } = useAppData()

  const [formOpen, setFormOpen]         = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [saving, setSaving]             = useState(false)
  const [usingId, setUsingId]           = useState<string | null>(null)

  const active = templates.filter(t => !t.deleted)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'bills' },
  })
  const selectedCat = watch('category') as CategoryValue

  const onSubmit = async (values: FormValues) => {
    if (!user) return
    setSaving(true)
    await createTemplate(user.uid, { title: values.title, category: values.category as CategoryValue, amount: parseAmount(values.amount), note: values.note })
    await sync()
    setSaving(false)
    reset({ category: 'bills' })
    setFormOpen(false)
    toast.success('Đã tạo biểu mẫu!')
  }

  const handleUse = async (template: Template) => {
    if (!user) return
    setUsingId(template.id)
    await useTemplate(user.uid, template)
    await sync()
    setUsingId(null)
    toast.success(`Đã thêm chi tiêu "${template.title}"!`)
  }

  const handleDelete = async () => {
    if (!user || !deleteTarget) return
    await deleteTemplate(user.uid, deleteTarget.id)
    await sync()
    setDeleteTarget(null)
    toast.success('Đã xóa biểu mẫu.')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{active.length} biểu mẫu</h2>
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => { reset({ category: 'bills' }); setFormOpen(true) }}>Thêm</Button>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <span className="text-4xl">📋</span>
          <p className="text-sm text-muted-foreground">Chưa có biểu mẫu nào</p>
          <p className="text-xs text-muted-foreground text-center">Tạo biểu mẫu để thêm chi tiêu cố định 1 click</p>
          <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>Tạo biểu mẫu đầu tiên</Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {active.map((tpl, i) => {
            const cat = catMap[tpl.category] ?? catMap.other
            return (
              <div key={tpl.id} className={cn('flex items-center gap-3 px-4 py-3', i < active.length - 1 && 'border-b border-border/50')}>
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-base shrink-0">{cat.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tpl.title}</p>
                  <p className="text-xs text-muted-foreground">{cat.label}{tpl.note ? ` · ${tpl.note}` : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn('text-sm font-semibold text-foreground mr-1', moneyHidden && 'blur-sm')}>
                    {formatMoney(tpl.amount, moneyHidden)}
                  </span>
                  <button onClick={() => handleUse(tpl)} disabled={usingId === tpl.id}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50">
                    <Zap className="w-3 h-3" />
                    {usingId === tpl.id ? '...' : 'Dùng'}
                  </button>
                  <button onClick={() => setDeleteTarget(tpl)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal variant="center" open={formOpen} onClose={() => setFormOpen(false)} title="Tạo biểu mẫu">
        <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
          <FormField label="Tên biểu mẫu" error={errors.title?.message} required>
            <Input placeholder="Internet, Tiền điện, Gym..." autoFocus {...register('title')} />
          </FormField>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Danh mục</p>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.value} type="button" onClick={() => setValue('category', cat.value)}
                  className={cn('flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-medium transition-colors',
                    selectedCat === cat.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}>
                  <span className="text-xl">{cat.icon}</span>
                  <span className="leading-tight text-center">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Số tiền (₫)" error={errors.amount?.message} required>
              <AmountInput placeholder="0" {...register('amount')} />
            </FormField>
            <FormField label="Ghi chú">
              <Input placeholder="Tùy chọn" {...register('note')} />
            </FormField>
          </div>
          <Button type="submit" className="w-full" size="lg" loading={saving}>Tạo biểu mẫu</Button>
        </form>
      </Modal>

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={`Xóa biểu mẫu "${deleteTarget?.title}"?`} confirmLabel="Xóa" danger />
    </div>
  )
}