'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Props & State ────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children:  React.ReactNode
  /** Custom fallback — nếu không truyền dùng DefaultErrorFallback */
  fallback?: React.ReactNode
  /** Callback khi có lỗi — dùng để log lên error tracker */
  onError?:  (error: Error, info: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error?:   Error
}

// ─── Class component ──────────────────────────────────────────────────────────

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error.message, info.componentStack)
    this.props.onError?.(error, info)
  }

  reset = () => this.setState({ hasError: false, error: undefined })

  render() {
    if (!this.state.hasError) return this.props.children

    return this.props.fallback ?? (
      <DefaultErrorFallback error={this.state.error} reset={this.reset} />
    )
  }
}

// ─── Default fallback UI ──────────────────────────────────────────────────────

interface DefaultErrorFallbackProps {
  error?: Error
  reset:  () => void
  /** Hiện khi dùng làm inline fallback trong card/section */
  compact?: boolean
}

export function DefaultErrorFallback({ error, reset, compact }: DefaultErrorFallbackProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <span className="flex-1 text-sm text-destructive">
          {error?.message ?? 'Có lỗi xảy ra'}
        </span>
        <button
          onClick={reset}
          className="text-xs text-destructive underline hover:no-underline"
        >
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">Có lỗi xảy ra</h3>
        {error?.message && (
          <p className="text-sm text-muted-foreground max-w-xs">{error.message}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={reset} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
        Thử lại
      </Button>
    </div>
  )
}

// ─── HOC helper ───────────────────────────────────────────────────────────────

/**
 * Bọc một component với ErrorBoundary.
 *
 * @example
 * const SafeExpensesTab = withErrorBoundary(ExpensesTab)
 */
export function withErrorBoundary<P extends object>(
  Component:  React.ComponentType<P>,
  options?: {
    fallback?: React.ReactNode
    onError?:  (error: Error, info: React.ErrorInfo) => void
    compact?:  boolean
  },
) {
  const Wrapped = (props: P) => (
    <ErrorBoundary
      fallback={
        options?.fallback ??
        <DefaultErrorFallback
          error={undefined}
          reset={() => {}}
          compact={options?.compact}
        />
      }
      onError={options?.onError}
    >
      <Component {...props} />
    </ErrorBoundary>
  )
  Wrapped.displayName = `WithErrorBoundary(${Component.displayName ?? Component.name ?? 'Component'})`
  return Wrapped
}
