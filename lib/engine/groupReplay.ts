import type { GroupEntry, GroupEventDoc } from '@/lib/types/group'

// ════════════════════════════════════════════════════════════════════════════
// REPLAY RIÊNG cho module nhóm — KHÔNG đụng replay cá nhân (lib/engine/replay.ts).
// State nhóm = replay(group_events). Append-only, LWW theo clientTimestamp.
// ════════════════════════════════════════════════════════════════════════════

export interface GroupState {
  entries: GroupEntry[]
}

export function emptyGroupState(): GroupState {
  return { entries: [] }
}

// ─── LWW helpers (mirror lib/engine/replay.ts) ────────────────────────────────

function getEventMs(e: GroupEventDoc): number {
  if (e.clientTimestamp) return new Date(e.clientTimestamp).getTime()
  if (e.createdAt)       return new Date(e.createdAt).getTime()
  return e.timestamp?.toMillis?.() ?? 0
}

function isoToMs(iso?: string | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return isNaN(ms) ? 0 : ms
}

export function sortGroupEvents(events: GroupEventDoc[]): GroupEventDoc[] {
  return [...events].sort((a, b) => {
    const aMs = getEventMs(a)
    const bMs = getEventMs(b)
    if (aMs !== bMs) return aMs - bMs
    const aS = a.timestamp?.toMillis?.() ?? 0
    const bS = b.timestamp?.toMillis?.() ?? 0
    if (aS !== bS) return aS - bS
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}

// ─── Single-event apply ───────────────────────────────────────────────────────

export function applyGroupEvent(state: GroupState, event: GroupEventDoc): void {
  try {
    const type = String(event.eventType).toUpperCase()
    const data = event.data ?? {}
    const stamp = event.clientTimestamp ?? event.createdAt ?? new Date().toISOString()

    switch (type) {
      case 'GROUP_ENTRY_ADDED': {
        if (!data.id) break
        if (state.entries.some(e => e.id === data.id)) break
        state.entries.push({
          ...(data as GroupEntry),
          deleted: false,
          _updatedClientTimestamp: stamp,
        })
        break
      }

      case 'GROUP_ENTRY_UPDATED': {
        if (!data.id) break
        const idx = state.entries.findIndex(e => e.id === data.id)
        if (idx === -1) break
        const existing = state.entries[idx]

        // LWW: bỏ qua nếu bản hiện tại mới hơn
        const existingMs = isoToMs(existing._updatedClientTimestamp)
        if (existingMs > getEventMs(event)) break

        // Tombstone guard: nếu đã xóa và delete mới hơn → giữ xóa
        if (existing.deleted && existing._deletedClientTimestamp) {
          if (isoToMs(existing._deletedClientTimestamp) >= getEventMs(event)) break
        }

        state.entries[idx] = {
          ...existing,
          ...(data as Partial<GroupEntry>),
          deleted: false,
          _deletedClientTimestamp: undefined,
          _updatedClientTimestamp: stamp,
        }
        break
      }

      case 'GROUP_ENTRY_DELETED': {
        if (!data.id) break
        const idx = state.entries.findIndex(e => e.id === data.id)
        if (idx === -1) break
        state.entries[idx] = {
          ...state.entries[idx],
          deleted: true,
          _deletedClientTimestamp: stamp,
        }
        break
      }

      // Mỗi người set trạng thái CỦA MÌNH. Events đã sort theo thời gian → set
      // tuần tự, lần cuối thắng (LWW tự nhiên theo thứ tự apply).
      case 'GROUP_ENTRY_STATUS_SET': {
        if (!data.id || !data.uid || !data.status) break
        const idx = state.entries.findIndex(e => e.id === data.id)
        if (idx === -1) break
        const existing = state.entries[idx]
        state.entries[idx] = {
          ...existing,
          statuses: { ...(existing.statuses ?? {}), [data.uid]: data.status },
        }
        break
      }

      default:
        if (process.env.NODE_ENV === 'development') {
          console.debug('[groupReplay] unknown eventType:', type)
        }
        break
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[groupReplay] error:', event.eventType, event.id, err)
    }
  }
}

// ─── Main replay ────────────────────────────────────────────────────────────

export function replayGroup(events: GroupEventDoc[]): GroupState {
  const state = emptyGroupState()
  for (const e of sortGroupEvents(events)) applyGroupEvent(state, e)
  return state
}

/** Khoản còn sống (chưa xóa), mới nhất lên đầu. */
export function getActiveEntries(state: GroupState): GroupEntry[] {
  return state.entries
    .filter(e => !e.deleted)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
