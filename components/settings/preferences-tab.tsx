'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, Bell, BellOff, Send, AlertCircle, BanIcon, Smartphone } from 'lucide-react'
import { useAuthStore }            from '@/lib/store/authStore'
import { useSettingsStore }        from '@/lib/store/settingsStore'
import { useToast }                from '@/hooks/useToast'
import { updateUserSettings, removeCurrentDeviceToken }      from '@/lib/services/settingsService'
import {
  requestNotificationPermission,
  isWebPushSupported,
  initNotifications,
  sendTestNotificationViaServer,
} from '@/lib/services/notificationService'
import { CATEGORIES } from '@/lib/types/expense'
import { cn }         from '@/lib/utils/cn'
import { DevicesModal } from './devices-modal'

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="px-4 pt-5 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {title}
    </p>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl overflow-hidden divide-y divide-border mx-4">
      {children}
    </div>
  )
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3.5', className)}>{children}</div>
}

function ToggleSwitch({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      <span className={cn(
        'absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200',
        checked ? 'left-[23px]' : 'left-[3px]',
      )} />
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreferencesTab() {
  const user     = useAuthStore(s => s.user)
  const settings = useSettingsStore(s => s.settings)
  const catPrefs = useSettingsStore(s => s.categoryPrefs)
  const { setTheme, updateSettings, updateCategoryPrefs } = useSettingsStore()
  const toast = useToast()

  const [saving, setSaving] = useState<string | null>(null)

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [sendingTest, setSendingTest]         = useState(false)
  const [devicesOpen, setDevicesOpen]         = useState(false)

  useEffect(() => {
    if (typeof Notification === 'undefined' || !isWebPushSupported()) {
      setNotifPermission('unsupported')
    } else {
      setNotifPermission(Notification.permission)
    }
  }, [])

  if (!user || !settings) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Đang tải...</div>
  }

  const hiddenCategories = catPrefs?.hiddenCategories ?? []

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const save = async (key: string, fn: () => Promise<void>) => {
    setSaving(key)
    try { await fn() }
    catch { toast.error('Có lỗi xảy ra') }
    finally { setSaving(null) }
  }

  const handleTheme      = (theme: 'light' | 'dark') => save('theme', () => setTheme(user.uid, theme))
  const handleWeekStart  = (weekStartDay: 'monday' | 'sunday') => save('weekStart', () => updateSettings(user.uid, { weekStartDay }))
  const toggleCategory   = (v: string) => {
    const next = hiddenCategories.includes(v as any)
      ? hiddenCategories.filter(c => c !== v)
      : [...hiddenCategories, v as any]
    save('cat-' + v, () => updateCategoryPrefs(user.uid, next))
  }

  const handleNotifEnabled = async (v: boolean) => {
    if (!user || !settings) return

    if (v) {
      // Request permission when enabling
      const perm = await requestNotificationPermission()
      setNotifPermission(perm)
      if (perm !== 'granted') {
        toast.warning('Cần cho phép thông báo trong trình duyệt')
        return
      }

      // 1. Update store + Firestore
      try {
        await updateSettings(user.uid, { notifEnabled: true })
      } catch (err) {
        console.error('[handleNotifEnabled] updateSettings failed:', err)
        toast.error('Không lưu được cài đặt. Thử lại nhé.')
        return
      }

      // 2. Force refresh FCM token (bỏ qua cache 7 ngày)
      try {
        const ok = await initNotifications(
          user.uid,
          { ...settings, notifEnabled: true },
          true,
        )
        if (ok) {
          toast.success('Đã bật thông báo')
        } else {
          toast.warning('Không lấy được FCM token. Kiểm tra quyền thông báo.')
        }
      } catch (err) {
        console.error('[handleNotifEnabled] initNotifications failed:', err)
        toast.error('Lỗi khi đăng ký thông báo')
      }
    } else {
      // Disable: xoá device token của device NÀY khỏi Firestore (để CF không gửi nữa)
      // + clear legacy field + set notifEnabled=false trên user_settings.
      // Lưu ý: CHỈ xoá device hiện tại, devices khác của user vẫn nhận notif
      // (muốn tắt toàn user thì phải xoá từng device ở UI Settings).
      try {
        await removeCurrentDeviceToken(user.uid)
        await updateSettings(user.uid, {
          notifEnabled: false,
          fcmToken: null,
          tokenType: null,
          tokenUpdatedAt: null,
        })
        toast.success('Đã tắt thông báo cho thiết bị này')
      } catch (err) {
        console.error('[handleNotifEnabled] disable failed:', err)
        toast.error('Không tắt được. Thử lại nhé.')
      }
    }
  }

  const handleNotifTime  = (e: React.ChangeEvent<HTMLInputElement>) => updateSettings(user.uid, { notifTime: e.target.value })
  const toggleReminderType = (h: number) => {
    const cur = settings.eventReminderTypes ?? [1]
    updateSettings(user.uid, {
      eventReminderTypes: cur.includes(h) ? cur.filter(x => x !== h) : [...cur, h].sort((a, b) => a - b),
    })
  }

  // ── Test notification ─────────────────────────────────────────────────────────

  const handleSendTest = async () => {
    if (notifPermission === 'unsupported') {
      toast.warning('Trình duyệt này không hỗ trợ thông báo')
      return
    }
    if (!settings.notifEnabled) {
      toast.warning('Hãy bật thông báo trước khi gửi thử')
      return
    }
    setSendingTest(true)
    try {
      const perm = await requestNotificationPermission()
      setNotifPermission(perm)
      if (perm !== 'granted') {
        toast.warning('Vui lòng cho phép thông báo trước')
        return
      }

      // Gửi thật qua Cloud Function → FCM → SW → device.
      // Verify được cả token, pipeline, SW handler (không phải chỉ test
      // browser permission như `new Notification()` cũ).
      const { deviceCount } = await sendTestNotificationViaServer()
      toast.success(`Đã gửi thông báo thử tới ${deviceCount} thiết bị`)
    } catch (err: any) {
      console.error('[handleSendTest]', err)
      // HttpsError từ Cloud Function có .message
      const msg = err?.message ?? 'Không thể gửi thông báo'
      toast.error(msg)
    } finally {
      setSendingTest(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-safe pb-24">

      {/* ── Giao diện ────────────────────────────────────────────────────────── */}
      <SectionHeader title="Giao diện" />
      <Section>
        <Row className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Chủ đề</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sáng hoặc tối</p>
          </div>
          <div className="flex bg-muted rounded-xl p-1 gap-1">
            {(['light', 'dark'] as const).map(t => (
              <button key={t} onClick={() => handleTheme(t)} disabled={saving === 'theme'}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  settings.theme === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                {t === 'light' ? 'Sáng' : 'Tối'}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* ── Lịch & Tiền lương ────────────────────────────────────────────────── */}
      <SectionHeader title="Lịch & Tiền lương" />
      <Section>
        <Row className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Tuần bắt đầu từ</p>
          <div className="flex bg-muted rounded-xl p-1 gap-1">
            {([{ value: 'monday', label: 'Thứ 2' }, { value: 'sunday', label: 'Chủ nhật' }] as const).map(opt => (
              <button key={opt.value} onClick={() => handleWeekStart(opt.value)} disabled={saving === 'weekStart'}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  settings.weekStartDay === opt.value ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Row>
        <Row className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Ngày nhận lương</p>
            <p className="text-xs text-muted-foreground mt-0.5">0 = không đặt, 1–31</p>
          </div>
          <input type="number" min={0} max={31} value={settings.salaryDay}
            onChange={e => updateSettings(user.uid, { salaryDay: Math.min(31, Math.max(0, parseInt(e.target.value) || 0)) })}
            onBlur={e => save('salary', () => updateSettings(user.uid, { salaryDay: parseInt(e.target.value) || 0 }))}
            className="w-16 h-9 rounded-lg border border-input bg-background text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Row>
      </Section>

      {/* ── Danh mục ─────────────────────────────────────────────────────────── */}
      <SectionHeader title="Danh mục hiển thị" />
      <div className="mx-4 bg-card rounded-2xl overflow-hidden">
        <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">Tắt danh mục sẽ ẩn khỏi form thêm chi tiêu</p>
        <div className="divide-y divide-border">
          {CATEGORIES.map(cat => (
            <div key={cat.value} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl shrink-0">{cat.icon}</span>
              <span className="flex-1 text-sm font-medium text-foreground">{cat.label}</span>
              <ToggleSwitch
                checked={!hiddenCategories.includes(cat.value)}
                onChange={() => toggleCategory(cat.value)}
                disabled={saving === 'cat-' + cat.value}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Thông báo ────────────────────────────────────────────────────────── */}
      <SectionHeader title="Thông báo" />
      <Section>
        {/* Browser không hỗ trợ */}
        {notifPermission === 'unsupported' && (
          <Row className="flex items-center gap-3">
            <BanIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Trình duyệt này không hỗ trợ push notification.</p>
          </Row>
        )}

        {/* Permission bị từ chối */}
        {notifPermission === 'denied' && (
          <Row className="flex items-center gap-3 bg-destructive/5">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Quyền thông báo bị từ chối</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vào cài đặt trình duyệt → Site Settings → Notifications để cho phép.
              </p>
            </div>
          </Row>
        )}

        {/* Toggle bật/tắt */}
        <Row className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings.notifEnabled
              ? <Bell className="w-5 h-5 text-primary shrink-0" />
              : <BellOff className="w-5 h-5 text-muted-foreground shrink-0" />
            }
            <div>
              <p className="text-sm font-medium text-foreground">Bật thông báo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {settings.notifEnabled ? 'Đang bật' : 'Đang tắt'}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={settings.notifEnabled}
            onChange={handleNotifEnabled}
            disabled={saving === 'notif' || notifPermission === 'unsupported'}
          />
        </Row>

        {settings.notifEnabled && notifPermission === 'granted' && (
          <>
            {/* Giờ nhắc */}
            <Row className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Giờ nhắc nhập chi tiêu</p>
                <p className="text-xs text-muted-foreground mt-0.5">Mặc định: 21:00</p>
              </div>
              <input type="time" value={settings.notifTime ?? '21:00'}
                onChange={handleNotifTime}
                onBlur={e => save('notifTime', () => updateSettings(user.uid, { notifTime: e.target.value }))}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Row>

            {/* Reminder types */}
            <Row>
              <p className="text-sm font-medium text-foreground mb-2">Nhắc sự kiện trước</p>
              <div className="flex gap-2">
                {[1, 6, 24].map(h => {
                  const active = (settings.eventReminderTypes ?? [1]).includes(h)
                  return (
                    <button key={h} onClick={() => toggleReminderType(h)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {h === 24 ? '1 ngày' : `${h}h`}
                    </button>
                  )
                })}
              </div>
            </Row>

            {/* Test notification button */}
            <Row className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Gửi thử thông báo</p>
                <p className="text-xs text-muted-foreground mt-0.5">Kiểm tra thông báo hoạt động đúng chưa</p>
              </div>
              <button
                onClick={handleSendTest}
                disabled={sendingTest}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingTest ? 'Đang gửi...' : 'Gửi thử'}
              </button>
            </Row>

            {/* Devices management */}
            <Row className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Thiết bị nhận thông báo</p>
                <p className="text-xs text-muted-foreground mt-0.5">Quản lý các thiết bị đã đăng ký</p>
              </div>
              <button
                onClick={() => setDevicesOpen(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Quản lý
              </button>
            </Row>
          </>
        )}
      </Section>

      <DevicesModal open={devicesOpen} onClose={() => setDevicesOpen(false)} />
    </div>
  )
}