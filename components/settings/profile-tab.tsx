'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Camera, Pencil, LogOut, X, Check, KeyRound } from 'lucide-react'
import { Avatar }                  from '@/components/ui/avatar'
import { Button }                  from '@/components/ui/button'
import { FormField, Input, PasswordInput } from '@/components/ui/input'
import { Modal }                   from '@/components/ui/modal'
import { Spinner }                 from '@/components/ui/spinner'
import { useAuthStore }            from '@/lib/store/authStore'
import { useToast }                from '@/hooks/useToast'
import {
  getUserProfile, upsertUserProfile,
} from '@/lib/services/settingsService'
import {
  updateDisplayName, changePassword, getAuthErrorMessage,
} from '@/lib/firebase/auth'
import type { UserProfile } from '@/lib/types/settings'
import { cn } from '@/lib/utils/cn'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resize + center-crop image → base64 JPEG ~200×200 */
async function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 200
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const min = Math.min(img.width, img.height)
      const sx  = (img.width  - min) / 2
      const sy  = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const nameSchema = z.object({
  displayName: z.string().min(1, 'Nhập tên hiển thị.').max(50),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại.'),
  newPassword:     z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự.'),
  confirmPassword: z.string().min(1, 'Xác nhận mật khẩu.'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp.',
  path: ['confirmPassword'],
})

// ─── Section card helper ──────────────────────────────────────────────────────

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card rounded-2xl overflow-hidden divide-y divide-border', className)}>
      {children}
    </div>
  )
}

function SectionRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileTab() {
  const user  = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const toast = useToast()

  const fileRef  = useRef<HTMLInputElement>(null)
  const [profile, setProfile]       = useState<UserProfile | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [editNameOpen, setEditNameOpen]     = useState(false)
  const [changePassOpen, setChangePassOpen] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [savingPass, setSavingPass] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserProfile(user.uid).then(setProfile)
  }, [user])

  // ── Name form ────────────────────────────────────────────────────────────────
  const nameForm = useForm({
    resolver: zodResolver(nameSchema),
    defaultValues: { displayName: user?.displayName ?? '' },
  })

  useEffect(() => {
    nameForm.reset({ displayName: user?.displayName ?? '' })
  }, [user, editNameOpen])  // eslint-disable-line

  const onSaveName = async ({ displayName }: { displayName: string }) => {
    if (!user) return
    setSavingName(true)
    try {
      await updateDisplayName(displayName)
      await upsertUserProfile(user.uid, { displayName })
      toast.success('Đã cập nhật tên')
      setEditNameOpen(false)
    } catch {
      toast.error('Cập nhật thất bại')
    } finally {
      setSavingName(false)
    }
  }

  // ── Password form ─────────────────────────────────────────────────────────────
  const passForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (changePassOpen) passForm.reset()
  }, [changePassOpen]) // eslint-disable-line

  const onSavePassword = async (values: z.infer<typeof passwordSchema>) => {
    setSavingPass(true)
    try {
      await changePassword(values.currentPassword, values.newPassword)
      toast.success('Đã đổi mật khẩu thành công')
      setChangePassOpen(false)
    } catch (err: any) {
      const msg = getAuthErrorMessage(err?.code ?? '')
      passForm.setError('currentPassword', { message: msg })
    } finally {
      setSavingPass(false)
    }
  }

  // ── Avatar upload ─────────────────────────────────────────────────────────────
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const base64 = await resizeAvatar(file)
      await upsertUserProfile(user.uid, { photoURL: base64 })
      setProfile(prev => prev ? { ...prev, photoURL: base64 } : null)
      toast.success('Đã cập nhật ảnh đại diện')
    } catch {
      toast.error('Tải ảnh thất bại')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const avatarSrc = profile?.photoURL ?? user?.photoURL ?? null
  const displayName = user?.displayName ?? ''
  const email       = user?.email ?? ''

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative">
          <Avatar src={avatarSrc} name={displayName} size="lg" className="!w-24 !h-24 !text-2xl" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
            aria-label="Đổi ảnh đại diện"
          >
            {uploading ? <Spinner size="sm" className="border-white border-t-transparent" /> : <Camera className="w-4 h-4" />}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onAvatarChange}
        />
        <div className="text-center">
          <p className="font-semibold text-foreground">{displayName || 'Chưa đặt tên'}</p>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* Profile info */}
      <Section>
        <SectionRow className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Tên hiển thị</p>
            <p className="text-sm text-muted-foreground mt-0.5">{displayName || 'Chưa đặt tên'}</p>
          </div>
          <button
            onClick={() => setEditNameOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Sửa tên"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </SectionRow>
        <SectionRow>
          <p className="text-sm font-medium text-foreground">Email</p>
          <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
        </SectionRow>
      </Section>

      {/* Security */}
      <Section>
        <SectionRow>
          <button
            onClick={() => setChangePassOpen(true)}
            className="flex items-center gap-3 w-full"
          >
            <KeyRound className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">Đổi mật khẩu</span>
          </button>
        </SectionRow>
      </Section>

      {/* Logout */}
      <Section>
        <SectionRow>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 w-full"
          >
            <LogOut className="w-5 h-5 text-destructive shrink-0" />
            <span className="text-sm font-medium text-destructive">Đăng xuất</span>
          </button>
        </SectionRow>
      </Section>

      {/* ── Edit name modal ──────────────────────────────────────────────────── */}
      <Modal variant="center" open={editNameOpen} onClose={() => setEditNameOpen(false)} title="Đổi tên hiển thị">
        <form onSubmit={nameForm.handleSubmit(onSaveName)} className="p-4 space-y-4">
          <FormField
            label="Tên hiển thị"
            error={nameForm.formState.errors.displayName?.message}
            required
          >
            <Input
              {...nameForm.register('displayName')}
              autoFocus
              placeholder="Nhập tên của bạn"
            />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setEditNameOpen(false)}>Hủy</Button>
            <Button type="submit" loading={savingName}>Lưu</Button>
          </div>
        </form>
      </Modal>

      {/* ── Change password modal ─────────────────────────────────────────────── */}
      <Modal variant="center" open={changePassOpen} onClose={() => setChangePassOpen(false)} title="Đổi mật khẩu">
        <form onSubmit={passForm.handleSubmit(onSavePassword)} className="p-4 space-y-4">
          <FormField
            label="Mật khẩu hiện tại"
            error={passForm.formState.errors.currentPassword?.message}
            required
          >
            <PasswordInput {...passForm.register('currentPassword')} autoFocus />
          </FormField>
          <FormField
            label="Mật khẩu mới"
            error={passForm.formState.errors.newPassword?.message}
            required
          >
            <PasswordInput {...passForm.register('newPassword')} />
          </FormField>
          <FormField
            label="Xác nhận mật khẩu mới"
            error={passForm.formState.errors.confirmPassword?.message}
            required
          >
            <PasswordInput {...passForm.register('confirmPassword')} />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setChangePassOpen(false)}>Hủy</Button>
            <Button type="submit" loading={savingPass}>Đổi mật khẩu</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}