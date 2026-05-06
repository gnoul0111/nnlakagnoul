'use client'

import { useRef, useState } from 'react'
import {
  Download, Upload, Trash2,
  FileJson, FileSpreadsheet, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Button }              from '@/components/ui/button'
import { Spinner }             from '@/components/ui/spinner'
import { Progress }            from '@/components/ui/progress'
import { useAuthStore }        from '@/lib/store/authStore'
import { useEventStore }       from '@/lib/store/eventStore'
import { useAppData }          from '@/hooks/useAppData'
import { useToast }            from '@/hooks/useToast'
import { getPendingCount }     from '@/lib/offline/offlineQueue'
import {
  exportJSON, exportExcel, validateBackup, importJSON,
  type ImportPreview,
} from '@/lib/services/exportService'
import { cn } from '@/lib/utils/cn'

// ─── Build info ───────────────────────────────────────────────────────────────
// Build time tu dong inject luc Vercel build (xem next.config.ts)
// Hien thi theo gio Viet Nam (Asia/Ho_Chi_Minh), vd: "06/05/2026, 08:57"
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? ''

// ─── Section helpers ──────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-4 pt-5 pb-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  )
}

function ActionRow({
  icon, title, subtitle, action, danger, loading, disabled,
}: {
  icon:      React.ReactNode
  title:     string
  subtitle?: string
  action:    React.ReactNode
  danger?:   boolean
  loading?:  boolean
  disabled?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3.5', disabled && 'opacity-50')}>
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}>
        {loading ? <Spinner size="sm" /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', danger ? 'text-destructive' : 'text-foreground')}>
          {title}
        </p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataTab() {
  const user       = useAuthStore(s => s.user)
  const { expenses } = useAppData()
  const toast      = useToast()
  const loadEvents = useEventStore(s => s.loadEvents)
  const invalidate = useEventStore(s => s.invalidateCache)

  const fileRef = useRef<HTMLInputElement>(null)
  const [exportingJSON, setExportingJSON] = useState(false)
  const [exportingXLSX, setExportingXLSX] = useState(false)
  const [clearConfirmOpen, setClearConfirm] = useState(false)
  const [clearing, setClearing]             = useState(false)

  const [importPreview, setImportPreview]   = useState<ImportPreview | null>(null)
  const [importFile, setImportFile]         = useState<File | null>(null)
  const [importing, setImporting]           = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal]       = useState(0)
  const [importResult, setImportResult]     = useState<{ imported: number; skipped: number; budgets: number; calendarEvents: number } | null>(null)

  const pendingCount = getPendingCount()

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExportJSON = async () => {
    if (!user) return
    setExportingJSON(true)
    try {
      await exportJSON(user.uid)
      toast.success('Đã xuất file backup')
    } catch { toast.error('Xuất thất bại') }
    finally   { setExportingJSON(false) }
  }

  const handleExportExcel = async () => {
    setExportingXLSX(true)
    try {
      const spending = expenses.filter(e => !e._debtId && !e._goalId && !e._savingsMonthKey)
      await exportExcel(spending)
      toast.success(`Đã xuất ${spending.length} chi tiêu`)
    } catch { toast.error('Xuất Excel thất bại') }
    finally   { setExportingXLSX(false) }
  }

  // ── Import ────────────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw     = JSON.parse(ev.target?.result as string)
        const preview = validateBackup(raw)
        setImportFile(file)
        setImportPreview(preview)
        setImportResult(null)
      } catch { toast.error('Không đọc được file JSON') }
    }
    reader.readAsText(file)
  }

  const handleConfirmImport = async () => {
    if (!user || !importFile) return
    setImporting(true)
    setImportProgress(0)
    try {
      const result = await importJSON(user.uid, importFile, {
        onProgress: (c, t) => { setImportProgress(c); setImportTotal(t) },
      })
      setImportResult(result)
      invalidate(user.uid)
      await loadEvents(user.uid)
      toast.success(`Nhập thành công ${result.imported} sự kiện`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Nhập thất bại')
      setImportPreview(null)
    } finally {
      setImporting(false)
      setImportFile(null)
    }
  }

  const closeImportModal = () => {
    setImportPreview(null); setImportFile(null)
    setImportResult(null);  setImportProgress(0)
  }

  // ── Clear cache ───────────────────────────────────────────────────────────────

  const handleClearCache = async () => {
    if (!user) return
    setClearing(true)
    try {
      invalidate(user.uid)
      localStorage.removeItem('offline-event-queue')
      await loadEvents(user.uid)
      toast.success('Đã xóa cache và tải lại')
    } catch { toast.error('Có lỗi xảy ra') }
    finally  { setClearing(false); setClearConfirm(false) }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-safe pb-24">

      {/* ── Phiên bản ứng dụng ─────────────────────────────────────────────── */}
      <SectionHeader title="Phiên bản ứng dụng" />
      <div className="mx-4 bg-card rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Đang dùng phiên bản mới nhất
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {BUILD_TIME ? `Cập nhật ${BUILD_TIME}` : 'Chi Tiêu App'}
            </p>

          </div>
        </div>
      </div>

      {/* ── Xuất dữ liệu ─────────────────────────────────────────────────────── */}
      <SectionHeader title="Xuất dữ liệu" description="Tải về toàn bộ dữ liệu của bạn" />
      <div className="mx-4 bg-card rounded-2xl overflow-hidden divide-y divide-border">
        <ActionRow
          icon={<FileJson className="w-5 h-5" />}
          title="Xuất backup JSON"
          subtitle="Toàn bộ events + ngân sách + lịch"
          loading={exportingJSON}
          action={
            <Button size="sm" variant="outline" onClick={handleExportJSON} disabled={exportingJSON}
              leftIcon={<Download className="w-3.5 h-3.5" />}>
              Tải về
            </Button>
          }
        />
        <ActionRow
          icon={<FileSpreadsheet className="w-5 h-5" />}
          title="Xuất Excel chi tiêu"
          subtitle={`${expenses.filter(e => !e._debtId && !e._goalId && !e._savingsMonthKey).length} giao dịch`}
          loading={exportingXLSX}
          action={
            <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={exportingXLSX}
              leftIcon={<Download className="w-3.5 h-3.5" />}>
              Tải về
            </Button>
          }
        />
      </div>

      {/* ── Nhập dữ liệu ─────────────────────────────────────────────────────── */}
      <SectionHeader title="Nhập dữ liệu" description="Khôi phục từ file backup (không xóa data cũ)" />
      <div className="mx-4 bg-card rounded-2xl overflow-hidden">
        <ActionRow
          icon={<Upload className="w-5 h-5" />}
          title="Nhập backup JSON"
          subtitle="Merge vào data hiện tại, không trùng lặp"
          action={
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}
              leftIcon={<Upload className="w-3.5 h-3.5" />}>
              Chọn file
            </Button>
          }
        />
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* ── Bộ nhớ đệm ───────────────────────────────────────────────────────── */}
      <SectionHeader title="Bộ nhớ đệm" />
      <div className="mx-4 bg-card rounded-2xl overflow-hidden">
        <ActionRow
          icon={<Trash2 className="w-5 h-5" />}
          title="Xóa cache cục bộ"
          subtitle="Xóa localStorage, tải lại từ Firestore"
          danger loading={clearing}
          action={
            <Button size="sm" variant="outline" onClick={() => setClearConfirm(true)} disabled={clearing}
              className="text-destructive border-destructive/40 hover:bg-destructive/10">
              Xóa
            </Button>
          }
        />
      </div>

      {/* ── Đồng bộ ──────────────────────────────────────────────────────────── */}
      <SectionHeader title="Trạng thái đồng bộ" />
      <div className="mx-4 bg-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            pendingCount > 0 ? 'bg-[hsl(var(--warning)/0.15)]' : 'bg-[hsl(var(--success)/0.15)]',
          )}>
            {pendingCount > 0
              ? <Clock className="w-5 h-5 text-[hsl(var(--warning))]" />
              : <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" />
            }
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {pendingCount > 0 ? `${pendingCount} sự kiện chờ đồng bộ` : 'Đã đồng bộ đầy đủ'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendingCount > 0
                ? 'Sẽ tự động đồng bộ khi có mạng'
                : 'Tất cả dữ liệu đã được lưu lên Firestore'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Confirm modals ────────────────────────────────────────────────────── */}
      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => setClearConfirm(false)}
        onConfirm={handleClearCache}
        title="Xóa bộ nhớ đệm?"
        message="App sẽ tải lại toàn bộ dữ liệu từ Firestore. Dữ liệu trên server không bị ảnh hưởng."
        confirmLabel="Xóa cache"
        danger loading={clearing}
      />

      {/* ── Import preview modal ──────────────────────────────────────────────── */}
      <Modal open={!!importPreview} onClose={closeImportModal} title="Xác nhận nhập dữ liệu" variant="center">
        {importPreview && (
          <div className="p-5 space-y-4">
            {!importResult ? (
              <>
                {importPreview.isValid ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="font-medium">File hợp lệ</span>
                    </div>
                    <div className="bg-muted rounded-xl p-3 space-y-2 text-sm">
                      {[
                        ['Sự kiện', importPreview.eventCount.toLocaleString()],
                        ['Ngân sách', importPreview.budgetCount],
                        ['Lịch cá nhân', importPreview.calendarCount],
                        ...(importPreview.exportedAt
                          ? [['Ngày xuất', new Date(importPreview.exportedAt).toLocaleDateString('vi-VN')]]
                          : []),
                      ].map(([k, v]) => (
                        <div key={String(k)} className="flex justify-between">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-semibold">{v}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Data hiện tại không bị xóa. Chỉ nhập sự kiện chưa tồn tại (dedup theo ID).</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    <span>{importPreview.error ?? 'File không hợp lệ'}</span>
                  </div>
                )}

                {importing && (
                  <div className="space-y-2">
                    <Progress value={importTotal > 0 ? Math.round((importProgress / importTotal) * 100) : 0} />
                    <p className="text-xs text-center text-muted-foreground">
                      Đang nhập {importProgress}/{importTotal} sự kiện...
                    </p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={closeImportModal} disabled={importing}>Hủy</Button>
                  {importPreview.isValid && (
                    <Button onClick={handleConfirmImport} loading={importing}>Nhập dữ liệu</Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[hsl(var(--success))]">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Nhập thành công!</span>
                </div>
                <div className="bg-muted rounded-xl p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đã nhập</span>
                    <span className="font-semibold text-[hsl(var(--success))]">{importResult.imported} sự kiện</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bỏ qua (trùng)</span>
                    <span className="font-semibold">{importResult.skipped}</span>
                  </div>
                  {importResult.budgets > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ngân sách</span>
                      <span className="font-semibold">{importResult.budgets} tháng</span>
                    </div>
                  )}
                  {importResult.calendarEvents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sự kiện lịch</span>
                      <span className="font-semibold">{importResult.calendarEvents}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button onClick={closeImportModal}>Đóng</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}