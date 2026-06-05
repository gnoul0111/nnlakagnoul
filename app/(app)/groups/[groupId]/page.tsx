'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Copy, Check, ArrowLeft, Users, AlertTriangle, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ConfirmModal } from '@/components/ui/modal'
import { GroupEntryModal } from '@/components/groups/group-entry-modal'
import { GroupManageModal } from '@/components/groups/group-manage-modal'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useGroupStore } from '@/lib/store/groupStore'
import { useAppData } from '@/hooks/useAppData'
import { useSync } from '@/hooks/useSync'
import { useToast } from '@/hooks/useToast'
import { deleteGroupEntry } from '@/lib/services/groupService'
import {
  pullAsExpense, pullAsDebt, undoPull, skipEntry, unskipEntry, resyncShare, findLinkedExpense,
} from '@/lib/services/groupBridge'
import { shareOf, statusOf, type GroupEntry, type EntryStatus } from '@/lib/types/group'
import { formatMoney } from '@/lib/utils/currency'
import { formatDateVN } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

const STATUS_META: Record<EntryStatus, { label: string; cls: string }> = {
  pending: { label: 'Chờ',      cls: 'bg-muted text-muted-foreground' },
  done:    { label: 'Đã xử lý', cls: 'bg-success/10 text-success'     },
  skipped: { label: 'Bỏ qua',   cls: 'bg-warning/10 text-warning'     },
}

export default function GroupDetailPage() {
  const router  = useRouter()
  const { groupId } = useParams<{ groupId: string }>()
  const user    = useAuthStore(s => s.user)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const toast   = useToast()
  const sync    = useSync()
  const { expenses } = useAppData()

  const group          = useGroupStore(s => s.currentGroup)
  const entries        = useGroupStore(s => s.entries)
  const entriesLoading = useGroupStore(s => s.entriesLoading)
  const selectGroup    = useGroupStore(s => s.selectGroup)
  const refreshEntries = useGroupStore(s => s.refreshEntries)
  const refreshGroupMeta = useGroupStore(s => s.refreshGroupMeta)
  const dropGroup      = useGroupStore(s => s.dropGroup)
  const stopRealtime   = useGroupStore(s => s.stopRealtime)

  const [entryModal, setEntryModal] = useState<{ open: boolean; edit?: GroupEntry | null }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<GroupEntry | null>(null)
  const [copied, setCopied] = useState(false)
  const [busyEntry, setBusyEntry] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  useEffect(() => {
    if (user && groupId) selectGroup(groupId, user.uid)
    // PHA B: dừng realtime listener khi rời trang nhóm (chống leak listener)
    return () => stopRealtime()
  }, [user, groupId, selectGroup, stopRealtime])

  const nameOf = (uid: string) => group?.members[uid]?.name ?? 'Thành viên'

  // Phần chưa xử lý: chỉ tính entries còn 'pending' của từng người.
  // net > 0 = họ chưa xử lý phần của họ (họ còn nợ anh); net < 0 = anh chưa xử lý (anh còn nợ họ).
  const settlement = useMemo(() => {
    if (!user) return [] as { uid: string; net: number }[]
    const net: Record<string, number> = {}
    for (const e of entries) {
      if (!e.participants.includes(user.uid)) continue
      if (e.payerUid === user.uid) {
        for (const s of e.splits) {
          if (s.uid !== user.uid && statusOf(e, s.uid) === 'pending')
            net[s.uid] = (net[s.uid] ?? 0) + s.amount
        }
      } else {
        const myS = shareOf(e, user.uid)
        if (myS > 0 && statusOf(e, user.uid) === 'pending')
          net[e.payerUid] = (net[e.payerUid] ?? 0) - myS
      }
    }
    return Object.entries(net)
      .map(([uid, n]) => ({ uid, net: n }))
      .filter(x => Math.abs(x.net) > 0)
      .sort((a, b) => b.net - a.net)
  }, [entries, user])

  const copyCode = async () => {
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('Không sao chép được.') }
  }

  const deleteWarning = useMemo(() => {
    if (!deleteTarget || !user) return undefined
    const pulled = deleteTarget.splits
      .filter(s => s.uid !== user.uid && statusOf(deleteTarget, s.uid) === 'done')
      .map(s => nameOf(s.uid))
    if (!pulled.length) return undefined
    return `${pulled.join(', ')} đã kéo khoản này vào sổ. Sau khi xoá, họ cần tự xoá trong Tài chính.`
  }, [deleteTarget, user, group]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!user || !deleteTarget) return
    try {
      const linked = findLinkedExpense(deleteTarget.id, expenses)
      if (linked) await undoPull(user.uid, deleteTarget, linked)
      await deleteGroupEntry(user.uid, deleteTarget)
      await refreshEntries(user.uid)
      setDeleteTarget(null)
      toast.success('Đã xóa khoản.')
    } catch (err) {
      console.error('[group] delete entry failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  // Bọc một action lên 1 entry: set busy + refresh nhóm + sync sổ cá nhân
  const runAction = async (entry: GroupEntry, fn: () => Promise<void>, okMsg: string) => {
    if (!user || busyEntry) return
    setBusyEntry(entry.id)
    try {
      await fn()
      await Promise.all([refreshEntries(user.uid), sync()])
      toast.success(okMsg)
    } catch (err) {
      console.error('[group] action failed:', err)
      toast.error('Không thực hiện được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setBusyEntry(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => router.push('/groups')} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground truncate">{group?.name ?? 'Nhóm'}</h2>
          {group && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> {group.memberUids.length} thành viên
            </p>
          )}
        </div>
        {group && (
          <button onClick={copyCode} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-mono hover:bg-muted transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="tracking-widest">{group.inviteCode}</span>
          </button>
        )}
        {group && (
          <button onClick={() => setManageOpen(true)} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0" aria-label="Quản lý nhóm">
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tạm tính chia tiền (thông tin) */}
      {settlement.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Phần chưa xử lý</p>
          <div className="space-y-1.5">
            {settlement.map(({ uid, net }) => (
              <div key={uid} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {net > 0 ? `${nameOf(uid)} nợ bạn` : `Bạn nợ ${nameOf(uid)}`}
                </span>
                <span className={cn('font-semibold', net > 0 ? 'text-success' : 'text-destructive')}>
                  {formatMoney(Math.abs(net), moneyHidden)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Chỉ tính các khoản bạn hoặc họ chưa xử lý.</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} disabled={!group} onClick={() => setEntryModal({ open: true })}>
          Thêm khoản chung
        </Button>
      </div>

      {entriesLoading && entries.length === 0 && (
        <div className="flex justify-center pt-12"><Spinner /></div>
      )}

      {!entriesLoading && entries.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Chưa có khoản chung nào.</p>
          <p className="text-xs mt-1">Thêm khoản đi chợ, ăn uống... để chia cho cả nhóm.</p>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-3">
        {entries.map(entry => {
          const myShare    = user ? shareOf(entry, user.uid) : 0
          const isMine     = !!user && entry.participants.includes(user.uid)
          const isCreator  = user?.uid === entry.createdByUid
          const isPayer    = user?.uid === entry.payerUid
          const myStatus   = user ? statusOf(entry, user.uid) : 'pending'
          const linked     = user ? findLinkedExpense(entry.id, expenses) : null
          const driftChanged = myStatus === 'done' && linked && linked.amount !== myShare
          const driftMissing = myStatus === 'done' && !linked
          const busy       = busyEntry === entry.id

          return (
            <div key={entry.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{entry.note || 'Khoản chung'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateVN(entry.date)} · {nameOf(entry.payerUid)} trả
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">{formatMoney(entry.total, moneyHidden)}</p>
                  {isCreator && (
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <button onClick={() => setEntryModal({ open: true, edit: entry })} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(entry)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bảng chia + trạng thái từng người */}
              <div className="border-t border-border/50 pt-2 space-y-1.5">
                {entry.splits.map(s => {
                  const st = statusOf(entry, s.uid)
                  const me = user?.uid === s.uid
                  return (
                    <div key={s.uid} className={cn('flex items-center justify-between text-xs gap-2', me && 'font-semibold')}>
                      <span className={cn('truncate', me ? 'text-primary' : 'text-muted-foreground')}>
                        {nameOf(s.uid)}{me ? ' (bạn)' : ''}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_META[st].cls)}>
                          {STATUS_META[st].label}
                        </span>
                        <span className={cn('w-20 text-right', me ? 'text-primary' : 'text-foreground')}>
                          {formatMoney(s.amount, moneyHidden)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Khu xử lý phần của mình */}
              {isMine && myShare > 0 && (
                <div className="border-t border-border/50 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Phần của bạn</span>
                    <span className="text-sm font-bold text-primary">{formatMoney(myShare, moneyHidden)}</span>
                  </div>

                  {/* Cảnh báo đối soát */}
                  {driftChanged && (
                    <div className="flex items-center gap-2 bg-warning/10 text-warning rounded-lg px-3 py-2 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="flex-1">Phần của bạn đã đổi: {formatMoney(linked!.amount, moneyHidden)} → {formatMoney(myShare, moneyHidden)}</span>
                      <button disabled={busy} onClick={() => runAction(entry, () => resyncShare(user!.uid, entry, linked!), 'Đã cập nhật sổ.')}
                        className="font-semibold underline underline-offset-2 disabled:opacity-50">Cập nhật</button>
                    </div>
                  )}
                  {driftMissing && (
                    <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="flex-1">Bút toán trong sổ đã bị xóa.</span>
                      <button disabled={busy} onClick={() => runAction(entry, () => unskipEntry(user!.uid, entry), 'Đã đặt lại Chờ.')}
                        className="font-semibold underline underline-offset-2 disabled:opacity-50">Đặt lại Chờ</button>
                    </div>
                  )}

                  {/* Hành động theo trạng thái */}
                  {myStatus === 'pending' && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" loading={busy} onClick={() => runAction(entry, () => pullAsExpense(user!.uid, entry, group!.name), 'Đã ghi vào chi tiêu.')}>
                        Ghi chi tiêu
                      </Button>
                      {!isPayer && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(entry, () => pullAsDebt(user!.uid, entry, group!.name, nameOf(entry.payerUid)), 'Đã ghi vào nợ.')}>
                          Ghi nợ
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => runAction(entry, () => skipEntry(user!.uid, entry), 'Đã bỏ qua khoản này.')}>
                        Bỏ qua
                      </Button>
                    </div>
                  )}
                  {myStatus === 'done' && !driftMissing && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-success font-medium">✓ Đã ghi vào sổ{linked?._debtId ? ' (nợ)' : ''}</span>
                      <button disabled={busy} onClick={() => runAction(entry, () => undoPull(user!.uid, entry, linked), 'Đã hoàn tác.')}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50">Hoàn tác</button>
                    </div>
                  )}
                  {myStatus === 'skipped' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-warning font-medium">Đã bỏ qua</span>
                      <button disabled={busy} onClick={() => runAction(entry, () => unskipEntry(user!.uid, entry), 'Đã đưa lại vào Chờ.')}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50">Hoàn tác</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {group && user && (
        <GroupEntryModal
          open={entryModal.open}
          edit={entryModal.edit}
          onClose={() => setEntryModal({ open: false })}
          group={group}
          currentUid={user.uid}
          onSaved={() => refreshEntries(user.uid)}
        />
      )}

      {group && user && (
        <GroupManageModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          group={group}
          currentUid={user.uid}
          onChanged={() => refreshGroupMeta(group.id)}
          onDeleted={() => { dropGroup(group.id); router.push('/groups') }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Xóa khoản chung này?"
        message={deleteTarget ? `${deleteTarget.note || 'Khoản chung'} · ${formatMoney(deleteTarget.total, false)}` : ''}
        warning={deleteWarning}
        confirmLabel="Xóa"
        danger
      />
    </div>
  )
}
