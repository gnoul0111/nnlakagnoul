'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, LogIn, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/lib/store/authStore'
import { useGroupStore } from '@/lib/store/groupStore'
import { useToast } from '@/hooks/useToast'
import { createGroup, getAllUserGroupEvents } from '@/lib/services/groupService'
import { replayGroup, getActiveEntries } from '@/lib/engine/groupReplay'
import { statusOf, shareOf } from '@/lib/types/group'
import { getCurrentUser } from '@/lib/firebase/auth'

export default function GroupsPage() {
  const router  = useRouter()
  const user    = useAuthStore(s => s.user)
  const toast   = useToast()
  const groups        = useGroupStore(s => s.groups)
  const groupsLoading = useGroupStore(s => s.groupsLoading)
  const loadGroups    = useGroupStore(s => s.loadGroups)
  const upsertGroup   = useGroupStore(s => s.upsertGroup)

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen]     = useState(false)
  const [name, setName]   = useState('')
  const [code, setCode]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [pendingByGroup, setPendingByGroup] = useState<Record<string, number>>({})

  useEffect(() => {
    if (user) loadGroups(user.uid)
  }, [user, loadGroups])

  // Đếm "khoản chờ xử lý" của mình theo từng nhóm (1 query cho mọi nhóm).
  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      try {
        const events = await getAllUserGroupEvents(user.uid)
        if (!alive) return
        const byGroup: Record<string, typeof events> = {}
        for (const e of events) (byGroup[e.groupId] ??= []).push(e)
        const counts: Record<string, number> = {}
        for (const [gid, evs] of Object.entries(byGroup)) {
          counts[gid] = getActiveEntries(replayGroup(evs)).filter(
            entry => shareOf(entry, user.uid) > 0 && statusOf(entry, user.uid) === 'pending',
          ).length
        }
        setPendingByGroup(counts)
      } catch (err) {
        console.error('[groups] count pending failed:', err)
      }
    })()
    return () => { alive = false }
  }, [user])

  const handleCreate = async () => {
    if (!user || busy) return
    if (!name.trim()) { toast.error('Nhập tên nhóm.'); return }
    setBusy(true)
    try {
      const group = await createGroup(
        { uid: user.uid, name: user.displayName || user.email?.split('@')[0] || 'Tôi', email: user.email || '' },
        name,
      )
      upsertGroup(group)
      setCreateOpen(false)
      setName('')
      toast.success('Đã tạo nhóm!')
      router.push(`/groups/${group.id}`)
    } catch (err) {
      console.error('[groups] create failed:', err)
      toast.error('Không tạo được nhóm. Thử lại nhé.')
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!user || busy) return
    const c = code.trim().toUpperCase()
    if (c.length !== 6) { toast.error('Mã mời gồm 6 ký tự.'); return }
    setBusy(true)
    try {
      const token = await getCurrentUser()?.getIdToken()
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: c,
          name: user.displayName || user.email?.split('@')[0] || 'Thành viên',
          email: user.email || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Không tham gia được.'); return }
      setJoinOpen(false)
      setCode('')
      await loadGroups(user.uid)
      toast.success(data.alreadyMember ? 'Bạn đã ở trong nhóm này.' : `Đã tham gia "${data.name}"!`)
      router.push(`/groups/${data.groupId}`)
    } catch (err) {
      console.error('[groups] join failed:', err)
      toast.error('Không tham gia được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreateOpen(true)}>
          Tạo nhóm
        </Button>
        <Button size="sm" variant="outline" leftIcon={<LogIn className="w-3.5 h-3.5" />} onClick={() => setJoinOpen(true)}>
          Tham gia bằng mã
        </Button>
      </div>

      {groupsLoading && !groups && (
        <div className="flex justify-center pt-12"><Spinner /></div>
      )}

      {groups && groups.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có nhóm nào.</p>
          <p className="text-xs mt-1">Tạo nhóm để cùng gia đình theo dõi chi tiêu chung.</p>
        </div>
      )}

      <div className="space-y-2">
        {groups?.map(g => (
          <button
            key={g.id}
            onClick={() => router.push(`/groups/${g.id}`)}
            className="w-full flex items-center gap-3 bg-card border border-border rounded-xl p-4 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{g.name}</p>
              <p className="text-xs text-muted-foreground">{g.memberUids.length} thành viên</p>
            </div>
            {pendingByGroup[g.id] > 0 && (
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning whitespace-nowrap">
                {pendingByGroup[g.id]} khoản chờ
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {/* Tạo nhóm */}
      <Modal variant="center" open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo nhóm mới">
        <div className="px-4 pb-6 space-y-4">
          <FormField label="Tên nhóm" required>
            <Input placeholder="Gia đình, Phòng trọ..." autoFocus value={name} onChange={e => setName(e.target.value)} />
          </FormField>
          <Button className="w-full" size="lg" loading={busy} onClick={handleCreate}>Tạo nhóm</Button>
        </div>
      </Modal>

      {/* Tham gia bằng mã */}
      <Modal variant="center" open={joinOpen} onClose={() => setJoinOpen(false)} title="Tham gia nhóm">
        <div className="px-4 pb-6 space-y-4">
          <FormField label="Mã mời (6 ký tự)" required>
            <Input
              placeholder="VD: K7M2QP"
              autoFocus
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="uppercase tracking-widest text-center text-lg font-mono"
            />
          </FormField>
          <Button className="w-full" size="lg" loading={busy} onClick={handleJoin}>Tham gia</Button>
        </div>
      </Modal>
    </div>
  )
}
