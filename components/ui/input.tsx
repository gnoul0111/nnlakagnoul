import * as React from 'react'
import { cn } from '@/lib/utils/cn'

// ─── Input ────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type, ...props }, ref) => {
    // Date/month/time inputs có picker hệ thống, không gõ tay → iOS không auto-zoom
    // Dùng size nhỏ hơn cho gọn giao diện
    const isDateType = type === 'date' || type === 'month' || type === 'time' || type === 'datetime-local'

    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex w-full rounded-lg border bg-background px-3 py-2',
          'text-foreground placeholder:text-muted-foreground',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isDateType
            ? 'h-10 text-sm'
            : 'h-12 md:h-10 text-base md:text-sm',
          error
            ? 'border-destructive focus-visible:ring-destructive/40'
            : 'border-input hover:border-ring/50',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

// ─── FormField — label + input + error message ────────────────────────────────

interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}

function FormField({ label, error, required, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 5zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

// ─── PasswordInput — input text/password toggle ───────────────────────────────

interface PasswordInputProps extends Omit<InputProps, 'type'> {}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false)
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {show ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'

export { Input, FormField, PasswordInput }