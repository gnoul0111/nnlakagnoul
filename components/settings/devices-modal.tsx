'use client'

import { useEffect, useState, useCallback } from 'react'
import { Smartphone, Monitor, Tablet, Laptop, Globe, Trash2, Loader2, Sparkles } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { useAuthStore } from '@/lib/store/authStore'
import { useToast } from '@/hooks/useToast'
import {
  listDeviceTokens,
  deleteDeviceToken,
  deleteInactiveTokens,
  type DeviceTokenInfo,
} from '@/lib/services/settingsService'
import { cn } from '@/lib/utils/cn'
import type { Timestamp } from 'firebase/firestore'

interface DevicesModalProps {
  open:    boolean
  onClose: () => void
}

export function DevicesModal({ open, onClose }: DevicesModalProps) {
  const user  = useAuthStore(s => s.user)
  const toast = useToast()

  const [devices, setDevices] = useState<DeviceTokenInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<DeviceTokenInfo | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cleanupConfirm, setCleanupConfirm] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  const loadDevices = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await listDeviceTokens(user.uid)
      setDevices(list)
    } catch (err) {
      console.error('[DevicesModal] load failed:', err)
      toast.error('Không tải được danh sách thiết bị')
    } finally {
      setLoading(false)
    }
    // `toast` reference đổi mỗi render nhưng chỉ dùng trong catch → bỏ khỏi dep
    // để tránh infinite loop (loadDevices mới → useEffect chạy lại → fetch lại).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (open) loadDevices()
  }, [open, loadDevices])

  const handleDelete = async () => {
    if (!user || !confirmDelete) return
    setDeleting(true)
    try {
      await deleteDeviceToken(user.uid, confirmDelete.deviceId)
      setDevices(prev => prev.filter(d => d.deviceId !== confirmDelete.deviceId))
      setConfirmDelete(null)
      toast.success(
        confirmDelete.isCurrent
          ? 'Đã xóa thiết bị này. Cần bật lại thông báo nếu muốn nhận.'
          : 'Đã xóa thiết bị',
      )
    } catch (err) {
      console.error('[DevicesModal] delete failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    } finally {
      setDeleting(false)
    }
  }

  // Dọn các thiết bị không hoạt động > 7 ngày (hoặc chưa có lastUsedAt).
  // Không xoá device hiện tại → user không tự cắt thông báo của mình.
  const handleCleanup = async () => {
    if (!user) return
    setCleaning(true)
    try {
      const count = await deleteInactiveTokens(user.uid)
      setCleanupConfirm(false)
      if (count === 0) {
        toast.info('Không có thiết bị nào cần dọn. Tất cả đều hoạt động gần đây.')
      } else {
        toast.success(`Đã dọn ${count} thiết bị không hoạt động`)
        await loadDevices() // refresh list sau khi xoá
      }
    } catch (err) {
      console.error('[DevicesModal] cleanup failed:', err)
      toast.error('Không dọn được. Thử lại nhé.')
    } finally {
      setCleaning(false)
    }
  }

  // Đếm số device sẽ bị dọn (để disable nút nếu = 0)
  const inactiveCount = devices.filter(d => {
    if (d.isCurrent) return false
    const ts = d.lastUsedAt
    if (!ts) return true // không có lastUsedAt → sẽ xoá
    const ms = typeof (ts as any).toMillis === 'function'
      ? (ts as any).toMillis()
      : ((ts as any).seconds ?? 0) * 1000
    return Date.now() - ms >= 7 * 24 * 60 * 60 * 1000
  }).length

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        variant="bottom"
        title="Thiết bị nhận thông báo"
        className="max-w-md"
      >
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="text-sm text-muted-foreground">
              {devices.length > 0
                ? `${devices.length} thiết bị đang được đăng ký`
                : 'Chưa có thiết bị nào'}
            </p>
            {inactiveCount > 0 && (
              <button
                type="button"
                onClick={() => setCleanupConfirm(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Dọn ({inactiveCount})
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Bật thông báo để đăng ký thiết bị này.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map(d => (
                <DeviceRow
                  key={d.deviceId}
                  device={d}
                  onDelete={() => setConfirmDelete(d)}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa thiết bị này?"
        message={
          confirmDelete?.isCurrent
            ? 'Đây là thiết bị bạn đang dùng. Xóa xong sẽ không nhận được thông báo nữa, trừ khi bật lại thông báo.'
            : `"${confirmDelete?.platform ?? 'Thiết bị'}" sẽ không còn nhận được thông báo nữa.`
        }
        confirmLabel="Xóa"
        danger
        loading={deleting}
      />

      <ConfirmModal
        open={cleanupConfirm}
        onClose={() => !cleaning && setCleanupConfirm(false)}
        onConfirm={handleCleanup}
        title="Dọn thiết bị không hoạt động?"
        message={`Sẽ xóa ${inactiveCount} thiết bị không hoạt động hơn 7 ngày. Thiết bị bạn đang dùng vẫn được giữ.`}
        confirmLabel="Dọn"
        danger
        loading={cleaning}
      />
    </>
  )
}

// ─── DeviceRow ────────────────────────────────────────────────────────────────

function DeviceRow({
  device,
  onDelete,
}: {
  device:   DeviceTokenInfo
  onDelete: () => void
}) {
  const Icon = pickIcon(device.platform, device.userAgent)

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border',
      device.isCurrent
        ? 'bg-primary/5 border-primary/30'
        : 'bg-card border-border',
    )}>
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
        device.isCurrent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{device.platform}</p>
          {device.isCurrent && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
              THIẾT BỊ NÀY
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatLastUsed(device.lastUsedAt)}
        </p>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
        aria-label="Xóa thiết bị"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickIcon(platform: string, ua: string) {
  const p = platform.toLowerCase()
  const u = ua.toLowerCase()
  if (p.includes('ios') || p.includes('android')) {
    if (u.includes('ipad') || u.includes('tablet')) return Tablet
    return Smartphone
  }
  if (p.includes('mac') && !u.includes('iphone') && !u.includes('ipad')) return Laptop
  if (p.includes('windows') || p.includes('linux')) return Monitor
  return Globe
}

function formatLastUsed(ts: Timestamp | null): string {
  if (!ts) return 'Chưa sử dụng'
  const ms = typeof (ts as any).toMillis === 'function'
    ? (ts as any).toMillis()
    : ((ts as any).seconds ?? 0) * 1000
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (mins < 1)   return 'Vừa hoạt động'
  if (mins < 60)  return `Hoạt động ${mins} phút trước`
  if (hours < 24) return `Hoạt động ${hours} giờ trước`
  if (days < 7)   return `Hoạt động ${days} ngày trước`
  return `Hoạt động ${Math.floor(days / 7)} tuần trước`
}