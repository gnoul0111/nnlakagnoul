import { create } from 'zustand'
import {
  getUserGroups,
  getGroup,
  getGroupEvents,
  getNewGroupEventsSince,
  subscribeGroupEvents,
} from '@/lib/services/groupService'
import { replayGroup, getActiveEntries } from '@/lib/engine/groupReplay'
import type { Group, GroupEntry, GroupEventDoc } from '@/lib/types/group'
import type { Unsubscribe } from '@/lib/firebase/firestore'

// PHA B: cửa sổ lùi cho cursor realtime (tránh sót event do clock skew).
const REALTIME_SKEW_BUFFER_MS = 30 * 1000

// Một listener cho NHÓM ĐANG MỞ tại một thời điểm. Lưu ở module scope để
// luôn tear down trước khi subscribe nhóm khác (chống leak khi chuyển nhóm).
let _unsubGroupRealtime: Unsubscribe | null = null

function teardownGroupRealtime(): void {
  if (_unsubGroupRealtime) {
    _unsubGroupRealtime()
    _unsubGroupRealtime = null
  }
}

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
  stopRealtime:    () => void
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
    // Đổi nhóm → tear down listener nhóm cũ trước
    teardownGroupRealtime()
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

      // PHA B: subscribe realtime cho nhóm đang mở. Khi thành viên khác ghi
      // khoản/đổi trạng thái → đẩy về ngay, không cần refresh thủ công.
      // Teardown lần nữa ngay trước khi gán — chống race 2 selectGroup async
      // cùng subscribe (strict-mode / chuyển nhóm nhanh) làm bỏ rơi listener cũ.
      teardownGroupRealtime()
      const sinceMs = (get()._lastSync ?? Date.now()) - REALTIME_SKEW_BUFFER_MS
      _unsubGroupRealtime = subscribeGroupEvents(groupId, uid, sinceMs, incoming => {
        // Guard: user đã chuyển nhóm khác trong lúc listener còn sống
        if (get().currentGroupId !== groupId) return

        const { _events } = get()
        const ids = new Set(_events.map(e => e.id))
        const newOnes = incoming.filter(e => !ids.has(e.id))
        if (newOnes.length === 0) return

        const merged = [..._events, ...newOnes]
        const nextState = replayGroup(merged)
        set({ _events: merged, entries: getActiveEntries(nextState), _lastSync: Date.now() })
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
    if (get().currentGroupId === groupId) teardownGroupRealtime()
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

  // Dừng realtime listener mà KHÔNG xóa state (dùng khi rời route nhóm).
  stopRealtime: () => teardownGroupRealtime(),

  reset: () => {
    teardownGroupRealtime()
    set({
      groups: null, groupsLoading: false, currentGroupId: null, currentGroup: null,
      entries: [], entriesLoading: false, error: null, _events: [], _lastSync: null,
    })
  },
}))
