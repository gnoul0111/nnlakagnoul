'use client'

import { useEffect, useState } from 'react'
import { UserMinus, Trash2, Crown } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { useToast } from '@/hooks/useToast'
import { renameGroup } from '@/lib/services/groupService'
import { getCurrentUser } from '@/lib/firebase/auth'
import type { Group } from '@/lib/types/group'

interface Props {
  open:       boolean
  onClose:    () => void
  group:      Group
  currentUid: string
  onChanged:  () => void        // đổi tên / gỡ thành viên xong → refresh meta
  onDeleted:  () => void        // xoá nhóm xong → điều hướng đi
}

async function authedFetch(url: string, body: unknown) {
  const token = await getCurrentUser()?.getIdToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Lỗi xử lý.')
  return data
}

export function GroupManageModal({ open, onClose, group, currentUid, onChanged, onDeleted }: Props) {
  const toast = useToast()
  const isOwner = currentUid === group.ownerUid

  const [name, setName]   = useState(group.name)
  const [busy, setBusy]   = useState(false)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { if (open) setName(group.name) }, [open, group.name])

  const nameOf = (uid: string) => group.members[uid]?.name ?? 'Thành viên'

  const handleRename = async () => {
    if (busy || !name.trim() || name.trim() === group.name) return
    setBusy(true)
    try {
      await renameGroup(group.id, name)
      onChanged()
      toast.success('Đã đổi tên nhóm.')
    } catch (err) {
      console.error('[group] rename failed:', err)
      toast.error('Không đổi tên được. Thử lại nhé.')
    } finally { setBusy(false) }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setBusy(true)
    try {
      await authedFetch('/api/groups/remove-member', { groupId: group.id, memberUid: removeTarget })
      setRemoveTarget(null)
      onChanged()
      toast.success('Đã gỡ thành viên.')
    } catch (err) {
      console.error('[group] remove member failed:', err)
      toast.error(err instanceof Error ? err.message : 'Không gỡ được.')
    } finally { setBusy(false) }
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await authedFetch('/api/groups/delete', { groupId: group.id })
      setConfirmDelete(false)
      onClose()
      onDeleted()
      toast.success('Đã xoá nhóm.')
    } catch (err) {
      console.error('[group] delete failed:', err)
      toast.error(err instanceof Error ? err.message : 'Không xoá được.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <Modal variant="center" open={open} onClose={onClose} title="Quản lý nhóm">
        <div className="px-4 pb-6 space-y-5">
          {/* Đổi tên (chỉ chủ nhóm) */}
          {isOwner && (
            <FormField label="Tên nhóm">
              <div className="flex gap-2">
                <Input value={name} onChange={e => setName(e.target.value)} />
                <Button size="sm" loading={busy} disabled={!name.trim() || name.trim() === group.name} onClick={handleRename}>
                  Lưu
                </Button>
              </div>
            </FormField>
          )}

          {/* Thành viên */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Thành viên ({group.memberUids.length})</p>
            <div className="space-y-1.5">
              {group.memberUids.map(uid => {
                const owner = uid === group.ownerUid
                return (
                  <div key={uid} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-muted/40">
                    <span className="text-sm text-foreground truncate flex items-center gap-1.5">
                      {nameOf(uid)}{uid === currentUid ? ' (bạn)' : ''}
                      {owner && <Crown className="w-3.5 h-3.5 text-warning" />}
                    </span>
                    {isOwner && !owner && (
                      <button
                        onClick={() => setRemoveTarget(uid)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Gỡ
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Xoá nhóm (chỉ chủ nhóm) */}
          {isOwner && (
            <div className="border-t border-border pt-4">
              <Button variant="destructive" className="w-full" leftIcon={<Trash2 className="w-4 h-4" />} disabled={busy} onClick={() => setConfirmDelete(true)}>
                Xoá nhóm
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1.5 text-center">Xoá toàn bộ khoản chung của nhóm. Không khôi phục được.</p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title={`Gỡ ${removeTarget ? nameOf(removeTarget) : ''} khỏi nhóm?`}
        message="Thành viên này sẽ không thêm/xem được khoản mới của nhóm nữa."
        confirmLabel="Gỡ"
        danger
        loading={busy}
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={`Xoá nhóm "${group.name}"?`}
        message="Toàn bộ khoản chung của nhóm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
        confirmLabel="Xoá nhóm"
        danger
        loading={busy}
      />
    </>
  )
}
