'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { AmountInput } from '@/components/ui/amount-input'
import { useToast } from '@/hooks/useToast'
import {
  addGroupEntry, updateGroupEntry,
} from '@/lib/services/groupService'
import {
  buildSplits, isSplitsValid, splitsTotal,
  type Group, type GroupEntry, type SplitMode,
} from '@/lib/types/group'
import { parseAmount, formatAmount } from '@/lib/utils/currency'
import { today } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

interface Props {
  open:        boolean
  onClose:     () => void
  group:       Group
  currentUid:  string
  edit?:       GroupEntry | null
  onSaved:     () => void
}

const MODE_LABELS: Record<SplitMode, string> = {
  equal:   'Chia đều',
  percent: 'Theo %',
  custom:  'Nhập tay',
}

export function GroupEntryModal({ open, onClose, group, currentUid, edit, onSaved }: Props) {
  const toast = useToast()
  const memberUids = group.memberUids
  const nameOf = (uid: string) => group.members[uid]?.name ?? 'Thành viên'

  const [payerUid, setPayerUid] = useState(currentUid)
  const [totalRaw, setTotalRaw] = useState('')
  const [note, setNote]         = useState('')
  const [date, setDate]         = useState(today())
  const [mode, setMode]         = useState<SplitMode>('equal')
  const [parts, setParts]       = useState<string[]>(memberUids)
  const [percents, setPercents] = useState<Record<string, number>>({})
  const [customs, setCustoms]   = useState<Record<string, number>>({})
  const [busy, setBusy]         = useState(false)

  // Nạp giá trị khi mở (add: mặc định; edit: từ khoản cũ)
  useEffect(() => {
    if (!open) return
    if (edit) {
      setPayerUid(edit.payerUid)
      setTotalRaw(String(edit.total))
      setNote(edit.note)
      setDate(edit.date)
      setMode(edit.splitMode)
      setParts(edit.splits.map(s => s.uid))
      setCustoms(Object.fromEntries(edit.splits.map(s => [s.uid, s.amount])))
      setPercents(Object.fromEntries(edit.splits.map(s => [s.uid, edit.total > 0 ? Math.round((s.amount / edit.total) * 100) : 0])))
    } else {
      setPayerUid(currentUid)
      setTotalRaw('')
      setNote('')
      setDate(today())
      setMode('equal')
      setParts(memberUids)
      setPercents({})
      setCustoms({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const total = parseAmount(totalRaw)

  const splits = useMemo(
    () => buildSplits(total, mode, parts, mode === 'percent' ? percents : customs),
    [total, mode, parts, percents, customs],
  )

  const pctSum = parts.reduce((s, uid) => s + (percents[uid] ?? 0), 0)

  const valid = useMemo(() => {
    if (parts.length === 0 || total <= 0) return false
    if (mode === 'percent' && Math.abs(pctSum - 100) > 0.5) return false
    if (!isSplitsValid(splits, total)) return false
    return true
  }, [parts, total, mode, pctSum, splits])

  const togglePart = (uid: string) => {
    setParts(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid])
  }

  const handleSave = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      if (edit) {
        await updateGroupEntry(
          currentUid,
          { ...edit, payerUid, total, note, date, splitMode: mode, splits,
            participants: Array.from(new Set([payerUid, currentUid, ...splits.map(s => s.uid)])) },
          edit.participants,
        )
        toast.success('Đã cập nhật khoản.')
      } else {
        await addGroupEntry(currentUid, {
          groupId: group.id, payerUid, total, note, date, splitMode: mode, splits,
        })
        toast.success('Đã thêm khoản chung.')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[group-entry] save failed:', err)
      toast.error('Không lưu được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal variant="center" open={open} onClose={onClose} title={edit ? 'Sửa khoản chung' : 'Thêm khoản chung'} className="max-w-lg">
      <div className="px-4 pb-6 space-y-4">
        {/* Người trả */}
        <FormField label="Người trả" required>
          <div className="flex flex-wrap gap-2">
            {memberUids.map(uid => (
              <button
                key={uid} type="button" onClick={() => setPayerUid(uid)}
                className={cn('px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                  payerUid === uid ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
              >
                {nameOf(uid)}{uid === currentUid ? ' (bạn)' : ''}
              </button>
            ))}
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tổng tiền (₫)" required>
            <AmountInput placeholder="0" value={totalRaw} onChange={e => setTotalRaw(e.target.value)} />
          </FormField>
          <FormField label="Ngày" required>
            <DatePicker value={date} onChange={setDate} />
          </FormField>
        </div>

        <FormField label="Ghi chú">
          <Input placeholder="Đi chợ, ăn tối..." value={note} onChange={e => setNote(e.target.value)} />
        </FormField>

        {/* Người tham gia chia */}
        <FormField label={`Người tham gia (${parts.length})`} required>
          <div className="flex flex-wrap gap-2">
            {memberUids.map(uid => (
              <button
                key={uid} type="button" onClick={() => togglePart(uid)}
                className={cn('px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                  parts.includes(uid) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
              >
                {nameOf(uid)}
              </button>
            ))}
          </div>
        </FormField>

        {/* Kiểu chia */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Cách chia</p>
          <div className="flex gap-2">
            {(Object.keys(MODE_LABELS) as SplitMode[]).map(m => (
              <button
                key={m} type="button" onClick={() => setMode(m)}
                className={cn('flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                  mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Bảng chia */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          {parts.length === 0 && <p className="text-sm text-muted-foreground text-center">Chọn ít nhất 1 người tham gia.</p>}
          {parts.map(uid => {
            const share = splits.find(s => s.uid === uid)?.amount ?? 0
            return (
              <div key={uid} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-foreground truncate">{nameOf(uid)}</span>
                {mode === 'percent' && (
                  <input
                    type="number" inputMode="numeric" min={0} max={100}
                    value={percents[uid] ?? ''} placeholder="0"
                    onChange={e => setPercents(p => ({ ...p, [uid]: Number(e.target.value) || 0 }))}
                    className="w-16 h-9 rounded-md border border-input bg-background px-2 text-sm text-right"
                  />
                )}
                {mode === 'percent' && <span className="text-xs text-muted-foreground w-4">%</span>}
                {mode === 'custom' && (
                  <AmountInput
                    value={String(customs[uid] ?? '')}
                    onChange={e => setCustoms(c => ({ ...c, [uid]: parseAmount(e.target.value) }))}
                    className="w-28 h-9 text-right"
                  />
                )}
                <span className={cn('text-sm font-semibold w-24 text-right', mode === 'equal' ? 'text-foreground' : 'text-muted-foreground')}>
                  {formatAmount(share)} ₫
                </span>
              </div>
            )
          })}

          {/* Tổng kiểm tra */}
          {parts.length > 0 && (
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
              <span className="text-muted-foreground">
                {mode === 'percent' ? `Tổng %: ${pctSum}` : `Tổng chia: ${formatAmount(splitsTotal(splits))} ₫`}
              </span>
              <span className={cn('font-semibold', valid ? 'text-success' : 'text-destructive')}>
                {valid ? '✓ Khớp' : mode === 'percent' && Math.abs(pctSum - 100) > 0.5 ? 'Tổng % phải = 100' : 'Chưa khớp tổng tiền'}
              </span>
            </div>
          )}
        </div>

        <Button className="w-full" size="lg" loading={busy} disabled={!valid} onClick={handleSave}>
          {edit ? 'Lưu thay đổi' : 'Thêm khoản'}
        </Button>
      </div>
    </Modal>
  )
}
