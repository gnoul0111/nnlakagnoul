import { create } from 'zustand'
import {
  getUserGroups,
  getGroup,
  getGroupEvents,
  getNewGroupEventsSince,
} from '@/lib/services/groupService'
import { replayGroup, getActiveEntries } from '@/lib/engine/groupReplay'
import type { Group, GroupEntry, GroupEventDoc } from '@/lib/types/group'

// ════════════════════════════════════════════════════════════════════════════
// Store RIÊNG cho module nhóm. KHÔNG dùng chung eventStore cá nhân.
// Online-only (giai đoạn đầu) → không persist IndexedDB, không offline queue.
// Lazy: chỉ load khi vào route /groups → không ảnh hưởng tốc độ boot app.
// ════════════════════════════════════════════════════════════════════════════

interface GroupStoreState {
  groups:         Group[] | null
  groupsLoading:  boolean
  currentGroupId: string | null
  currentGroup:   Group | null
  entries:        GroupEntry[]      // active (chưa xóa), mới nhất trên đầu
  entriesLoading: boolean
  error:          string | null

  _events:   GroupEventDoc[]
  _lastSync: number | null

  loadGroups:      (uid: string) => Promise<void>
  selectGroup:     (groupId: string, uid: string) => Promise<void>
  refreshEntries:  (uid: string) => Promise<void>
  refreshGroupMeta:(groupId: string) => Promise<void>
  dropGroup:       (groupId: string) => void
  applyLocalEvent: (event: GroupEventDoc) => void
  upsertGroup:     (group: Group) => void
  reset:           () => void
}

export const useGroupStore = create<GroupStoreState>((set, get) => ({
  groups:         null,
  groupsLoading:  false,
  currentGroupId: null,
  currentGroup:   null,
  entries:        [],
  entriesLoading: false,
  error:          null,
  _events:        [],
  _lastSync:      null,

  loadGroups: async (uid: string) => {
    set({ groupsLoading: true, error: null })
    try {
      const groups = await getUserGroups(uid)
      set({ groups, groupsLoading: false })
    } catch (err) {
      console.error('[groupStore] loadGroups failed:', err)
      set({ groupsLoading: false, error: err instanceof Error ? err.message : 'Lỗi tải nhóm.' })
    }
  },

  selectGroup: async (groupId: string, uid: string) => {
    set({ currentGroupId: groupId, entriesLoading: true, error: null, entries: [], _events: [] })
    try {
      // Lấy meta nhóm (ưu tiên từ list đã có để đỡ 1 round-trip)
      const cached = get().groups?.find(g => g.id === groupId)
      const group  = cached ?? (await getGroup(groupId))

      const events = await getGroupEvents(groupId, uid)
      // Guard: user có thể đã rời route
      if (get().currentGroupId !== groupId) return

      const state = replayGroup(events)
      set({
        currentGroup:   group,
        entries:        getActiveEntries(state),
        _events:        events,
        _lastSync:      Date.now(),
        entriesLoading: false,
      })
    } catch (err) {
      console.error('[groupStore] selectGroup failed:', err)
      set({ entriesLoading: false, error: err instanceof Error ? err.message : 'Lỗi tải khoản.' })
    }
  },

  refreshEntries: async (uid: string) => {
    const { currentGroupId, _events, _lastSync } = get()
    if (!currentGroupId || _lastSync === null) return
    try {
      const fresh = await getNewGroupEventsSince(currentGroupId, uid, _lastSync)
      if (fresh.length === 0) { set({ _lastSync: Date.now() }); return }
      if (get().currentGroupId !== currentGroupId) return

      const ids = new Set(_events.map(e => e.id))
      const merged = [..._events, ...fresh.filter(e => !ids.has(e.id))]
      const state  = replayGroup(merged)
      set({ _events: merged, entries: getActiveEntries(state), _lastSync: Date.now() })
    } catch (err) {
      console.error('[groupStore] refreshEntries failed:', err)
    }
  },

  // Refresh chỉ META nhóm (tên, thành viên) — KHÔNG reload entries (tránh flicker).
  refreshGroupMeta: async (groupId: string) => {
    try {
      const g = await getGroup(groupId)
      if (!g) return
      set(state => ({
        currentGroup: state.currentGroupId === groupId ? g : state.currentGroup,
        groups: state.groups ? state.groups.map(x => (x.id === groupId ? g : x)) : state.groups,
      }))
    } catch (err) {
      console.error('[groupStore] refreshGroupMeta failed:', err)
    }
  },

  // Gỡ nhóm khỏi state (sau khi xoá).
  dropGroup: (groupId: string) => {
    set(state => ({
      groups: state.groups?.filter(g => g.id !== groupId) ?? null,
      ...(state.currentGroupId === groupId
        ? { currentGroupId: null, currentGroup: null, entries: [], _events: [], _lastSync: null }
        : {}),
    }))
  },

  // Optimistic: áp event mới lên state ngay (đã ghi Firestore song song).
  applyLocalEvent: (event: GroupEventDoc) => {
    const { _events } = get()
    if (_events.some(e => e.id === event.id)) return
    const merged = [..._events, event]
    const state  = replayGroup(merged)
    set({ _events: merged, entries: getActiveEntries(state) })
  },

  upsertGroup: (group: Group) => {
    const groups = get().groups ?? []
    const idx = groups.findIndex(g => g.id === group.id)
    const next = idx === -1 ? [...groups, group] : groups.map(g => (g.id === group.id ? group : g))
    set({ groups: next })
  },

  reset: () => set({
    groups: null, groupsLoading: false, currentGroupId: null, currentGroup: null,
    entries: [], entriesLoading: false, error: null, _events: [], _lastSync: null,
  }),
}))
