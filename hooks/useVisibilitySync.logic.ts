// Logic thuần cho useVisibilitySync — KHÔNG import store/firebase để
// unit-test được trong môi trường node (không cần DOM, không init Firebase).

// Khoảng cách tối thiểu giữa 2 lần sync do visibility/focus kích hoạt.
// visibilitychange + focus thường bắn gần như đồng thời → throttle để
// không gọi syncEvents dồn dập (mỗi lần = ít nhất 1 lượt đọc Firestore).
export const SYNC_THROTTLE_MS = 10_000

/**
 * Quyết định có nên kích hoạt sync hay không.
 * Chỉ sync khi: tab đang hiển thị, đang online, và đã quá throttle window.
 */
export function shouldVisibilitySync(opts: {
  now: number
  lastSyncAt: number
  visibilityState: DocumentVisibilityState
  online: boolean
  throttleMs: number
}): boolean {
  const { now, lastSyncAt, visibilityState, online, throttleMs } = opts
  if (visibilityState !== 'visible') return false
  if (!online) return false
  if (now - lastSyncAt < throttleMs) return false
  return true
}
